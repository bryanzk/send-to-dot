// Dot-native delivery tools: let the original dot claim, save and post an original image
// in ONE agent turn, without a separate engineering hand-off. The canonical delivery ledger
// stays the single source of truth: every state change goes through scripts/attachment-fast.py
// (same SplitDelivery state machine, same dedup, same uncertain/hold rules).
import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {attachmentSource} from './image_delivery.mjs';

export const INLINE_ORIGINAL_LIMIT=4*1024*1024;

export function ledgerRunner({python=process.env.DOT_INBOX_PYTHON??'python3',script=fileURLToPath(new URL('./scripts/attachment-fast.py',import.meta.url)),ledger='existing-workspace',timeoutMs=20000}={}){
 return (action,fileId,eventId,payload={})=>new Promise(resolve=>{
  const child=spawn(python,[script,action,fileId,eventId,'--ledger',ledger],{stdio:['pipe','pipe','ignore']});let out='';
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
  child.stdout.on('data',c=>{if(out.length<65536)out+=c;});
  child.on('error',()=>{});
  child.on('close',code=>{clearTimeout(timer);let r;try{r=JSON.parse(out.trim().split('\n').pop());}catch{r={decision:'hold',reason:'ledger_result_unavailable'};}resolve({exit:code,...r});});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(payload));
 });
}

// One-time original download links: the original never passes through the agent's model
// context. 256-bit random token, single use, short TTL, memory only, never logged.
export class OriginalLinks{
 constructor({ttlMs=120000,clock=Date.now,maxEntries=20}={}){this.ttl=ttlMs;this.clock=clock;this.max=maxEntries;this.items=new Map();}
 sweep(){const now=this.clock();for(const [k,v] of this.items)if(v.expires<=now)this.items.delete(k);}
 issue(bytes,mime,meta){this.sweep();if(this.items.size>=this.max)throw Error('Too many pending downloads');const token=randomBytes(32).toString('base64url');const expires=this.clock()+this.ttl;this.items.set(token,{bytes,mime,meta,expires});const t=setTimeout(()=>this.items.delete(token),this.ttl+1000);t.unref?.();return {token,expires};}
 take(token){this.sweep();if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;const v=this.items.get(token);if(!v)return null;this.items.delete(token);return v.expires>this.clock()?v:null;}
}

const text=obj=>({type:'text',text:JSON.stringify(obj)});
const result=obj=>({content:[text(obj)]});

export function registerDeliveryTools(server,{z,inbox,token,readCache,run=ledgerRunner(),inlineLimit=INLINE_ORIGINAL_LIMIT,audit=()=>{},links=null,origin=null}){
 const ids={file_id:z.string().uuid(),event_id:z.string().regex(/^evt_[A-Za-z0-9_-]{8,100}$/)};
 const ro={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false};
 const sourceFor=(fileId,eventId)=>{const image=inbox.read(token,fileId);if(image.source?.event_id!==eventId)throw Error('Event identity mismatch');return image;};

 server.registerTool('claim_image_delivery',{description:'One-call claim for the original dot: checks the canonical delivery ledger (dedup/hold), and only when this event may be delivered returns the EXACT original image plus a claim_id. Next, in the same turn and without analysing the image: save these exact bytes to the private Library once, then send that Library file once in the original conversation, then call record_image_sent. decision skip/hold/answer_pending/too_large returns no image; never retry a hold.',inputSchema:z.object(ids).strict(),annotations:ro},async p=>{
  const t0=Date.now();const image=sourceFor(p.file_id,p.event_id);
  if(!links&&image.bytes.length>inlineLimit){audit({event:'delivery.claim',outcome:'too_large'});return result({type:'send-to-dot.claim',version:1,decision:'too_large_for_inline',original_bytes:image.bytes.length,inline_limit:inlineLimit,claimed:false,next:'use_existing_controlled_flow'});}
  const start=await run('start',p.file_id,p.event_id,{});
  if(start.decision!=='read_source'){audit({event:'delivery.claim',outcome:start.decision});return result({type:'send-to-dot.claim',version:1,decision:start.decision,reason:start.reason??null,answer_state:start.answer_state??null,library_file_id:start.library_file_id??null,claimed:false});}
  const source=attachmentSource(image,token,readCache);
  const prep=await run('prepare',p.file_id,p.event_id,{claim_id:start.claim_id,content:[text(source)]});
  if(prep.decision!=='save_original_once'){audit({event:'delivery.claim',outcome:'prepare_'+prep.decision});return result({type:'send-to-dot.claim',version:1,decision:'hold',reason:prep.reason??'prepare_failed',claimed:true,claim_id:start.claim_id,automatic_retry:false});}
  audit({event:'delivery.claim',outcome:'claimed',ms:Date.now()-t0});
  if(links){const link=links.issue(image.bytes,image.mime,{file_id:p.file_id,claim_id:start.claim_id,sha256:prep.sha256});
   return result({type:'send-to-dot.claim',version:1,decision:'save_original_once',claimed:true,file_id:p.file_id,eventId:p.event_id,claim_id:start.claim_id,download_url:origin+'/api/original/'+link.token,download_expires_at:new Date(link.expires).toISOString(),single_use:true,original_sha256:prep.sha256,original_bytes:prep.byte_length,original_mime:prep.mime,width:prep.width,height:prep.height,answer_state:prep.answer_state,submission:source.submission,
    next:'In ONE code execution: download download_url once (HTTP GET, no auth header) to a file, verify SHA256 equals original_sha256 and size equals original_bytes, save that file to the private Library once, send it once with library_file_ids, then call record_image_sent. The link works once and expires quickly; never share or print it. On any failure call mark_delivery_uncertain; never re-claim.'});}
  return {content:[{type:'image',data:image.bytes.toString('base64'),mimeType:image.mime},text({type:'send-to-dot.claim',version:1,decision:'save_original_once',claimed:true,file_id:p.file_id,eventId:p.event_id,claim_id:start.claim_id,original_sha256:prep.sha256,original_bytes:prep.byte_length,original_mime:prep.mime,width:prep.width,height:prep.height,answer_state:prep.answer_state,submission:source.submission,
   next:'Write the image block bytes to a file, verify SHA256 equals original_sha256, save to Library once, send once with library_file_ids, then record_image_sent. If anything is uncertain call mark_delivery_uncertain; never re-save or re-send.'})]};
 });

 server.registerTool('record_image_sent',{description:'Record the actual Library receipt and the actual original-conversation message receipt for a claimed image (after sending). Records only; sends nothing.',inputSchema:z.object({...ids,claim_id:z.string().uuid(),library_file_id:z.string().regex(/^libfile_[A-Za-z0-9_-]+$/),library_native_file_id:z.string().regex(/^file_[A-Za-z0-9_-]+$/),library_version:z.number().int().min(0),message_id:z.string().min(1).max(200),accepted_at:z.string().min(10).max(64)}).strict(),annotations:ro},async p=>{
  const saved=await run('saved-reserve',p.file_id,p.event_id,{claim_id:p.claim_id,library_receipt:{library_file_id:p.library_file_id,file_id:p.library_native_file_id,version:p.library_version}});
  if(saved.decision!=='send_image_once')return result({type:'send-to-dot.record',version:1,recorded:false,step:'library',decision:saved.decision,reason:saved.reason??null});
  const acc=await run('image-accepted',p.file_id,p.event_id,{native_receipt:{message_id:p.message_id,accepted_at:p.accepted_at}});
  const cleaned=await run('cleanup-staged',p.file_id,p.event_id,{claim_id:p.claim_id});
  audit({event:'delivery.image_recorded',outcome:acc.image_send_accepted?'ok':'failed'});
  return result({type:'send-to-dot.record',version:1,recorded:acc.image_send_accepted===true,decision:acc.decision,staging_cleanup:cleaned.staging_cleanup??'failed',user_visible_confirmed:false});
 });

 server.registerTool('reserve_answer',{description:'Reserve the single answer message for an image whose image send is already recorded. Returns send_answer_once with the verified question, or skip/hold. Sends nothing.',inputSchema:z.object(ids).strict(),annotations:ro},async p=>{
  const image=sourceFor(p.file_id,p.event_id);
  const r=await run('answer-reserve',p.file_id,p.event_id,{metadata:image.submission.caption?image.submission:null});
  return result({type:'send-to-dot.answer-reservation',version:1,decision:r.decision,reason:r.reason??null,caption:r.decision==='send_answer_once'?image.submission.caption:null,instruction_scope:'image_question_only'});
 });

 server.registerTool('record_answer_sent',{description:'Record the actual message receipt of the answer reserved with reserve_answer. Records only.',inputSchema:z.object({...ids,message_id:z.string().min(1).max(200),accepted_at:z.string().min(10).max(64)}).strict(),annotations:ro},async p=>{
  const image=sourceFor(p.file_id,p.event_id);const s=image.submission;
  const r=await run('answer-accepted',p.file_id,p.event_id,{native_receipt:{message_id:p.message_id,accepted_at:p.accepted_at},caption_sha256:s.caption_sha256,submission_sha256:s.submission_sha256,question_response_included:true});
  return result({type:'send-to-dot.record',version:1,recorded:r.decision!=='hold'&&r.exit===0,decision:r.decision??null});
 });

 server.registerTool('mark_delivery_uncertain',{description:'Mark the image or answer send as uncertain (timeout/unknown outcome). The record then holds until the real conversation is checked; nothing is retried automatically.',inputSchema:z.object({...ids,phase:z.enum(['image','answer'])}).strict(),annotations:ro},async p=>{
  inbox.auth(token,'read');const r=await run('uncertain',p.file_id,p.event_id,{phase:p.phase});
  audit({event:'delivery.uncertain',outcome:p.phase});return result({type:'send-to-dot.record',version:1,decision:r.decision??'hold',automatic_retry:false});
 });
}

export function serveOriginal(pathname,links,headers,audit=()=>{}){
 const v=links.take(pathname.slice('/api/original/'.length));
 audit({event:'original.download',outcome:v?'served':'refused'});
 if(!v)return new Response(JSON.stringify({error:'Not found'}),{status:404,headers:{...headers,'Content-Type':'application/json'}});
 return new Response(v.bytes,{status:200,headers:{...headers,'Content-Type':v.mime,'Content-Length':String(v.bytes.length),'X-Original-SHA256':v.meta.sha256,'Content-Disposition':'attachment'}});
}
