import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {OriginalLinks,serveOriginal} from './delivery_tools.mjs';import {Inbox} from './store.mjs';import {createApp} from './server.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('OriginalLinks single-use and TTL',()=>{
 let now=1000;const l=new OriginalLinks({ttlMs:100,clock:()=>now});const a=l.issue(Buffer.from('x'),'image/png',{sha256:'s'});
 assert.match(a.token,/^[A-Za-z0-9_-]{43}$/);assert.ok(l.take(a.token));assert.equal(l.take(a.token),null);
 const b=l.issue(Buffer.from('y'),'image/png',{sha256:'s'});now+=101;assert.equal(l.take(b.token),null);
 assert.equal(l.take('../../etc'),null);assert.equal(l.take(undefined),null);
});
test('pending link cap',()=>{const l=new OriginalLinks({maxEntries:2});l.issue(Buffer.from('a'),'image/png',{sha256:'1'});l.issue(Buffer.from('b'),'image/png',{sha256:'2'});assert.throws(()=>l.issue(Buffer.from('c'),'image/png',{sha256:'3'}),/Too many/);});
test('end to end: claim returns a link not bytes; GET serves exact original once',async()=>{
 const origin='https://fixture.example.test',box=new Inbox(':memory:',Buffer.alloc(32,7));box.grant('readtok','owner','read subscribe');box.grant('up','owner','upload');
 const png=Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc000000301010018dd8db00000000049454e44ae426082','hex');
 const run=async a=>a==='start'?{decision:'read_source',claim_id:'0b7f4c1a-2d3e-4f50-8a6b-7c8d9e0f1a2b'}:a==='prepare'?{decision:'save_original_once',sha256:sha(png),byte_length:png.length,mime:'image/png',width:1,height:1,answer_state:'not_requested'}:{decision:'hold'};
 const audit=[];const app=createApp({origin,redirects:['https://chat.example.test/cb'],approvalSecret:'fixture',dotNativeDelivery:true,originalDownloadLinks:true,ledgerRunner:run,readCacheDirectory:'/tmp/rc-links-test',audit:e=>audit.push(e)},{inbox:box});
 try{
  const up=await (await app.fetch(new Request(origin+'/api/upload',{method:'POST',headers:{Origin:origin,Authorization:'Bearer up','Content-Type':'image/png','X-Share-ID':'linktest_0123456789'},body:png}))).json();
  const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'t',version:'1'}};
  const r=await app.fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer readtok','Content-Type':'application/json',Accept:'application/json, text/event-stream','Mcp-Method':'tools/call','Mcp-Name':'claim_image_delivery','Mcp-Protocol-Version':'2026-07-28'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'claim_image_delivery',arguments:{file_id:up.file_id,event_id:up.eventId},_meta:meta}})}));
  const body=await r.text();assert.ok(!body.includes('"type":"image"'));const claim=JSON.parse(JSON.parse(body.slice(body.indexOf('{'))).result.content[0].text);
  assert.equal(claim.decision,'save_original_once');assert.equal(claim.single_use,true);const url=new URL(claim.download_url);assert.equal(url.origin,origin);
  const g=await app.fetch(new Request(claim.download_url));assert.equal(g.status,200);const got=Buffer.from(await g.arrayBuffer());assert.equal(sha(got),claim.original_sha256);assert.equal(g.headers.get('cache-control'),'no-store');
  assert.equal((await app.fetch(new Request(claim.download_url))).status,404);
  assert.equal((await app.fetch(new Request(origin+'/api/original/'+'A'.repeat(43)))).status,404);
  assert.ok(!JSON.stringify(audit).includes(url.pathname.split('/').pop()));
 }finally{box.close();}
});
test('links disabled by default: route is not served',async()=>{
 const origin='https://fixture.example.test',box=new Inbox(':memory:',Buffer.alloc(32,7));const app=createApp({origin,redirects:['https://chat.example.test/cb'],approvalSecret:'fixture'},{inbox:box});
 try{assert.notEqual((await app.fetch(new Request(origin+'/api/original/'+'A'.repeat(43)))).status,200);}finally{box.close();}
});
