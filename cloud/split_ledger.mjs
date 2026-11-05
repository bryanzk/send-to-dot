// Port of split_delivery.py (+ Ledger.source and the attachment-fast.py adapter) onto the
// inbox's own SQLite. Same states, dedup, leases (seconds) and hold rules; the image bytes are
// verified in-process instead of through a staging copy, so there is nothing to clean up.
import {createHash,randomUUID} from 'node:crypto';
import {checkImage} from './image_check.mjs';
import {verifySubmission} from './verify_submission.mjs';
const TERMINAL=new Set(['send_accepted','user_visible','library_deleted']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail=m=>{throw Error(m);};
function receipt(v){
  if(!v||typeof v!=='object'||Object.keys(v).sort().join()!=='accepted_at,message_id')fail('Actual native receipt required');
  if(typeof v.message_id!=='string'||v.message_id.length<1||v.message_id.length>200)fail('Invalid message receipt');
  const t=v.accepted_at;if(typeof t!=='string'||t.length>64||!/(Z|[+-]\d\d:\d\d)$/.test(t)||Number.isNaN(Date.parse(t)))fail('Timestamp with timezone required');
  return {message_id:v.message_id,accepted_at:t};
}
function library(v){
  if(!v||typeof v!=='object'||Object.keys(v).sort().join()!=='file_id,library_file_id,version')fail('Actual Library receipt required');
  if(!/^libfile_[A-Za-z0-9_-]+$/.test(v.library_file_id)||!/^file_[A-Za-z0-9_-]+$/.test(v.file_id)||!Number.isSafeInteger(v.version)||v.version<0)fail('Invalid Library receipt');
  return {library_file_id:v.library_file_id,file_id:v.file_id,version:v.version};
}
export class SplitLedger {
  constructor(inbox,{clock=()=>Date.now()/1000}={}){
    this.inbox=inbox;this.db=inbox.db;this.clock=clock;
    this.db.exec('CREATE TABLE IF NOT EXISTS ledger(file_id TEXT PRIMARY KEY,seq INTEGER,item TEXT)');
    this.run=this.run.bind(this);
  }
  items(){return this.db.prepare('SELECT item FROM ledger ORDER BY seq').all().map(r=>JSON.parse(r.item));}
  // One item per call, read-modify-write inside the inbox transaction.
  transaction(fileId,eventId,fn){return this.inbox.tx(()=>{
    if(!UUID.test(fileId)||!/^evt_[A-Za-z0-9_-]{8,100}$/.test(eventId))fail('Invalid event identity');
    const r=this.db.prepare('SELECT item FROM ledger WHERE file_id=?').get(fileId);let item=r?JSON.parse(r.item):null;
    if(item&&item.event_id&&item.event_id!==eventId)fail('Event identity mismatch');
    const box={item};const out=fn(box);
    if(box.item){const seq=r?null:(this.db.prepare('SELECT COALESCE(MAX(seq),0)+1 n FROM ledger').get().n);
      if(r)this.db.prepare('UPDATE ledger SET item=? WHERE file_id=?').run(JSON.stringify(box.item),fileId);
      else this.db.prepare('INSERT INTO ledger VALUES(?,?,?)').run(fileId,seq,JSON.stringify(box.item));}
    return out;});}
  source(fileId,eventId){
    const now=Math.floor(this.clock()*1000);
    const row=this.db.prepare("SELECT id,mime,expires,idem,event,digest,CASE WHEN caption IS NOT NULL THEN 1 ELSE 0 END AS q FROM images WHERE id=? AND owner='owner'").get(fileId);
    if(!row||row.expires<=now)return {decision:'stop',reason:'source_expired_or_missing'};
    if(row.event!==eventId)fail('Event/file mismatch');
    if(String(row.idem).startsWith('preflight_'))return {decision:'skip',reason:'generated_preflight'};
    const active=this.db.prepare("SELECT count(*) n FROM tokens WHERE owner='owner' AND expires>? AND (' '||scope||' ') LIKE '% read %'").get(now).n;
    if(!active)return {decision:'stop',reason:'read_authorization_expired'};
    const r={mime:row.mime,source_sha256:row.digest,source_expires_at:row.expires};if(row.q)r.question_present=true;return r;
  }
  start(f,e){return this.transaction(f,e,box=>{const i=box.item;
    if(i&&TERMINAL.has(i.state))return {decision:'skip',reason:i.state};
    if(i&&!i.event_id)return {decision:'hold',reason:'legacy_event_missing'};
    if(i&&i.delivery_mode!=='image_then_answer')return {decision:'hold',reason:'existing_legacy_operation'};
    if(i&&i.image_state==='accepted')return {decision:['pending','paused_unverified'].includes(i.answer_state)?'answer_pending':'hold',answer_state:i.answer_state,library_file_id:i.library_file_id};
    if(i&&(i.image_state!=='claimed'||i.lease_until>this.clock()))return {decision:'hold',reason:i.image_state};
    const s=this.source(f,e);if(s.decision){if(!i)box.item=null;return s;}
    const claim=randomUUID();const item=i??{source_file_id:f,event_id:e};
    Object.assign(item,{state:'split_active',delivery_mode:'image_then_answer',image_state:'claimed',answer_state:s.question_present?'pending':'not_requested',claim_id:claim,lease_until:this.clock()+300,...s});
    delete item.staged_source;box.item=item;
    return {decision:'read_source',claim_id:claim,...s};});}
  prepare(f,e,claimId,image){
    if(!image||!Buffer.isBuffer(image.bytes))fail('Original bytes required');
    const info=checkImage(image.bytes),sha=createHash('sha256').update(image.bytes).digest('hex');
    return this.transaction(f,e,box=>{const i=box.item;
      if(!i||i.delivery_mode!=='image_then_answer'||i.image_state!=='claimed'||i.claim_id!==claimId||i.lease_until<=this.clock())fail('Exclusive live claim required');
      const s=this.source(f,e);if(s.decision)return s;
      if(sha!==i.source_sha256||info.mime!==i.mime||image.mime!==i.mime)fail('Image source mismatch');
      const metadata=image.submission?.caption?image.submission:null;
      if(i.question_present){
        try{const b=verifySubmission(metadata,{fileId:f,eventId:e,imageSha:i.source_sha256});
          if(i.caption_sha256&&(i.caption_sha256!==b.caption_sha256||i.submission_sha256!==b.submission_sha256))fail('Binding conflict');
          Object.assign(i,b);i.answer_state='pending';}catch{i.answer_state='paused_unverified';}
      }else if(metadata)fail('Unexpected question metadata');
      const staged={staging_ref:'stage_'+claimId.replaceAll('-',''),mime:info.mime,sha256:sha,byte_length:image.bytes.length,width:info.width,height:info.height};
      Object.assign(i,{image_state:'creating',staged_source:staged,lease_until:this.clock()+300});
      return {decision:'save_original_once',claim_id:claimId,answer_state:i.answer_state,...staged};});}
  savedAndReserve(f,e,claimId,lib){const l=library(lib);return this.transaction(f,e,box=>{const i=box.item;
    if(!i||i.delivery_mode!=='image_then_answer'||i.image_state!=='creating'||i.claim_id!==claimId)fail('Matching create state required; never recreate or repost');
    Object.assign(i,l,{image_state:'posting',lease_until:this.clock()+300});
    return {decision:'send_image_once',library_file_id:i.library_file_id,answer_state:i.answer_state,user_visible_confirmed:false};});}
  imageAccepted(f,e,native){const r=receipt(native);return this.transaction(f,e,box=>{const i=box.item;
    if(!i||i.delivery_mode!=='image_then_answer')fail('Split image state required');
    if(i.image_state==='accepted'){if(JSON.stringify(i.image_send_receipt)!==JSON.stringify(r))fail('Conflicting image receipt');return {decision:'skip_image',answer_state:i.answer_state};}
    if(i.image_state!=='posting')fail('Image is not reserved; uncertain outcome needs reconciliation');
    Object.assign(i,{image_state:'accepted',image_send_receipt:r,lease_until:0,user_visibility_confirmed:false});
    if(i.answer_state==='not_requested')Object.assign(i,{state:'send_accepted',send_receipt:r.message_id,send_accepted_at:r.accepted_at});
    return {decision:i.answer_state==='pending'?'answer_pending':i.answer_state,image_send_accepted:true,user_visible_confirmed:false};});}
  reserveAnswer(f,e,metadata){return this.transaction(f,e,box=>{const i=box.item;
    if(!i||i.delivery_mode!=='image_then_answer'||i.image_state!=='accepted')fail('Image acceptance required first');
    if(['accepted','not_requested'].includes(i.answer_state))return {decision:'skip_answer'};
    if(!['pending','paused_unverified'].includes(i.answer_state))return {decision:'hold',reason:i.answer_state};
    const s=this.source(f,e);if(s.decision)return {decision:'hold',reason:'question_context_unavailable'};
    const b=verifySubmission(metadata,{fileId:f,eventId:e,imageSha:i.source_sha256});
    if(i.caption_sha256&&(i.caption_sha256!==b.caption_sha256||i.submission_sha256!==b.submission_sha256))fail('Question binding conflict');
    Object.assign(i,b,{answer_state:'posting',answer_lease_until:this.clock()+300});
    return {decision:'send_answer_once',...b};});}
  answerAccepted(f,e,native,{caption_sha256,submission_sha256,question_response_included}){const r=receipt(native);return this.transaction(f,e,box=>{const i=box.item;
    if(!i||i.delivery_mode!=='image_then_answer'||i.image_state!=='accepted')fail('Image acceptance required');
    if(question_response_included!==true||i.caption_sha256!==caption_sha256||i.submission_sha256!==submission_sha256)fail('Verified question answer receipt required');
    if(i.answer_state==='accepted'){if(JSON.stringify(i.answer_send_receipt)!==JSON.stringify(r))fail('Conflicting answer receipt');return {decision:'skip_answer'};}
    if(i.answer_state!=='posting')fail('Answer not reserved or uncertain');
    Object.assign(i,{answer_state:'accepted',answer_send_receipt:r,question_response_included:true,state:'send_accepted',send_receipt:r.message_id,send_accepted_at:r.accepted_at,answer_lease_until:0,user_visibility_confirmed:false});
    return {decision:'complete',image_send_accepted:true,answer_send_accepted:true,user_visible_confirmed:false};});}
  cleanup(f,e,claimId){return this.transaction(f,e,box=>{const i=box.item;
    if(!i||i.delivery_mode!=='image_then_answer'||i.claim_id!==claimId||!['posting','accepted'].includes(i.image_state)||!i.library_file_id)fail('Confirmed Library save required before cleanup');
    return {staging_cleanup:'already_absent'};});}
  uncertain(f,e,phase){if(!['image','answer'].includes(phase))fail('Select image or answer phase');return this.transaction(f,e,box=>{const i=box.item;const k=phase+'_state';
    if(!i||i.delivery_mode!=='image_then_answer'||!['creating','posting'].includes(i[k]))fail('No active external operation');
    i[k]+='_uncertain';i.lease_until=0;return {decision:'hold',reason:i[k]};});}
  reconcile(f,e,{outcome,outcome_verified,library_receipt=null,native_receipt=null}){
    if(outcome_verified!==true)fail('Check the real Library and conversation first');
    if(!['sent','not_created'].includes(outcome))fail('Select sent or not_created');
    return this.transaction(f,e,box=>{const i=box.item;
      if(!i||i.delivery_mode!=='image_then_answer'||!['creating_uncertain','posting_uncertain'].includes(i.image_state))fail('Only an uncertain image can be reconciled');
      if(outcome==='not_created'){
        if(i.image_state!=='creating_uncertain'||library_receipt!==null||native_receipt!==null||i.library_file_id)fail('not_created only applies before any Library save');
        const old=i.claim_id;Object.assign(i,{image_state:'claimed',lease_until:0,reconciled:'not_created'});delete i.staged_source;
        return {decision:'reclaimable',previous_claim_id:old,automatic_retry:false,staging_cleanup:'already_absent'};}
      const r=receipt(native_receipt);
      if(i.library_file_id){if(library_receipt!==null){const l=library(library_receipt);if(i.library_file_id!==l.library_file_id||i.file_id!==l.file_id||i.version!==l.version)fail('Conflicting Library receipt');}}
      else Object.assign(i,library(library_receipt));
      Object.assign(i,{image_state:'accepted',image_send_receipt:r,lease_until:0,user_visibility_confirmed:false,reconciled:'sent'});
      if(i.answer_state==='not_requested')Object.assign(i,{state:'send_accepted',send_receipt:r.message_id,send_accepted_at:r.accepted_at});
      return {decision:i.answer_state==='pending'?'answer_pending':i.answer_state,image_send_accepted:true,reconciled:true,claim_id:i.claim_id,user_visible_confirmed:false};});
  }
  // Same contract as ledger_runner.mjs: resolves {exit,...decision}; failures hold, never retry.
  async run(action,f,e,payload={},extra={}){
    try{let r;
      switch(action){
        case 'start':r=this.start(f,e);break;
        case 'prepare':r=this.prepare(f,e,payload.claim_id,extra.image);break;
        case 'saved-reserve':r=this.savedAndReserve(f,e,payload.claim_id,payload.library_receipt);break;
        case 'image-accepted':r=this.imageAccepted(f,e,payload.native_receipt);break;
        case 'answer-reserve':r=this.reserveAnswer(f,e,payload.metadata);break;
        case 'answer-accepted':r=this.answerAccepted(f,e,payload.native_receipt,payload);break;
        case 'cleanup-staged':r=this.cleanup(f,e,payload.claim_id);break;
        case 'uncertain':r=this.uncertain(f,e,payload.phase);break;
        case 'reconcile':r=this.reconcile(f,e,payload);break;
        default:fail('Unknown action');
      }
      return {exit:0,...r};
    }catch{return {exit:1,decision:'hold',reason:'fast_delivery_validation_or_local_operation_failed',automatic_retry:false};}
  }
  // One-time import of an existing attachment-map.json history (dedup must survive the move).
  importItems(items){return this.inbox.tx(()=>{let n=0;for(const x of items){if(!x||typeof x.source_file_id!=='string')continue;
    const seq=this.db.prepare('SELECT COALESCE(MAX(seq),0)+1 n FROM ledger').get().n;
    n+=this.db.prepare('INSERT OR IGNORE INTO ledger VALUES(?,?,?)').run(x.source_file_id,seq,JSON.stringify(x)).changes;}return {imported:n};});}
}
