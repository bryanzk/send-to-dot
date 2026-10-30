import test from 'node:test';import assert from 'node:assert/strict';import {nodeHandler} from './http_bridge.mjs';
const response=()=>({headersSent:false,status:0,writeHead(s){this.headersSent=true;this.status=s;return this;},end(){this.ended=true;},write(){return true;}});
test('HTTP boundary bounds concurrent request body readers',async()=>{
 let release;const wait=new Promise(r=>release=r);let calls=0;
 const slow={headers:{},method:'POST',url:'/api/upload',async *[Symbol.asyncIterator](){await wait;yield Buffer.from('x');},destroy(){}};
 const handler=nodeHandler(async()=>{calls++;return new Response('ok');},'https://fixture.test',{maxConcurrent:1});
 const first=response(),pending=handler(slow,first);const second=response();await handler(slow,second);assert.equal(second.status,503);release();await pending;assert.equal(first.status,200);assert.equal(calls,1);
});
test('HTTP boundary bounds incomplete request duration',async()=>{
 let unblock;const request={headers:{},method:'POST',url:'/api/upload',destroy(){this.destroyed=true;unblock();},async *[Symbol.asyncIterator](){await new Promise(r=>unblock=r);throw Error('closed');}};
 const out=response(),handler=nodeHandler(async()=>{throw Error('must not reach handler');},'https://fixture.test',{requestTimeoutMs:5});await handler(request,out);assert.equal(out.status,408);assert.equal(request.destroyed,true);
});
