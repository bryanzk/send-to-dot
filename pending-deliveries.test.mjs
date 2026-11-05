import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Inbox} from './store.mjs';import {createApp} from './server.mjs';import {pendingDeliveries,unclaimedWatcher} from './delivery_tools.mjs';
const origin='https://fixture.example.test';
const png=Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc000000301010018dd8db00000000049454e44ae426082','hex');
async function setup(){const box=new Inbox(':memory:',Buffer.alloc(32,7));box.grant('up','owner','upload');box.grant('readtok','owner','read subscribe');
 const dir=mkdtempSync(join(tmpdir(),'pend-'));const ledgerPath=join(dir,'map.json');writeFileSync(ledgerPath,JSON.stringify({items:[]}));
 const app=createApp({origin,redirects:['https://chat.example.test/cb'],approvalSecret:'fixture',dotNativeDelivery:true,ledgerPath},{inbox:box});
 const up=async n=>{const b=Buffer.concat([png]);const r=await app.fetch(new Request(origin+'/api/upload',{method:'POST',headers:{Origin:origin,Authorization:'Bearer up','Content-Type':'image/png','X-Share-ID':'pendtest_'+String(n).padStart(10,'0')},body:b}));return r.json();};
 return {box,app,ledgerPath,up};}
test('pending lists unclaimed and answer-pending; skips done; holds uncertain; tolerates missing ledger',async()=>{
 const {box,ledgerPath,up}=await setup();
 try{
  // identical bytes dedupe by share ID only, so use different share IDs
  const a=await up(1),b=await up(2),c=await up(3),d=await up(4),e=await up(5);
  const now=Date.now();
  writeFileSync(ledgerPath,JSON.stringify({items:[
   {source_file_id:b.file_id,event_id:b.eventId,state:'split_active',image_state:'claimed',lease_until:now/1000-1},
   {source_file_id:c.file_id,event_id:c.eventId,state:'split_active',image_state:'accepted',answer_state:'pending'},
   {source_file_id:d.file_id,event_id:d.eventId,state:'split_active',image_state:'creating_uncertain',answer_state:'not_requested'},
   {source_file_id:e.file_id,event_id:e.eventId,state:'send_accepted',image_state:'accepted',answer_state:'not_requested'}]}));
  const r=pendingDeliveries(box,ledgerPath);assert.equal(r.ok,true);
  const kinds=Object.fromEntries(r.pending.map(p=>[p.file_id,p.kind]));
  assert.equal(kinds[a.file_id],'image');assert.equal(kinds[b.file_id],'image');assert.equal(kinds[c.file_id],'answer');
  assert.ok(!(d.file_id in kinds)&&!(e.file_id in kinds));
  assert.deepEqual(r.held.map(h=>h.file_id),[d.file_id]);
  assert.ok(!JSON.stringify(r).includes('data:'));
  // live claim (lease in future) is not re-offered
  writeFileSync(ledgerPath,JSON.stringify({items:[{source_file_id:a.file_id,event_id:a.eventId,state:'split_active',image_state:'claimed',lease_until:now/1000+300}]}));
  assert.ok(!pendingDeliveries(box,ledgerPath).pending.some(p=>p.file_id===a.file_id));
  assert.deepEqual(pendingDeliveries(box,ledgerPath+'.missing'),{ok:false,error:'ledger_unavailable',pending:[],held:[]});
 }finally{box.close();}
});
test('watchdog alerts once per unclaimed event after the threshold',async()=>{
 const {box,ledgerPath,up}=await setup();
 try{const a=await up(9);let t=Date.now();const logs=[];const w=unclaimedWatcher(box,ledgerPath,e=>logs.push(e),{afterMs:60000,clock:()=>t});
  w();assert.equal(logs.length,0);t+=61000;w();w();assert.equal(logs.length,1);assert.equal(logs[0].event,'delivery.unclaimed');assert.equal(logs[0].eventId,a.eventId);
 }finally{box.close();}
});
test('pending_deliveries tool is listed only when a ledger path is configured',async()=>{
 const {box,app}=await setup();
 try{const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'t',version:'1'}};
  const r=await app.fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer readtok','Content-Type':'application/json',Accept:'application/json, text/event-stream','Mcp-Method':'tools/list','Mcp-Protocol-Version':'2026-07-28'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{_meta:meta}})}));
  assert.ok((await r.text()).includes('"pending_deliveries"'));
 }finally{box.close();}
});
test('record_image_sent and claim results carry the next pending item',async()=>{
 const {registerDeliveryTools}=await import('./delivery_tools.mjs');const {z}=await import('zod');
 const {box,ledgerPath,up}=await setup();
 try{const a=await up(21),b=await up(22);
  writeFileSync(ledgerPath,JSON.stringify({items:[{source_file_id:a.file_id,event_id:a.eventId,state:'send_accepted',image_state:'accepted',answer_state:'not_requested'}]}));
  const tools={};const server={registerTool:(n,_m,f)=>{tools[n]=f;}};
  const run=async act=>act==='saved-reserve'?{decision:'send_image_once'}:act==='image-accepted'?{decision:'not_requested',image_send_accepted:true}:act==='cleanup-staged'?{staging_cleanup:'done'}:act==='start'?{decision:'skip',reason:'send_accepted'}:{decision:'hold'};
  registerDeliveryTools(server,{z,inbox:box,token:'readtok',readCache:null,run,ledgerPath});
  const rec=JSON.parse((await tools.record_image_sent({file_id:a.file_id,event_id:a.eventId,claim_id:'0b7f4c1a-2d3e-4f50-8a6b-7c8d9e0f1a2b',library_file_id:'libfile_x',library_native_file_id:'file_x',library_version:0,message_id:'m1',accepted_at:'2026-11-05T01:00:00Z'})).content[0].text);
  assert.equal(rec.recorded,true);assert.deepEqual(rec.next_pending,{file_id:b.file_id,event_id:b.eventId,kind:'image'});assert.equal(rec.pending_count,1);
  const sk=JSON.parse((await tools.claim_image_delivery({file_id:a.file_id,event_id:a.eventId})).content[0].text);
  assert.equal(sk.decision,'skip');assert.equal(sk.next_pending.file_id,b.file_id);
  writeFileSync(ledgerPath,JSON.stringify({items:[{source_file_id:a.file_id,event_id:a.eventId,state:'send_accepted',image_state:'accepted',answer_state:'not_requested'},{source_file_id:b.file_id,event_id:b.eventId,state:'send_accepted',image_state:'accepted',answer_state:'not_requested'}]}));
  const done=JSON.parse((await tools.record_image_sent({file_id:b.file_id,event_id:b.eventId,claim_id:'0b7f4c1a-2d3e-4f50-8a6b-7c8d9e0f1a2b',library_file_id:'libfile_y',library_native_file_id:'file_y',library_version:0,message_id:'m2',accepted_at:'2026-11-05T01:00:01Z'})).content[0].text);
  assert.equal(done.next_pending,null);assert.equal(done.pending_count,0);
 }finally{box.close();}
});
