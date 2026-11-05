// End to end through the Worker's inbox (fake Durable Object SQLite): phone upload, event
// dispatch, dot claim, single-use original download, batch record, dedup, admin import.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {buildInbox} from './inbox_object.mjs';import {fakeStorage,makePng} from './test_support.mjs';
const origin='https://inbox.example.test';
const env={STORAGE_KEY:Buffer.alloc(32,5).toString('base64'),ORIGIN:origin,REDIRECTS:'["https://chat.example.test/cb"]',APPROVAL_SECRET:'owner-fixture',ADMIN_TOKEN:'admin-fixture'};
function setup(){
  const st=fakeStorage();const sent=[];
  const box=buildInbox({sql:st.sql,tx:st.tx,env,deps:{callbackVerifier:async()=>true,dispatcher:async(url,m)=>{sent.push({url,m});return {status:200,body:'{}'};}}});
  box.inbox.grant('phone-code-fixture','owner','upload');box.inbox.grant('reader-fixture','owner','read subscribe');
  const req=(path,init={})=>box.app.fetch(new Request(origin+path,init));
  const upload=(bytes,id)=>req('/api/upload',{method:'POST',headers:{Authorization:'Bearer phone-code-fixture',Origin:origin,'Content-Type':'image/png','X-Share-ID':id},body:bytes});
  const rpc=async(method,params={})=>{const r=await req('/mcp',{method:'POST',headers:{Authorization:'Bearer reader-fixture','Content-Type':'application/json',Accept:'application/json, text/event-stream','Mcp-Method':method,'Mcp-Protocol-Version':'2026-07-28',...(method==='tools/call'?{'Mcp-Name':params.name}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'cloud-fixture',version:'1'}}}})});assert.equal(r.status,200);return (await r.json()).result;};
  const tool=async(name,args={})=>JSON.parse((await rpc('tools/call',{name,arguments:args})).content.find(c=>c.type==='text').text);
  return {box,st,sent,req,upload,rpc,tool};
}
test('phone upload to dot record, with a multi-chunk original and single-use link',async()=>{
  const {box,st,sent,req,upload,rpc,tool}=setup();
  await rpc('events/subscribe',{name:'file.created',arguments:{inbox_id:'personal'},delivery:{mode:'webhook',url:'https://callback.example.test/hook',secret:'whsec_'+Buffer.alloc(32,1).toString('base64')}});
  const png=makePng(900,true);assert.ok(png.length>2*1024*1024);
  const up=await upload(png,'cloudfixture_0001');assert.equal(up.status,201);const {file_id,eventId}=await up.json();
  assert.ok(st.db.prepare('SELECT count(*) n FROM image_chunks WHERE id=?').get(file_id).n>=3);
  await box.tick();assert.equal(sent.length,1);const ev=JSON.parse(sent[0].m.body);assert.equal(ev.data.file_id,file_id);assert.ok(sent[0].m.headers['webhook-signature'].startsWith('v1,'));
  const c=await tool('claim_image_delivery',{});assert.equal(c.decision,'save_original_once');assert.equal(c.file_id,file_id);assert.equal(c.original_bytes,png.length);
  const url=new URL(c.download_url);assert.equal(url.origin,origin);
  const d=await req(url.pathname);assert.equal(d.status,200);const got=Buffer.from(await d.arrayBuffer());assert.ok(got.equals(png));assert.equal(createHash('sha256').update(got).digest('hex'),c.original_sha256);
  assert.equal((await req(url.pathname)).status,404);
  const rec=await tool('record_images_sent',{items:[{file_id,event_id:eventId,claim_id:c.claim_id,library_file_id:'libfile_a',library_native_file_id:'file_a',library_version:0,message_id:'msg_a',accepted_at:'2026-11-05T12:00:00Z'}]});
  assert.equal(rec.all_recorded,true);assert.equal(rec.next_pending,null);
  assert.equal((await tool('claim_image_delivery',{})).decision,'none_pending');
  assert.equal((await tool('claim_image_delivery',{file_id,event_id:eventId})).decision,'skip');
  const p=await tool('pending_deliveries');assert.deepEqual([p.pending,p.held],[[],[]]);
});
test('duplicate share ID returns the same file; bad image and wrong origin are refused',async()=>{
  const {upload,req}=setup();const png=makePng(30);
  const a=await (await upload(png,'cloudfixture_0002')).json(),b=await (await upload(png,'cloudfixture_0002')).json();assert.equal(a.file_id,b.file_id);
  assert.equal((await upload(Buffer.from('not an image'),'cloudfixture_0003')).status,400);
  assert.equal((await req('/api/upload',{method:'POST',headers:{Authorization:'Bearer phone-code-fixture',Origin:'https://evil.example','Content-Type':'image/png','X-Share-ID':'cloudfixture_0004'},body:png})).status,403);
  assert.equal((await req('/mcp',{method:'POST'})).status,401);
  assert.equal((await req('/')).status,200);
});
test('admin import needs the admin token and only takes upload-code hashes plus history',async()=>{
  const {box}=setup();const call=(auth,body)=>box.admin(new Request(origin+'/admin/import',{method:'POST',headers:{Authorization:auth},body:JSON.stringify(body)}));
  assert.equal(await call('Bearer wrong',{}),null);
  const h=createHash('sha256').update('migrated-phone-code').digest('hex');
  const r=await (await call('Bearer admin-fixture',{tokens:[{hash:h,scope:'upload',expires:Date.now()+86400000},{hash:'f'.repeat(64),scope:'read subscribe',expires:Date.now()+86400000}],ledger:[{source_file_id:'00000000-0000-4000-8000-000000000009',event_id:'evt_migrated01',state:'send_accepted'}]})).json();
  assert.deepEqual(r,{tokens:1,ledger:1});assert.equal(box.inbox.auth('migrated-phone-code','upload'),'owner');
  const s=await (await box.admin(new Request(origin+'/admin/status',{headers:{Authorization:'Bearer admin-fixture'}}))).json();assert.equal(s.ledger,1);
});
test('embedded web assets match web/ (rerun node cloud/build-assets.mjs after changing web/)',async()=>{
  const {webFile}=await import('./web_assets.mjs');const {readFileSync}=await import('node:fs');
  for(const n of ['index.html','app.js','db.js','sw.js','style.css','manifest.webmanifest','icon-192.png','icon-512.png','sample.png'])assert.ok(webFile(n).equals(readFileSync(new URL('../web/'+n,import.meta.url))),n);
});
test('admin audit lists dispatch, claim and record events plus ledger receipts, without secrets',async()=>{
  const {box,upload,rpc,tool}=setup();
  await rpc('events/subscribe',{name:'file.created',arguments:{inbox_id:'personal'},delivery:{mode:'webhook',url:'https://callback.example.test/hook',secret:'whsec_'+Buffer.alloc(32,1).toString('base64')}});
  const {file_id,eventId}=await (await upload(makePng(20),'cloudfixture_0009')).json();await box.tick();
  const c=await tool('claim_image_delivery',{});
  await tool('record_images_sent',{items:[{file_id,event_id:eventId,claim_id:c.claim_id,library_file_id:'libfile_b',library_native_file_id:'file_b',library_version:0,message_id:'msg_b',accepted_at:'2026-11-05T12:00:00Z'}]});
  const r=await box.admin(new Request('https://inbox.example.test/admin/audit',{headers:{Authorization:'Bearer admin-fixture'}}));const j=await r.json();
  const names=j.entries.map(e=>e.event);for(const n of ['event.dispatch','delivery.claim','delivery.image_recorded'])assert.ok(names.includes(n),n);
  assert.equal(j.items.at(-1).accepted_at,'2026-11-05T12:00:00Z');
  assert.doesNotMatch(JSON.stringify(j),/reader-fixture|phone-code-fixture|whsec_|\/api\/original\//);
});
