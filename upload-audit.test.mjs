import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter,once} from 'node:events';import http from 'node:http';
import {observeUpload,uploadCategory} from './upload_audit.mjs';
function response(){const r=new EventEmitter();r.headers={};r.setHeader=(k,v)=>r.headers[k]=v;return r;}
test('audit allowlist excludes headers, body, query, filenames and IP; records once',()=>{
 const logs=[],res=response(),req={url:'/api/upload?token=private-query-marker',method:'POST'};
 for(const name of ['headers','body','socket'])Object.defineProperty(req,name,{get(){throw Error('Must not inspect '+name);}});
 observeUpload(req,res,x=>logs.push(x),{now:()=>new Date(0),id:()=> 'server-generated-fixture-id'});res.statusCode=401;res.emit('finish');res.emit('close');
 assert.deepEqual(logs,[{event:'upload.request',time:'1970-01-01T00:00:00.000Z',requestId:'server-generated-fixture-id',method:'POST',status:401,errorCategory:'authentication_rejected'}]);
 assert.equal(res.headers['X-Inbox-Request-ID'],'server-generated-fixture-id');assert.ok(!JSON.stringify(logs).includes('private-query-marker'));
});
test('unknown method and aborted connection cannot leak input or masquerade as acceptance',()=>{
 const logs=[],res=response();observeUpload({url:'/api/upload',method:'private-method-marker'},res,x=>logs.push(x));res.statusCode=200;res.emit('close');res.emit('finish');
 assert.equal(logs.length,1);assert.equal(logs[0].method,'OTHER');assert.equal(logs[0].status,0);assert.equal(logs[0].errorCategory,'connection_closed');assert.ok(!JSON.stringify(logs).includes('private-method-marker'));
 for(const [status,category]of [[201,'accepted'],[400,'invalid_upload'],[403,'request_boundary_rejected'],[413,'payload_too_large'],[503,'server_unavailable']])assert.equal(uploadCategory(status),category);
});
test('other routes are not logged and logger failure never changes response',()=>{
 const r=response();observeUpload({url:'/oauth/token?secret=private',method:'POST'},r,()=>assert.fail('No OAuth audit through upload observer'));assert.equal(r.listenerCount('finish'),0);
 const res=response();observeUpload({url:'/api/upload',method:'POST'},res,()=>{throw Error('fixture logger failure');});res.statusCode=201;assert.doesNotThrow(()=>res.emit('finish'));
});
test('actual HTTP rejects fixture upload without recording its token, bytes, filename or client ID',async()=>{
 const logs=[],server=http.createServer((req,res)=>{observeUpload(req,res,x=>logs.push(x));req.resume();res.writeHead(401).end();});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const marker='fixture-private-token-name-body-marker',question='private test question 🌟',encoded=Buffer.from(question).toString('base64');const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/upload?filename='+marker,{method:'POST',headers:{Authorization:'Bearer '+marker,'X-Inbox-Request-ID':marker,'X-Private-Filename':marker,'X-Inbox-Caption':encoded,'X-Inbox-Caption-Source':'manual-entry'},body:marker});await r.text();
  assert.equal(r.status,401);assert.match(r.headers.get('x-inbox-request-id'),/^[a-f0-9-]{36}$/);assert.equal(logs.length,1);assert.equal(logs[0].status,401);assert.ok(!JSON.stringify(logs).includes(marker));assert.ok(!JSON.stringify(logs).includes(question));assert.ok(!JSON.stringify(logs).includes(encoded));assert.deepEqual(Object.keys(logs[0]).sort(),['event','time','requestId','method','status','errorCategory'].sort());
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
