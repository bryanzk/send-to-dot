// Port of scripts/verify_submission.py: checks the server's own manual-question metadata
// before an answer is reserved. Returns bounded digests only.
import {createHash} from 'node:crypto';
const HEX=/^[0-9a-f]{64}$/;
const TRIM='\u0009\u000b\u000c                　﻿\u000a\u000d  ';
const fail=m=>{throw Error(m);};
const strip=s=>{let a=0,b=s.length;while(a<b&&TRIM.includes(s[a]))a++;while(b>a&&TRIM.includes(s[b-1]))b--;return s.slice(a,b);};
const chars=s=>Array.from(s).length;
export function normalizeCaption(v){
  if(typeof v!=='string')fail('Caption must be a string');
  if(chars(v)>500||Buffer.byteLength(v,'utf8')>2048||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))fail('Caption limits exceeded');
  const r=strip(v);if(chars(r)>500||Buffer.byteLength(r,'utf8')>2048)fail('Caption limits exceeded');return r;
}
export function hashes(imageSha,caption){
  if(typeof imageSha!=='string'||!HEX.test(imageSha))fail('Invalid image digest');
  const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
  return [sha(caption),sha(JSON.stringify(['send-to-dot/submission/v1',imageSha,caption]))];
}
const KEYS=['type','version','file_id','eventId','image_sha256','caption','caption_sha256','submission_sha256','caption_source','provenance','instruction_scope'].sort().join();
export function verifySubmission(m,{fileId,eventId,imageSha}){
  if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).sort().join()!==KEYS)fail('Exact submission metadata required');
  if(m.type!=='send-to-dot.submission'||m.version!==1)fail('Unsupported submission metadata');
  if(m.file_id!==fileId||m.eventId!==eventId||m.image_sha256!==imageSha)fail('Submission source mismatch');
  const p=m.provenance;
  if(m.caption_source!=='paired_manual_entry_assertion'||m.instruction_scope!=='image_question_only'||!p||typeof p!=='object'||Object.keys(p).sort().join()!=='authenticated_upload,client_entry_claim,manual_entry_independently_verified')fail('Unsupported caption provenance');
  if(p.authenticated_upload!==true||p.client_entry_claim!=='manual-entry'||p.manual_entry_independently_verified!==false)fail('Invalid paired-client assertion');
  const c=normalizeCaption(m.caption);if(!c||c!==m.caption)fail('Nonempty server-normalized caption required');
  const [cs,ss]=hashes(imageSha,c);if(m.caption_sha256!==cs||m.submission_sha256!==ss)fail('Submission digest mismatch');
  return {question_present:true,caption_sha256:cs,submission_sha256:ss,instruction_scope:'image_question_only'};
}
