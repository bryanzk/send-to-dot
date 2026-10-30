"""Local image-first state machine. Native Library/chat actions stay in the agent.
No credentials or caption text are persisted. No live configuration is changed.
"""
import datetime,re,uuid
from attachment_ledger import Ledger
from scripts.verify_submission import verify_submission

TERMINAL={'send_accepted','user_visible','library_deleted'}

def receipt(value):
    if not isinstance(value,dict) or set(value)!={'message_id','accepted_at'}:raise ValueError('Actual native receipt required')
    if not isinstance(value['message_id'],str) or not 1<=len(value['message_id'])<=200:raise ValueError('Invalid message receipt')
    t=value['accepted_at']
    if not isinstance(t,str) or len(t)>64 or datetime.datetime.fromisoformat(t.replace('Z','+00:00')).tzinfo is None:raise ValueError('Timestamp with timezone required')
    return dict(value)

class SplitDelivery:
    def __init__(self,ledger):self.ledger=ledger
    def _item(self,data,file_id,event_id):
        if str(uuid.UUID(file_id))!=file_id or not re.fullmatch(r'evt_[A-Za-z0-9_-]{8,100}',event_id):raise ValueError('Invalid event identity')
        item=next((x for x in data['items']if x['source_file_id']==file_id),None)
        if item and item.get('event_id') and item['event_id']!=event_id:raise ValueError('Event identity mismatch')
        return item
    def _source(self,file_id,event_id):
        s=self.ledger.source(file_id,event_id)
        return s
    def start(self,file_id,event_id):
        with self.ledger.transaction() as data:
            item=self._item(data,file_id,event_id)
            if item and item['state']in TERMINAL:return {'decision':'skip','reason':item['state']}
            if item and not item.get('event_id'):return {'decision':'hold','reason':'legacy_event_missing'}
            if item and item.get('delivery_mode')!='image_then_answer':return {'decision':'hold','reason':'existing_legacy_operation'}
            if item and item['image_state']=='accepted':
                return {'decision':'answer_pending' if item['answer_state']in ('pending','paused_unverified')else'hold','answer_state':item['answer_state'],'library_file_id':item['library_file_id']}
            if item and (item['image_state']!='claimed' or item['lease_until']>self.ledger.clock()):return {'decision':'hold','reason':item['image_state']}
            source=self._source(file_id,event_id)
            if source.get('decision'):return source
            claim=str(uuid.uuid4())
            if item is None:
                item={'source_file_id':file_id,'event_id':event_id};data['items'].append(item)
            item.update(state='split_active',delivery_mode='image_then_answer',image_state='claimed',answer_state='pending'if source.get('question_present')else'not_requested',claim_id=claim,lease_until=self.ledger.clock()+300,**source)
            item.pop('staged_source',None)
            return {'decision':'read_source','claim_id':claim,**source}
    def prepare(self,file_id,event_id,claim_id,staged_source,metadata=None):
        # The native adapter must verify/stage bytes before this bounded metadata call.
        required={'staging_ref','mime','sha256','byte_length','width','height'}
        if not isinstance(staged_source,dict)or set(staged_source)!=required:raise ValueError('Exact staged receipt required')
        if not re.fullmatch(r'stage_[A-Za-z0-9_-]{8,100}',staged_source['staging_ref']):raise ValueError('Opaque staging reference required')
        for k in ['byte_length','width','height']:
            if type(staged_source[k])is not int or staged_source[k]<=0:raise ValueError('Positive image bounds required')
        if staged_source['byte_length']>8388608 or staged_source['width']*staged_source['height']>16000000:raise ValueError('Image limits exceeded')
        with self.ledger.transaction() as data:
            i=self._item(data,file_id,event_id)
            if not i or i.get('delivery_mode')!='image_then_answer'or i['image_state']!='claimed'or i['claim_id']!=claim_id or i['lease_until']<=self.ledger.clock():raise ValueError('Exclusive live claim required')
            s=self._source(file_id,event_id)
            if s.get('decision'):return s
            if staged_source['sha256']!=i['source_sha256']or staged_source['mime']!=i['mime']:raise ValueError('Image source mismatch')
            if i.get('question_present'):
                try:
                    bound=verify_submission(metadata,file_id=file_id,event_id=event_id,image_sha256=i['source_sha256'])
                    if i.get('caption_sha256')and any(i[k]!=bound[k]for k in ['caption_sha256','submission_sha256']):raise ValueError('Binding conflict')
                    i.update(bound);i['answer_state']='pending'
                except (ValueError,TypeError,KeyError):i['answer_state']='paused_unverified'
            elif metadata is not None:raise ValueError('Unexpected question metadata')
            i.update(image_state='creating',staged_source=dict(staged_source),lease_until=self.ledger.clock()+300)
            return {'decision':'save_original_once','claim_id':claim_id,'answer_state':i['answer_state']}
    def saved_and_reserve_image(self,file_id,event_id,claim_id,library):
        if not isinstance(library,dict)or set(library)!={'library_file_id','file_id','version'}:raise ValueError('Actual Library receipt required')
        if not re.fullmatch(r'libfile_[A-Za-z0-9_-]+',library['library_file_id'])or not re.fullmatch(r'file_[A-Za-z0-9_-]+',library['file_id'])or type(library['version'])is not int or library['version']<0:raise ValueError('Invalid Library receipt')
        with self.ledger.transaction() as data:
            i=self._item(data,file_id,event_id)
            if not i or i.get('delivery_mode')!='image_then_answer'or i['image_state']!='creating'or i['claim_id']!=claim_id:raise ValueError('Matching create state required; never recreate or repost')
            # One lock/replace: no observable library_saved -> posting race.
            i.update(**library,image_state='posting',lease_until=self.ledger.clock()+300)
            return {'decision':'send_image_once','library_file_id':i['library_file_id'],'answer_state':i['answer_state'],'user_visible_confirmed':False}
    def image_accepted(self,file_id,event_id,native_receipt):
        r=receipt(native_receipt)
        with self.ledger.transaction() as data:
            i=self._item(data,file_id,event_id)
            if not i or i.get('delivery_mode')!='image_then_answer':raise ValueError('Split image state required')
            if i['image_state']=='accepted':
                if i.get('image_send_receipt')!=r:raise ValueError('Conflicting image receipt')
                return {'decision':'skip_image','answer_state':i['answer_state']}
            if i['image_state']!='posting':raise ValueError('Image is not reserved; uncertain outcome needs reconciliation')
            i.update(image_state='accepted',image_send_receipt=r,lease_until=0,user_visibility_confirmed=False)
            if i['answer_state']=='not_requested':i.update(state='send_accepted',send_receipt=r['message_id'],send_accepted_at=r['accepted_at'])
            return {'decision':'answer_pending'if i['answer_state']=='pending'else i['answer_state'],'image_send_accepted':True,'user_visible_confirmed':False}
    def reserve_answer(self,file_id,event_id,metadata):
        with self.ledger.transaction() as data:
            i=self._item(data,file_id,event_id)
            if not i or i.get('delivery_mode')!='image_then_answer'or i['image_state']!='accepted':raise ValueError('Image acceptance required first')
            if i['answer_state']in ('accepted','not_requested'):return {'decision':'skip_answer'}
            if i['answer_state']not in ('pending','paused_unverified'):return {'decision':'hold','reason':i['answer_state']}
            s=self._source(file_id,event_id)
            if s.get('decision'):return {'decision':'hold','reason':'question_context_unavailable'}
            bound=verify_submission(metadata,file_id=file_id,event_id=event_id,image_sha256=i['source_sha256'])
            if i.get('caption_sha256')and any(i[k]!=bound[k]for k in ['caption_sha256','submission_sha256']):raise ValueError('Question binding conflict')
            i.update(bound,answer_state='posting',answer_lease_until=self.ledger.clock()+300)
            return {'decision':'send_answer_once',**bound}
    def answer_accepted(self,file_id,event_id,native_receipt,*,caption_sha256,submission_sha256,question_response_included):
        r=receipt(native_receipt)
        with self.ledger.transaction() as data:
            i=self._item(data,file_id,event_id)
            if not i or i.get('delivery_mode')!='image_then_answer'or i['image_state']!='accepted':raise ValueError('Image acceptance required')
            if question_response_included is not True or i.get('caption_sha256')!=caption_sha256 or i.get('submission_sha256')!=submission_sha256:raise ValueError('Verified question answer receipt required')
            if i['answer_state']=='accepted':
                if i.get('answer_send_receipt')!=r:raise ValueError('Conflicting answer receipt')
                return {'decision':'skip_answer'}
            if i['answer_state']!='posting':raise ValueError('Answer not reserved or uncertain')
            i.update(answer_state='accepted',answer_send_receipt=r,question_response_included=True,state='send_accepted',send_receipt=r['message_id'],send_accepted_at=r['accepted_at'],answer_lease_until=0,user_visibility_confirmed=False)
            return {'decision':'complete','image_send_accepted':True,'answer_send_accepted':True,'user_visible_confirmed':False}
    def uncertain(self,file_id,event_id,phase):
        if phase not in ('image','answer'):raise ValueError('Select image or answer phase')
        with self.ledger.transaction() as data:
            i=self._item(data,file_id,event_id);key=phase+'_state'
            if not i or i.get('delivery_mode')!='image_then_answer'or i[key]not in ('creating','posting'):raise ValueError('No active external operation')
            i[key]+='_uncertain';i['lease_until']=0
            return {'decision':'hold','reason':i[key]}
