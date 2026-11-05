import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {registerDeliveryTools} from './delivery_tools.mjs';
const z=(await import('zod')).z;
const sha=b=>createHash('sha256').update(b).digest('hex');
const FILE='3f2b8a1e-1c81-48cf-87d4-c213025e76f3',EVT='evt_abcdefgh-1234',CLAIM='0b7f4c1a-2d3e-4f50-8a6b-7c8d9e0f1a2b';
function setup({bytes=Buffer.from('original-bytes'),caption=null,event=EVT,runs={}}={}){
 const tools={},calls=[];const server={registerTool:(name,_meta,fn)=>{tools[name]=fn;}};
 const submission=caption?{type:'send-to-dot.submission',caption,caption_sha256:'c'.repeat(64),submission_sha256:'s'.repeat(64),image_sha256:sha(bytes)}:{image_sha256:sha(bytes)};
 const inbox={read:(t,id)=>{assert.equal(t,'tok');if(id!==FILE)throw Error('Not found');return {bytes,mime:'image/png',source:{file_id:FILE,event_id:event,expires_at:1},submission};},auth:()=> 'owner'};
 const readCache={stage:()=> 'read_'+CLAIM};
 const run=async(action,f,e,payload)=>{calls.push({action,payload});const r=runs[action];return typeof r==='function'?r(payload):(r??{decision:'hold',reason:'unexpected'});};
 registerDeliveryTools(server,{z,inbox,token:'tok',readCache,run});return {tools,calls};
}
const parse=r=>JSON.parse(r.content.find(c=>c.type==='text').text);
test('claim returns the exact original only after start+prepare succeed',async()=>{
 const bytes=Buffer.from('exact-original');const {tools,calls}=setup({bytes,runs:{start:{decision:'read_source',claim_id:CLAIM},prepare:{decision:'save_original_once',sha256:sha(bytes),byte_length:bytes.length,mime:'image/png',width:4,height:4,answer_state:'not_requested'}}});
 const r=await tools.claim_image_delivery({file_id:FILE,event_id:EVT});const img=r.content.find(c=>c.type==='image');
 assert.equal(Buffer.from(img.data,'base64').toString(),'exact-original');assert.equal(img.mimeType,'image/png');
 const meta=parse(r);assert.equal(meta.decision,'save_original_once');assert.equal(meta.claim_id,CLAIM);assert.equal(meta.original_sha256,sha(bytes));
 assert.deepEqual(calls.map(c=>c.action),['start','prepare']);assert.equal(calls[1].payload.claim_id,CLAIM);
});
for(const decision of ['skip','hold','stop','answer_pending']){
 test(`claim with ledger decision ${decision} returns no image and never prepares`,async()=>{
  const {tools,calls}=setup({runs:{start:{decision,reason:'x'}}});const r=await tools.claim_image_delivery({file_id:FILE,event_id:EVT});
  assert.ok(!r.content.some(c=>c.type==='image'));assert.equal(parse(r).decision,decision);assert.equal(parse(r).claimed,false);assert.deepEqual(calls.map(c=>c.action),['start']);
 });
}
test('prepare failure holds without image and without retry',async()=>{
 const {tools}=setup({runs:{start:{decision:'read_source',claim_id:CLAIM},prepare:{decision:'hold',reason:'fast_delivery_validation_or_local_operation_failed'}}});
 const r=await tools.claim_image_delivery({file_id:FILE,event_id:EVT});assert.ok(!r.content.some(c=>c.type==='image'));assert.equal(parse(r).decision,'hold');assert.equal(parse(r).automatic_retry,false);
});
test('oversize original is never claimed nor replaced by a preview',async()=>{
 const {tools,calls}=setup({bytes:Buffer.alloc(4*1024*1024+1)});const r=await tools.claim_image_delivery({file_id:FILE,event_id:EVT});
 assert.equal(parse(r).decision,'too_large_for_inline');assert.ok(!r.content.some(c=>c.type==='image'));assert.equal(calls.length,0);
});
test('event mismatch is rejected before touching the ledger',async()=>{
 const {tools,calls}=setup({event:'evt_otherevent-99'});await assert.rejects(tools.claim_image_delivery({file_id:FILE,event_id:EVT}),/Event identity mismatch/);assert.equal(calls.length,0);
});
test('record_image_sent records library, then message receipt, then cleans staging',async()=>{
 const {tools,calls}=setup({runs:{'saved-reserve':{decision:'send_image_once'},'image-accepted':{decision:'answer_pending',image_send_accepted:true},'cleanup-staged':{staging_cleanup:'done'}}});
 const r=parse(await tools.record_image_sent({file_id:FILE,event_id:EVT,claim_id:CLAIM,library_file_id:'libfile_x1',library_native_file_id:'file_x1',library_version:0,message_id:'Sentinel_1',accepted_at:'2026-11-03T16:00:00Z'}));
 assert.equal(r.recorded,true);assert.equal(r.user_visible_confirmed,false);assert.deepEqual(calls.map(c=>c.action),['saved-reserve','image-accepted','cleanup-staged']);
 assert.deepEqual(calls[0].payload.library_receipt,{library_file_id:'libfile_x1',file_id:'file_x1',version:0});
});
test('record_image_sent stops if the ledger refuses the Library step',async()=>{
 const {tools,calls}=setup({runs:{'saved-reserve':{decision:'hold',reason:'state'}}});
 const r=parse(await tools.record_image_sent({file_id:FILE,event_id:EVT,claim_id:CLAIM,library_file_id:'libfile_x1',library_native_file_id:'file_x1',library_version:0,message_id:'m',accepted_at:'2026-11-03T16:00:00Z'}));
 assert.equal(r.recorded,false);assert.deepEqual(calls.map(c=>c.action),['saved-reserve']);
});
test('answer reservation passes the bound submission and returns the caption only when reserved',async()=>{
 const {tools,calls}=setup({caption:'what is this?',runs:{'answer-reserve':{decision:'send_answer_once'}}});
 const r=parse(await tools.reserve_answer({file_id:FILE,event_id:EVT}));assert.equal(r.decision,'send_answer_once');assert.equal(r.caption,'what is this?');assert.equal(calls[0].payload.metadata.caption,'what is this?');
 const h=setup({caption:'q',runs:{'answer-reserve':{decision:'hold',reason:'posting'}}});assert.equal(parse(await h.tools.reserve_answer({file_id:FILE,event_id:EVT})).caption,null);
});
test('uncertain is recorded as hold with no automatic retry',async()=>{
 const {tools}=setup({runs:{uncertain:{decision:'hold',reason:'image_posting_uncertain'}}});const r=parse(await tools.mark_delivery_uncertain({file_id:FILE,event_id:EVT,phase:'image'}));assert.equal(r.decision,'hold');assert.equal(r.automatic_retry,false);
});
test('reconcile sent records real receipts, cleans staging and never sends',async()=>{
 const {tools,calls}=setup({runs:{reconcile:{decision:'not_requested',image_send_accepted:true,claim_id:CLAIM},'cleanup-staged':{staging_cleanup:'done'}}});
 const r=parse(await tools.reconcile_image_delivery({file_id:FILE,event_id:EVT,outcome:'sent',outcome_verified:true,library_file_id:'libfile_x',library_native_file_id:'file_x',library_version:0,message_id:'m1',accepted_at:'2026-11-05T02:49:43Z'}));
 assert.equal(r.automatic_retry,false);assert.equal(r.staging_cleanup,'done');assert.deepEqual(calls.map(c=>c.action),['reconcile','cleanup-staged']);
 assert.deepEqual(calls[0].payload.library_receipt,{library_file_id:'libfile_x',file_id:'file_x',version:0});assert.equal(calls[0].payload.outcome_verified,true);assert.equal(calls[1].payload.claim_id,CLAIM);
});
test('reconcile not_created only makes the item reclaimable',async()=>{
 const {tools,calls}=setup({runs:{reconcile:{decision:'reclaimable',staging_cleanup:'done'}}});
 const r=parse(await tools.reconcile_image_delivery({file_id:FILE,event_id:EVT,outcome:'not_created',outcome_verified:true}));
 assert.equal(r.decision,'reclaimable');assert.deepEqual(calls.map(c=>c.action),['reconcile']);assert.equal(calls[0].payload.library_receipt,null);
});
