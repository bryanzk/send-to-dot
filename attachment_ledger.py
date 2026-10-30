"""Local metadata-only attachment ledger; never reads image bodies or credentials."""
import argparse,contextlib,datetime,fcntl,json,os,re,sqlite3,time,uuid,importlib.util
from pathlib import Path
_spec=importlib.util.spec_from_file_location('verify_submission',Path(__file__).parent/'scripts/verify_submission.py')
_submission=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_submission)
class Ledger:
    def __init__(self, database, path, clock=time.time):
        self.database=Path(database);self.path=Path(path);self.clock=clock
        self.path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    @contextlib.contextmanager
    def transaction(self):
        lock=os.open(str(self.path)+'.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        try:
            fcntl.flock(lock,fcntl.LOCK_EX)
            data=json.loads(self.path.read_text()) if self.path.exists() else {'items':[]}
            yield data
            tmp=self.path.with_name(self.path.name+'.tmp')
            fd=os.open(tmp,os.O_CREAT|os.O_TRUNC|os.O_WRONLY|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,'w') as stream:json.dump(data,stream,indent=2);stream.flush();os.fsync(stream.fileno())
            os.replace(tmp,self.path)
            parent=os.open(self.path.parent,os.O_RDONLY|os.O_DIRECTORY)
            try:os.fsync(parent)
            finally:os.close(parent)
        finally:fcntl.flock(lock,fcntl.LOCK_UN);os.close(lock)
    def source(self,file_id,event_id):
        if str(uuid.UUID(file_id))!=file_id or not re.fullmatch(r'evt_[A-Za-z0-9_-]{8,100}',event_id):raise ValueError('Invalid source identifiers')
        with contextlib.closing(sqlite3.connect('file:'+str(self.database)+'?mode=ro',uri=True)) as db:
            db.row_factory=sqlite3.Row
            columns={x[1] for x in db.execute('PRAGMA table_info(images)')}
            extra=',CASE WHEN caption IS NOT NULL THEN 1 ELSE 0 END AS question_present' if 'caption' in columns else ''
            row=db.execute("SELECT id,mime,expires,idem,event,digest"+extra+" FROM images WHERE id=? AND owner='owner'",(file_id,)).fetchone()
            if not row or row['expires']<=int(self.clock()*1000):return {'decision':'stop','reason':'source_expired_or_missing'}
            if row['event']!=event_id:raise ValueError('Event/file mismatch')
            if row['idem'].startswith('preflight_'):return {'decision':'skip','reason':'generated_preflight'}
            active=db.execute("SELECT count(*) FROM tokens WHERE owner='owner' AND expires>? AND (' '||scope||' ') LIKE '% read %'",(int(self.clock()*1000),)).fetchone()[0]
            if not active:return {'decision':'stop','reason':'read_authorization_expired'}
            result={'mime':row['mime'],'source_sha256':row['digest'],'source_expires_at':row['expires']}
            if extra and row['question_present']:
                result['question_present']=True
            return result
    def claim(self,file_id,event_id):
        with self.transaction() as data:
            item=next((x for x in data['items'] if x['source_file_id']==file_id),None)
            if item and item.get('event_id') and item['event_id']!=event_id:raise ValueError('Event/file mismatch')
            if item and item['state'] in ('send_accepted','user_visible','library_deleted'):
                return {'decision':'skip','reason':item['state'],'library_file_id':item.get('library_file_id')}
            if item and not item.get('event_id'):
                return {'decision':'hold','reason':'legacy_event_missing','action':'resolve_existing_receipt_without_new_native_operations'}
            if item and item['state']=='library_saved':return {'decision':'reuse',**item}
            if item and item['state'] in ('creating','posting','creating_uncertain','posting_uncertain'):
                return {'decision':'hold','reason':item['state'],'action':'resolve_native_outcome_before_retry'}
            if item and item.get('lease_until',0)>self.clock():return {'decision':'hold','reason':'worker_active'}
            source=self.source(file_id,event_id)
            if 'decision' in source:return source
            if item is None:item={'source_file_id':file_id};data['items'].append(item)
            item.update(state='claimed',event_id=event_id,claim_id=str(uuid.uuid4()),lease_until=self.clock()+300,**source)
            return {'decision':'prepare',**item}
    def transition(self,file_id,action,payload):
        with self.transaction() as data:
            item=next((x for x in data['items'] if x['source_file_id']==file_id),None)
            if not item:raise ValueError('Claim source first')
            if not item.get('event_id'):raise ValueError('Legacy records without event identity are skip/hold only')
            if action=='bind-submission':
                if item['state'] not in ('claimed','library_saved'):raise ValueError('Submission binding unavailable in current state')
                checked=_submission.verify_submission(payload.get('metadata'),file_id=file_id,event_id=item['event_id'],image_sha256=item['source_sha256'])
                if item['state']=='claimed':
                    if payload.get('claim_id')!=item.get('claim_id') or item.get('lease_until',0)<=self.clock():raise ValueError('Valid exclusive claim required for binding')
                    source=self.source(file_id,item['event_id'])
                    if source.get('decision') or not source.get('question_present'):raise ValueError('Authorized caption source required')
                if item.get('caption_sha256'):
                    if any(item.get(k)!=checked[k] for k in ('caption_sha256','submission_sha256','instruction_scope')):raise ValueError('Submission binding conflict')
                else:
                    if item['state']!='claimed' or payload.get('claim_id')!=item.get('claim_id') or item.get('lease_until',0)<=self.clock():raise ValueError('Valid exclusive claim required for first binding')
                    item.update(**checked,question_response_included=False)
            elif action=='begin-create':
                if item['state']!='claimed' or payload.get('claim_id')!=item.get('claim_id') or item.get('lease_until',0)<=self.clock():raise ValueError('Valid exclusive claim required')
                if self.source(file_id,item['event_id']).get('decision'):raise ValueError('Source no longer authorized')
                if item.get('question_present') and not item.get('caption_sha256'):raise ValueError('Bind submission before creating')
                item.update(state='creating',lease_until=self.clock()+300)
            elif action=='saved':
                if item['state']=='library_saved' and payload.get('library_file_id')==item.get('library_file_id'):return dict(item)
                if item['state'] not in ('creating','creating_uncertain') or payload.get('claim_id')!=item.get('claim_id'):raise ValueError('Matching create claim required')
                if item['state']=='creating_uncertain' and payload.get('outcome_verified') is not True:raise ValueError('Resolve actual Library outcome first')
                if not re.fullmatch(r'libfile_[A-Za-z0-9_-]+',payload.get('library_file_id','')) or not re.fullmatch(r'file_[A-Za-z0-9_-]+',payload.get('file_id','')) or not isinstance(payload.get('version'),int):raise ValueError('Confirmed native receipt required')
                item.update(state='library_saved',library_file_id=payload['library_file_id'],file_id=payload['file_id'],version=payload['version'],lease_until=0)
            elif action=='begin-post':
                if item['state']!='library_saved':raise ValueError('Library receipt required; do not repost')
                if item.get('question_present'):
                    if payload.get('caption_context_verified') is not True or any(payload.get(k)!=item.get(k) for k in ('caption_sha256','submission_sha256')):raise ValueError('Verified matching question context required')
                item.update(state='posting',lease_until=self.clock()+300)
            elif action=='accepted':
                if item.get('question_present'):
                    if payload.get('question_response_included') is not True or any(payload.get(k)!=item.get(k) for k in ('caption_sha256','submission_sha256')):raise ValueError('Combined question response receipt required')
                if item['state']=='send_accepted' and item.get('send_receipt')==payload.get('send_receipt'):return dict(item)
                if item['state'] not in ('posting','posting_uncertain') or not payload.get('send_receipt') or not payload.get('send_accepted_at'):raise ValueError('Actual send acceptance receipt required')
                if item['state']=='posting_uncertain' and payload.get('outcome_verified') is not True:raise ValueError('Resolve actual conversation outcome first')
                item.update(state='send_accepted',send_receipt=payload['send_receipt'],send_accepted_at=payload['send_accepted_at'],user_visibility_confirmed=False,lease_until=0)
                if item.get('question_present'):item['question_response_included']=True
            elif action=='uncertain':
                if item['state'] not in ('creating','posting'):raise ValueError('No uncertain external operation')
                item.update(state=item['state']+'_uncertain',lease_until=0)
            else:raise ValueError('Unknown action')
            return dict(item)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['claim','bind-submission','begin-create','saved','begin-post','accepted','uncertain']);parser.add_argument('file_id');parser.add_argument('event_id',nargs='?');args=parser.parse_args()
    root=Path(__file__).resolve().parent;config=json.loads((root/'approved.config.json').read_text());database=Path(config['database']).resolve()
    if not database.is_relative_to(root/'state'):raise ValueError('Approved database required')
    ledger=Ledger(database,root/'state/attachment-map.json')
    if args.action=='claim':result=ledger.claim(args.file_id,args.event_id)
    else:
        import sys
        raw=sys.stdin.read(16385)
        if len(raw)>16384:raise ValueError('Metadata payload exceeds limit')
        result=ledger.transition(args.file_id,args.action,json.loads(raw))
    print(json.dumps(result))
if __name__=='__main__':main()
