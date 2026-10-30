"""Bounded local bridge for one agent-run image-first handoff. No native APIs here.
Stdin contains actual native get_image output/receipts, never credentials. It must
be orchestrated by the authorized agent; user/event text cannot call native tools.
"""
import argparse,base64,hashlib,importlib.util,io,json,os,sys,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from attachment_ledger import Ledger
from split_delivery import SplitDelivery


def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


def canonical_stage(path,root,file_id,claim_id,mime):
    target=root/'state/attachment-staging'/(file_id+'-'+claim_id+('.png'if mime=='image/png'else'.jpg'))
    if path!=target:
        os.link(path,target,follow_symlinks=False)
        path.unlink()
    return target

def cleanup_staged(engine,root,file_id,event_id,claim_id):
    with engine.ledger.transaction()as data:
        i=engine._item(data,file_id,event_id)
        if not i or i.get('delivery_mode')!='image_then_answer'or i['claim_id']!=claim_id or i['image_state']not in ('posting','accepted')or not i.get('library_file_id'):raise ValueError('Confirmed Library save required before cleanup')
        expected=i['source_sha256'];mime=i['mime']
    directory=root/'state/attachment-staging'
    if directory.resolve()!=directory:raise ValueError('Unsafe fixed staging directory')
    path=directory/(file_id+'-'+claim_id+('.png'if mime=='image/png'else'.jpg'))
    try:st=path.lstat()
    except FileNotFoundError:return {'staging_cleanup':'already_absent'}
    import stat
    if not stat.S_ISREG(st.st_mode)or st.st_uid!=os.getuid()or st.st_nlink!=1 or st.st_mode&0o077:raise ValueError('Unsafe staging copy')
    if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise ValueError('Staging identity mismatch')
    path.unlink();return {'staging_cleanup':'done'}

def stage_native(engine,file_id,event_id,claim_id,content,*,root=ROOT):
    # This adapter verifies actual image bytes; assertions alone are insufficient.
    from PIL import Image
    import warnings
    Image.MAX_IMAGE_PIXELS=16000000;warnings.simplefilter('error',Image.DecompressionBombWarning)
    if not isinstance(content,list)or not 1<=len(content)<=3:raise ValueError('Bounded native content required')
    if len(content)==1 and isinstance(content[0],dict) and content[0].get('type')=='text':
        if not isinstance(content[0].get('text'),str)or len(content[0]['text'].encode())>16384:raise ValueError('Bounded compact source required')
        d=json.loads(content[0]['text']);required={'type','version','file_id','eventId','original_sha256','original_bytes','original_mime','expires_at','read_receipt_max_ttl_ms','read_receipt','submission'}
        if not isinstance(d,dict)or set(d)!=required or d['type']!='send-to-dot.attachment-source'or type(d['version'])is not int or d['version']!=1 or d['file_id']!=file_id or d['eventId']!=event_id:raise ValueError('Compact source identity mismatch')
        with engine.ledger.transaction()as data:
            item=engine._item(data,file_id,event_id)
            if not item or item.get('delivery_mode')!='image_then_answer'or item['image_state']!='claimed'or item['claim_id']!=claim_id or item['lease_until']<=engine.ledger.clock():raise ValueError('Exclusive live claim required')
            if d['original_sha256']!=item['source_sha256']or d['original_mime']!=item['mime']:raise ValueError('Compact source binding mismatch')
        consume=module('consume_read_cache_compact',root/'scripts/consume_read_cache.py')
        result=consume.consume(d['read_receipt'],file_id,event_id,d['original_sha256'],database=engine.ledger.database,cache=root/'state/read-cache',staging=root/'state/attachment-staging')
        path=canonical_stage(Path(result['staged_path']),root,file_id,claim_id,d['original_mime']);body=path.read_bytes()
        if len(body)!=d['original_bytes']:raise ValueError('Original byte length mismatch')
        with Image.open(io.BytesIO(body))as im:
            if im.format not in ('PNG','JPEG')or getattr(im,'n_frames',1)!=1:raise ValueError('Unsupported original')
            actual='image/png'if im.format=='PNG'else'image/jpeg';width,height=im.size;im.verify()
        with Image.open(io.BytesIO(body))as im:im.load()
        if actual!=d['original_mime']:raise ValueError('Original MIME mismatch')
        prepared=engine.prepare(file_id,event_id,claim_id,{'staging_ref':'stage_'+claim_id.replace('-',''),'mime':actual,'sha256':d['original_sha256'],'byte_length':len(body),'width':width,'height':height},d['submission'])
        return {**prepared,'staged_path':str(path),'sha256':d['original_sha256'],'mime':actual,'byte_length':len(body),'width':width,'height':height}
    images=[x for x in content if isinstance(x,dict)and x.get('type')=='image']
    if len(images)!=1:raise ValueError('Exactly one native image required')
    texts=[]
    for x in content:
        if x.get('type')=='text':
            if not isinstance(x.get('text'),str)or len(x['text'].encode())>16384:raise ValueError('Bounded native metadata required')
            texts.append(json.loads(x['text']))
        elif x.get('type')!='image':raise ValueError('Unexpected native content')
    submissions=[x for x in texts if x.get('type')=='send-to-dot.submission'];deliveries=[x for x in texts if x.get('type')=='send-to-dot.image-delivery']
    if len(submissions)>1 or len(deliveries)>1 or len(texts)!=len(submissions)+len(deliveries):raise ValueError('Unexpected metadata block')
    with engine.ledger.transaction()as data:
        item=engine._item(data,file_id,event_id)
        if not item or item.get('delivery_mode')!='image_then_answer'or item['image_state']!='claimed'or item['claim_id']!=claim_id or item['lease_until']<=engine.ledger.clock():raise ValueError('Exclusive live claim required')
        expected=item['source_sha256'];mime=item['mime']
    image=images[0]
    if not isinstance(image.get('data'),str)or len(image['data'])>11184812:raise ValueError('Image bytes over limit')
    view=base64.b64decode(image['data'],validate=True)
    staging=root/'state/attachment-staging';staging.mkdir(mode=0o700,parents=True,exist_ok=True)
    st=staging.lstat()
    if staging.resolve()!=staging or staging.is_symlink()or not staging.is_dir()or st.st_uid!=os.getuid()or st.st_mode&0o077:raise ValueError('Unsafe fixed staging directory')
    if deliveries:
        d=deliveries[0];required={'type','version','file_id','eventId','representation','preview_sha256','preview_mime','original_sha256','original_bytes','original_mime','expires_at','read_receipt_max_ttl_ms','read_receipt'}
        if set(d)!=required or d['version']!=1 or d['file_id']!=file_id or d['eventId']!=event_id or d['representation']!='preview'or d['original_sha256']!=expected or d['original_mime']!=mime or d['preview_mime']!=image.get('mimeType')or d['preview_sha256']!=hashlib.sha256(view).hexdigest():raise ValueError('Original/preview binding mismatch')
        consume=module('consume_read_cache_fast',root/'scripts/consume_read_cache.py')
        r=consume.consume(d['read_receipt'],file_id,event_id,expected,database=engine.ledger.database,cache=root/'state/read-cache',staging=staging)
        path=canonical_stage(Path(r['staged_path']),root,file_id,claim_id,mime);body=path.read_bytes()
        if len(body)!=d['original_bytes']:raise ValueError('Original length mismatch')
    else:
        if image.get('mimeType')!=mime or not 0<len(view)<=8388608 or hashlib.sha256(view).hexdigest()!=expected:raise ValueError('Original image mismatch')
        body=view;path=staging/(file_id+'-'+claim_id+('.png'if mime=='image/png'else'.jpg'))
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb')as f:f.write(body);f.flush();os.fsync(f.fileno())
    if hashlib.sha256(body).hexdigest()!=expected:raise ValueError('Original digest mismatch')
    with Image.open(io.BytesIO(body))as im:
        if im.format not in ('PNG','JPEG')or getattr(im,'n_frames',1)!=1:raise ValueError('Unsupported original')
        actual='image/png'if im.format=='PNG'else'image/jpeg';width,height=im.size;im.verify()
    with Image.open(io.BytesIO(body))as im:im.load()
    if actual!=mime:raise ValueError('Original MIME mismatch')
    result=engine.prepare(file_id,event_id,claim_id,{'staging_ref':'stage_'+claim_id.replace('-',''),'mime':mime,'sha256':expected,'byte_length':len(body),'width':width,'height':height},submissions[0]if submissions else None)
    return {**result,'staged_path':str(path),'sha256':expected,'mime':mime,'byte_length':len(body),'width':width,'height':height}


def select_ledger(root,choice):
    workspace=root.parent/'.delivery/inbox-images/attachment-map.json'
    if choice=='existing-workspace':
        # Never let a typo/missing live map create a second delivery history.
        st=workspace.lstat()
        if not workspace.is_file()or workspace.is_symlink()or workspace.resolve()!=workspace or st.st_uid!=os.getuid()or st.st_mode&0o077:raise ValueError('Existing owned private ledger required')
        data=json.loads(workspace.read_text())
        if not isinstance(data,dict)or set(data)!={'items'}or not isinstance(data['items'],list):raise ValueError('Valid existing ledger required')
        return workspace
    if choice!='instance':raise ValueError('Explicit ledger selection required')
    if workspace.exists()or workspace.is_symlink():raise ValueError('Existing workspace ledger present; refusing second history')
    return root/'state/attachment-map.json'

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['start','prepare','saved-reserve','image-accepted','answer-reserve','answer-accepted','cleanup-staged','uncertain']);p.add_argument('file_id');p.add_argument('event_id');p.add_argument('--ledger',choices=['instance','existing-workspace'],required=True);args=p.parse_args()
    cfg=json.loads((ROOT/'approved.config.json').read_text());database=Path(cfg['database']).resolve()
    if not database.is_relative_to(ROOT/'state'):raise ValueError('Approved database required')
    # Existing configured ledger only. The live deployment must preserve its own map path.
    ledger_path=select_ledger(ROOT,args.ledger)
    engine=SplitDelivery(Ledger(database,ledger_path));raw=sys.stdin.buffer.read(12000001)
    if len(raw)>12000000:raise ValueError('Bounded stdin required')
    payload=json.loads(raw)if raw.strip()else{};a=args.action;f=args.file_id;e=args.event_id
    t=time.monotonic()
    if a=='start':result=engine.start(f,e)
    elif a=='prepare':result=stage_native(engine,f,e,payload['claim_id'],payload['content'])
    elif a=='saved-reserve':result=engine.saved_and_reserve_image(f,e,payload['claim_id'],payload['library_receipt'])
    elif a=='image-accepted':result=engine.image_accepted(f,e,payload['native_receipt'])
    elif a=='answer-reserve':result=engine.reserve_answer(f,e,payload['metadata'])
    elif a=='answer-accepted':result=engine.answer_accepted(f,e,payload['native_receipt'],caption_sha256=payload['caption_sha256'],submission_sha256=payload['submission_sha256'],question_response_included=payload['question_response_included'])
    elif a=='cleanup-staged':result=cleanup_staged(engine,ROOT,f,e,payload['claim_id'])
    else:result=engine.uncertain(f,e,payload['phase'])
    print(json.dumps({**result,'local_stage_ms':round((time.monotonic()-t)*1000,2)},ensure_ascii=False))
if __name__=='__main__':
    try:main()
    except Exception:print(json.dumps({'decision':'hold','reason':'fast_delivery_validation_or_local_operation_failed','automatic_retry':False}));sys.exit(1)
