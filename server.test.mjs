import test from 'node:test';import assert from 'node:assert/strict';import {createApp} from './server.mjs';import {Inbox} from './store.mjs';import {spawnSync} from 'node:child_process';
const origin='https://private.example.test';
test('HTTP private upload, SDK auth boundary, manifest, durable dispatch without external calls',async()=>{
 const box=new Inbox(':memory:',Buffer.alloc(32,3));box.grant('phone','owner','upload');box.grant('chat','owner','read subscribe');
 const sent=[];const app=createApp({origin,redirects:['https://chat.example.test/callback'],approvalSecret:'fixture'}, {inbox:box,callbackVerifier:async()=>true,dispatcher:async(url,m)=>{sent.push(m);return {status:200};}});
 try{
 const req=(path,init={})=>app.fetch(new Request(origin+path,init));
 assert.equal((await req('/mcp')).status,401);
 const manifest=await(await req('/manifest.webmanifest')).json();assert.equal(manifest.share_target.method,'POST');assert.equal(manifest.share_target.params.files[0].name,'image');
 const png=spawnSync(process.env.DOT_INBOX_PYTHON??'python3',['-c',"from PIL import Image;import sys;Image.new('RGB',(4,4),'green').save(sys.stdout.buffer,format='PNG')"]).stdout;
 assert.equal((await req('/api/upload',{method:'POST',body:png,headers:{'Content-Type':'image/png',Origin:origin}})).status,401);
 const upload=()=>req('/api/upload',{method:'POST',body:png,headers:{Authorization:'Bearer phone','Content-Type':'image/png','X-Share-ID':'unique_test_share_123',Origin:origin}});
 const a=await(await upload()).json();assert.ok(a.file_id);assert.deepEqual(await(await upload()).json(),a);
 const rpc=async(method,params={})=>{const r=await req('/mcp',{method:'POST',headers:{Authorization:'Bearer chat','Content-Type':'application/json',Accept:'application/json, text/event-stream','Mcp-Method':method,'Mcp-Protocol-Version':'2026-07-28',...(method==='tools/call'?{'Mcp-Name':params.name}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'private-test',version:'1'}}}})});const t=await r.text();return JSON.parse(t.startsWith('event:')||t.startsWith('data:')?t.split('\n').find(x=>x.startsWith('data:')).slice(5):t);};
 assert.deepEqual((await rpc('server/discover')).result.capabilities.events,{});
 const secret='whsec_'+Buffer.alloc(32,1).toString('base64');const sub=await rpc('events/subscribe',{name:'file.created',arguments:{inbox_id:'personal'},delivery:{mode:'webhook',url:'https://callback.example.test',secret}});assert.ok(sub.result.id);
 const image=await rpc('tools/call',{name:'get_image',arguments:{file_id:a.file_id}});assert.equal(image.result.content[0].data,png.toString('base64'));
 await app.deliver();assert.equal(sent.length,1);assert.deepEqual(JSON.parse(sent[0].body).data,{inbox_id:'personal',file_id:a.file_id});await app.deliver();assert.equal(sent.length,1);
 const status=await(await req('/api/status/'+a.file_id,{headers:{Authorization:'Bearer phone'}})).json();assert.equal(status.state,'callback_accepted');
 }finally{box.close();}
});
