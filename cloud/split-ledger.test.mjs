import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {InboxCore} from '../store_core.mjs';import {DOSql} from './do_sqlite.mjs';import {validateImage} from './image_check.mjs';
import {SplitLedger} from './split_ledger.mjs';import {fakeStorage,makePng} from './test_support.mjs';
function setup(caption=''){
  const st=fakeStorage();let now=1_800_000_000_000;const clock=()=>now;
  const inbox=new InboxCore(new DOSql(st.sql),Buffer.alloc(32,9),{clock,validate:validateImage,tx:st.tx,maxBlob:1024*1024});
  inbox.grant('up','owner','upload');inbox.grant('rd','owner','read subscribe');
  const png=makePng(40);const r=inbox.upload('up',(caption?'q_':'u_')+'ledgerfixture01',png,'image/png',caption?{caption,source:'manual-entry'}:{});
  const ledger=new SplitLedger(inbox,{clock:()=>now/1000});
  return {inbox,ledger,f:r.file_id,e:r.eventId,image:inbox.read('rd',r.file_id),advance:ms=>{now+=ms;}};
}
const lib={library_file_id:'libfile_x',file_id:'file_x',version:0},rcpt={message_id:'m1',accepted_at:'2026-11-05T12:00:00Z'};
test('image-only: claim once, prepare verifies bytes, record, then skip forever',async()=>{
  const {ledger,f,e,image}=setup();
  const s=await ledger.run('start',f,e);assert.equal(s.decision,'read_source');
  assert.equal((await ledger.run('start',f,e)).decision,'hold');
  const p=await ledger.run('prepare',f,e,{claim_id:s.claim_id},{image});assert.equal(p.decision,'save_original_once');assert.equal(p.sha256,createHash('sha256').update(image.bytes).digest('hex'));assert.equal(p.width,40);
  assert.equal((await ledger.run('saved-reserve',f,e,{claim_id:s.claim_id,library_receipt:lib})).decision,'send_image_once');
  const a=await ledger.run('image-accepted',f,e,{native_receipt:rcpt});assert.equal(a.image_send_accepted,true);
  assert.equal((await ledger.run('cleanup-staged',f,e,{claim_id:s.claim_id})).staging_cleanup,'already_absent');
  assert.equal((await ledger.run('start',f,e)).decision,'skip');
  assert.equal(ledger.items()[0].state,'send_accepted');
});
test('wrong bytes never prepare; expired lease is re-claimable; uncertain holds until reconciled',async()=>{
  const {ledger,f,e,image,advance}=setup();
  const s=await ledger.run('start',f,e);
  const bad={...image,bytes:makePng(41)};assert.equal((await ledger.run('prepare',f,e,{claim_id:s.claim_id},{image:bad})).decision,'hold');
  advance(301000);const s2=await ledger.run('start',f,e);assert.equal(s2.decision,'read_source');assert.notEqual(s2.claim_id,s.claim_id);
  await ledger.run('prepare',f,e,{claim_id:s2.claim_id},{image});
  assert.equal((await ledger.run('uncertain',f,e,{phase:'image'})).reason,'creating_uncertain');
  advance(1000000);assert.equal((await ledger.run('start',f,e)).reason,'creating_uncertain');
  assert.equal((await ledger.run('reconcile',f,e,{outcome:'sent',outcome_verified:false,library_receipt:lib,native_receipt:rcpt})).exit,1);
  const r=await ledger.run('reconcile',f,e,{outcome:'sent',outcome_verified:true,library_receipt:lib,native_receipt:rcpt});assert.equal(r.image_send_accepted,true);
  assert.equal((await ledger.run('start',f,e)).decision,'skip');
});
test('question: answer only after image acceptance, verified binding, single answer',async()=>{
  const {ledger,f,e,image}=setup('这是什么花？');
  const s=await ledger.run('start',f,e);assert.equal(s.question_present,true);
  const p=await ledger.run('prepare',f,e,{claim_id:s.claim_id},{image});assert.equal(p.answer_state,'pending');
  assert.equal((await ledger.run('answer-reserve',f,e,{metadata:image.submission})).exit,1);
  await ledger.run('saved-reserve',f,e,{claim_id:s.claim_id,library_receipt:lib});
  assert.equal((await ledger.run('image-accepted',f,e,{native_receipt:rcpt})).decision,'answer_pending');
  assert.equal((await ledger.run('start',f,e)).decision,'answer_pending');
  const res=await ledger.run('answer-reserve',f,e,{metadata:image.submission});assert.equal(res.decision,'send_answer_once');
  const sub=image.submission;
  const done=await ledger.run('answer-accepted',f,e,{native_receipt:{message_id:'m2',accepted_at:'2026-11-05T12:00:05Z'},caption_sha256:sub.caption_sha256,submission_sha256:sub.submission_sha256,question_response_included:true});
  assert.equal(done.decision,'complete');assert.equal((await ledger.run('start',f,e)).decision,'skip');
});
test('imported history keeps dedup: delivered items skip, legacy items hold',async()=>{
  const {ledger,f,e}=setup();
  ledger.importItems([{source_file_id:f,event_id:e,state:'send_accepted',image_state:'accepted',delivery_mode:'image_then_answer'},{source_file_id:'00000000-0000-4000-8000-000000000001',state:'library_saved'}]);
  assert.equal((await ledger.run('start',f,e)).decision,'skip');
  assert.equal(ledger.importItems([{source_file_id:f,state:'x'}]).imported,0);
});
