import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {Inbox} from './store.mjs';import {createApp} from './server.mjs';import {R2Stage} from './r2_stage.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');const origin='https://fixture.example.test';
const png=Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc000000301010018dd8db00000000049454e44ae426082','hex');
const creds={accountId:'0123456789abcdef0123456789abcdef',bucket:'send-to-dot-test',accessKeyId:'AKIDTEST',secretAccessKey:'secrettest'};
const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'t',version:'1'}};
function rig({putStatus=200,hold=false}={}){
 const calls=[];let release;const gate=new Promise(r=>release=r);
 const request=async(method,host,path,headers,body)=>{calls.push({method,host,path,auth:!!headers.authorization,len:body?.length??0});if(method==='PUT'&&hold)await gate;return method==='PUT'?putStatus:204;};
 let t=Date.now();const audit=[];const r2=new R2Stage(creds,{request,clock:()=>t,audit:e=>audit.push(e)});
 const box=new Inbox(':memory:',Buffer.alloc(32,7));box.grant('up','owner','upload');box.grant('readtok','owner','read subscribe');
 const dir=mkdtempSync(join(tmpdir(),'r2-'));const ledgerPath=join(dir,'map.json');writeFileSync(ledgerPath,JSON.stringify({items:[]}));
 const run=async a=>a==='start'?{decision:'read_source',claim_id:'0b7f4c1a-2d3e-4f50-8a6b-7c8d9e0f1a2b'}:a==='prepare'?{decision:'save_original_once',sha256:sha(png),byte_length:png.length,mime:'image/png',width:1,height:1,answer_state:'not_requested'}:a==='saved-reserve'?{decision:'send_image_once'}:a==='image-accepted'?{decision:'not_requested',image_send_accepted:true}:a==='cleanup-staged'?{staging_cleanup:'done'}:{decision:'hold'};
 const app=createApp({origin,redirects:['https://chat.example.test/cb'],approvalSecret:'fixture',dotNativeDelivery:true,originalDownloadLinks:true,ledgerPath,ledgerRunner:run,readCacheDirectory:join(dir,'rc'),r2Credentials:creds,r2Stage:r2,audit:e=>audit.push(e)},{inbox:box});
 const up=async n=>(await app.fetch(new Request(origin+'/api/upload',{method:'POST',headers:{Origin:origin,Authorization:'Bearer up','Content-Type':'image/png','X-Share-ID':'r2test_'+String(n).padStart(10,'0')},body:png}))).json();
 const call=async(name,args)=>{const r=await (await app.fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer readtok','Content-Type':'application/json',Accept:'application/json, text/event-stream','Mcp-Method':'tools/call','Mcp-Name':name,'Mcp-Protocol-Version':'2026-07-28'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args,_meta:meta}})}))).text();return JSON.parse(JSON.parse(r.slice(r.indexOf('{'))).result.content[0].text);};
 return {calls,audit,r2,box,up,call,release,tick:ms=>{t+=ms;}};
}
test('upload pre-stages to R2; claim hands out a presigned R2 URL; batch record deletes the object',async()=>{
 const {calls,audit,box,up,call}=rig();
 try{const u=await up(1);await new Promise(r=>setTimeout(r,10));
  const put=calls.find(c=>c.method==='PUT');assert.ok(put&&put.auth&&put.len===png.length);assert.match(put.host,/^0123456789abcdef0123456789abcdef\.r2\.cloudflarestorage\.com$/);
  assert.ok(!put.path.includes(u.file_id),'object key must not reveal the file id');
  const c=await call('claim_image_delivery',{file_id:u.file_id,event_id:u.eventId});
  assert.equal(c.decision,'save_original_once');assert.equal(c.single_use,false);const url=new URL(c.download_url);
  assert.equal(url.host,put.host);assert.equal(url.searchParams.get('X-Amz-Expires'),'120');assert.ok(url.searchParams.get('X-Amz-Signature'));
  assert.ok(audit.some(e=>e.event==='delivery.link'&&e.source==='r2'));assert.ok(!JSON.stringify(audit).includes(url.searchParams.get('X-Amz-Signature')));
  const rec=await call('record_images_sent',{items:[{file_id:u.file_id,event_id:u.eventId,claim_id:c.claim_id,library_file_id:'libfile_a',library_native_file_id:'file_a',library_version:0,message_id:'m',accepted_at:'2026-11-05T01:00:00Z'}]});
  assert.equal(rec.all_recorded,true);await new Promise(r=>setTimeout(r,10));assert.ok(calls.some(x=>x.method==='DELETE'&&x.path===put.path));
 }finally{box.close();}
});
test('falls back to the host one-time link while R2 staging is in flight or failed',async()=>{
 const a=rig({hold:true});
 try{const u=await a.up(2);const c=await a.call('claim_image_delivery',{file_id:u.file_id,event_id:u.eventId});assert.equal(c.single_use,true);assert.match(c.download_url,/\/api\/original\//);a.release();}finally{a.box.close();}
 const b=rig({putStatus:500});
 try{const u=await b.up(3);await new Promise(r=>setTimeout(r,10));const c=await b.call('claim_image_delivery',{file_id:u.file_id,event_id:u.eventId});assert.equal(c.single_use,true);assert.ok(b.audit.some(e=>e.event==='r2.stage'&&e.outcome==='failed'));}finally{b.box.close();}
});
test('sweep deletes staged objects older than 15 minutes',async()=>{
 const {calls,r2,box,up,tick}=rig();
 try{await up(4);await new Promise(r=>setTimeout(r,10));tick(16*60000);r2.sweep();await new Promise(r=>setTimeout(r,10));assert.equal(calls.filter(c=>c.method==='DELETE').length,1);}finally{box.close();}
});
test('claim success carries next_pending',async()=>{
 const {box,up,call}=rig();
 try{const a=await up(5),b=await up(6);await new Promise(r=>setTimeout(r,10));const c=await call('claim_image_delivery',{file_id:a.file_id,event_id:a.eventId});
  assert.equal(c.next_pending.file_id,b.file_id);}finally{box.close();}
});
