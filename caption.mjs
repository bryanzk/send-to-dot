import {createHash} from 'node:crypto';
const fail=()=>{throw Error('Invalid caption');};
export function normalizeCaption(value=''){
 if(typeof value!=='string')fail();
 // Check before and after trimming; overlong whitespace must not bypass limits.
 const check=s=>{if(Array.from(s).length>500||Buffer.byteLength(s,'utf8')>2048||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))fail();
  if(new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(s))!==s)fail();};
 check(value);const caption=value.trim();check(caption);return caption;
}
export function captionHeaders(headers){
 const raw=headers.get('x-inbox-caption'),source=headers.get('x-inbox-caption-source');
 if(source!==null&&source!=='manual-entry'&&source!=='none')fail();
 if(raw===null||raw==='')return {caption:'',source:'none'};
 if(source!=='manual-entry'||raw.length>2732||!/^[A-Za-z0-9+/]*={0,2}$/.test(raw))fail();
 const bytes=Buffer.from(raw,'base64');if(bytes.toString('base64')!==raw||bytes.length>2048)fail();
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail();}
 const caption=normalizeCaption(text);return {caption,source:caption?'manual-entry':'none'};
}
export const captionDigest=caption=>createHash('sha256').update(caption,'utf8').digest('hex');
export const submissionDigest=(imageDigest,caption)=>createHash('sha256').update(JSON.stringify(['send-to-dot/submission/v1',imageDigest,caption]),'utf8').digest('hex');
export const captionAAD=row=>Buffer.from(JSON.stringify(['send-to-dot/caption/v1',row.owner,row.id,row.event,row.digest]),'utf8');
export function submissionMetadata(row,caption){
 return {type:'send-to-dot.submission',version:1,file_id:row.id,eventId:row.event,image_sha256:row.digest,caption,
  caption_sha256:captionDigest(caption),submission_sha256:submissionDigest(row.digest,caption),
  caption_source:caption?'paired_manual_entry_assertion':'none',
  provenance:{authenticated_upload:true,client_entry_claim:caption?'manual-entry':null,manual_entry_independently_verified:false},
  instruction_scope:'image_question_only'};
}
