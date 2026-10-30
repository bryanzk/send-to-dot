import {ACCESS_MS,ACCESS_SECONDS} from '../access_policy.mjs';
// Disposable local setup-to-first-image acceptance. Never opens the real instance config.
import assert from 'node:assert/strict';import http from 'node:http';import {once} from 'node:events';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {initialize,prerequisites} from './setup.mjs';import {createApp} from '../server.mjs';import {nodeHandler} from '../http_bridge.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),fixture=mkdtempSync(join(tmpdir(),'send-to-dot-smoke-'));
const origin='https://inbox.example.test',redirect='https://chat.example.test/callback',stages=[];let app,server;
try{
 const python=prerequisites(root);process.env.DOT_INBOX_PYTHON=python;
 initialize({root:fixture,origin,redirects:[redirect],pythonExecutable:python});
 const cfg=JSON.parse(readFileSync(join(fixture,'approved.config.json')));cfg.storageKey=Buffer.from(readFileSync(cfg.storageKeyFile,'utf8'),'base64');cfg.approvalSecret=readFileSync(cfg.approvalSecretFile,'utf8').trim();const phone=readFileSync(cfg.phoneCredentialFile,'utf8').trim();stages.push('isolated setup generated independent private files');
 const deliveries=[];
 // Callback network is a test adapter: production callback verification/HTTPS is NOT replaced.
 app=createApp(cfg,{callbackVerifier:async()=>true,dispatcher:async(url,message)=>{deliveries.push(message);return {status:204};}});
 const handler=nodeHandler(app.fetch,origin);server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const req=(path,init={})=>fetch(base+path,{redirect:'manual',...init});
 assert.equal((await req('/')).status,200);assert.equal((await req('/mcp')).status,401);stages.push('actual loopback HTTP webpage and private MCP challenge');
 const client=await(await req('/oauth/register',{method:'POST',body:JSON.stringify({redirect_uris:[redirect]})})).json(),verifier='x'.repeat(43);
 const params=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),scope:'read subscribe',resource:origin+'/mcp',state:'disposable_fixture'});
 assert.equal((await req('/oauth/authorize?'+params)).status,200);params.set('approval',cfg.approvalSecret);
 const approved=await req('/oauth/approve',{method:'POST',headers:{Origin:origin},body:params});assert.equal(approved.status,303);const cb=new URL(approved.headers.get('location'));
 const exchanged=await req('/oauth/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:redirect,code:cb.searchParams.get('code'),code_verifier:verifier,resource:origin+'/mcp'})});assert.equal(exchanged.status,200);const tokenResult=await exchanged.json();assert.equal(tokenResult.expires_in,ACCESS_SECONDS);const token=tokenResult.access_token;const uploadExpiry=app.inbox.db.prepare("SELECT expires FROM tokens WHERE scope='upload'").get().expires;assert.ok(Math.abs(uploadExpiry-Date.now()-ACCESS_MS)<10000);stages.push('new fixture upload and OAuth lifetime30days; no existing grant migrated');stages.push('fixture OAuth registration, owner approval, PKCE code exchange');
 const rpc=async(method,params={})=>{const r=await req('/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','Mcp-Method':method,'Mcp-Protocol-Version':'2026-07-28',...(method==='tools/call'?{'Mcp-Name':params.name}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'smoke',version:'1'}}}})});assert.equal(r.status,200);const body=await r.json();assert.ok(!body.error,JSON.stringify(body.error));return body.result;};
 assert.deepEqual((await rpc('server/discover')).capabilities.events,{});assert.equal((await rpc('events/list')).events[0].name,'file.created');
 const sub=await rpc('events/subscribe',{name:'file.created',arguments:{inbox_id:'personal'},delivery:{mode:'webhook',url:'https://callback.example.test/events',secret:'whsec_'+Buffer.alloc(32,1).toString('base64')},ttlMs:3600000});stages.push('real SDK discovery and subscription with fixture callback adapter');
 const bytes=readFileSync(new URL('../web/sample.png',import.meta.url));let image;
 for(let n=0;n<2;n++){const r=await req('/api/upload',{method:'POST',headers:{Authorization:'Bearer '+phone,Origin:origin,'Content-Type':'image/png','X-Share-ID':'smoke_fixed_generated_sample'},body:bytes});assert.equal(r.status,201);const receipt=await r.json();if(image)assert.equal(receipt.file_id,image.file_id);image=receipt;}
 await app.deliver();assert.equal(deliveries.length,1);const event=JSON.parse(deliveries[0].body);assert.equal(event.data.file_id,image.file_id);stages.push('generated PNG upload/retry deduplication and signed-event dispatch to fixture');
 const result=await rpc('tools/call',{name:'get_image',arguments:{file_id:image.file_id}});assert.deepEqual(Buffer.from(result.content[0].data,'base64'),bytes);stages.push('real SDK get_image returned exact original bytes');
 await rpc('events/unsubscribe',{id:sub.id});assert.equal(app.inbox.pending().length,0);
 console.log(JSON.stringify({status:'passed',stages,limitations:['HTTP loopback fixture, not public TLS or real platform callback','OAuth uses generated fixture secret, not human browser approval','Does not prove phone share sheet, ChatGPT account eligibility, native attachment rendering or automatic platform renewal']},null,2));
}finally{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 app?.inbox.close();rmSync(fixture,{recursive:true,force:true});
}
