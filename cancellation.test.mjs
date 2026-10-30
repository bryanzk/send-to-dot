import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nodeHandler} from './http_bridge.mjs';
const source=readFileSync(new URL('./web/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

for(const action of ['discard','disconnect'])for(const phase of ['upload','json','persist'])test(`${action} during delayed explicit send ${phase} does not restore a cancelled image or overwrite UI`,async()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:'',disabled:false});return nodes.get(id);};
 const item={id:'fixture_cancel_12345678',created:Date.now(),state:'local',caption:'',file:{type:'image/png'}};
 const stored=new Map([[item.id,item]]),reached=deferred(),resume=deferred();let token='fixture-upload-only',signal,puts=0,statusCalls=0;
 const context={document:{getElementById:get},location:{origin:'https://fixture.test',search:''},history:{replaceState(){}},navigator:{},
  URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},URLSearchParams,Date,AbortController,TextEncoder,btoa,crypto:{randomUUID:()=>''},console,
  D:{setting:async(_key,value)=>{if(value!==undefined)token=value;return token;},all:async()=>[...stored.values()],get:async id=>stored.get(id),del:async id=>stored.delete(id),put:async value=>{puts++;if(phase==='persist'){reached.resolve();await resume.promise;}stored.set(value.id,value);}},
  fetch:async(url,options)=>{
   if(url!=='/api/upload'){statusCalls++;return {ok:true,status:200,json:async()=>({state:'callback_accepted'})};}
   signal=options.signal;if(phase==='upload'){reached.resolve();await resume.promise;}
   return {ok:true,status:201,json:async()=>{if(phase==='json'){reached.resolve();await resume.promise;}return {file_id:'fixture-server-id'};}};
  }};
 await vm.runInNewContext(source,context);const startup=get('retry').onclick();await reached.promise;
 await get(action).onclick();const cancelledText=get('status').textContent;
 if(signal)assert.equal(signal.aborted,true);assert.equal(stored.size,0);assert.equal(get('preview').hidden,true);assert.equal(get('retry').disabled,false);
 if(action==='disconnect'){assert.equal(token,'');assert.equal(get('pair').hidden,false);assert.match(cancelledText,/配对和暂存已清除/);}else assert.match(cancelledText,/暂存已删除/);
 resume.resolve();await startup;
 assert.equal(stored.size,0,'late response/persist cannot resurrect original image');
 assert.equal(get('status').textContent,cancelledText,'late completion cannot overwrite cancellation status');
 assert.equal(statusCalls,0,'cancelled upload does not initiate a status poll');
 if(phase!=='persist')assert.equal(puts,1,'only pre-upload frozen record was persisted, never the late receipt');
});

function req(){return {headers:{},method:'GET',url:'/',destroy(){this.destroyed=true;},async *[Symbol.asyncIterator](){}};}
function res(){return {headersSent:false,writableEnded:false,destroyed:false,status:0,writes:[],writeHead(status){this.status=status;this.headersSent=true;this.writes.push(['head',status]);return this;},end(body){this.writableEnded=true;this.writes.push(['end',body]);return this;}};}

for(const phase of ['fetch','response-body'])test(`HTTP ${phase} deadline releases concurrency slot and late completion cannot write`,async()=>{
 const stalled=deferred(),reached=deferred();let calls=0,cancelled=false,requestSignal;
 const handler=nodeHandler(async request=>{
  calls++;if(calls>1)return new Response('recovered');requestSignal=request.signal;
  if(phase==='fetch'){reached.resolve();return stalled.promise;}
  return {status:200,headers:new Headers(),body:{getReader(){return {read(){reached.resolve();return stalled.promise;},cancel(){cancelled=true;return Promise.resolve();},releaseLock(){}};}}};
 },'https://fixture.test',{maxConcurrent:1,requestTimeoutMs:20});
 const first=res(),firstReq=req(),pending=handler(firstReq,first);await reached.promise;await pending;
 assert.equal(first.status,408);assert.equal(firstReq.destroyed,true);assert.equal(requestSignal.aborted,true);if(phase==='response-body')assert.equal(cancelled,true);
 const writesBefore=first.writes.length,second=res();await handler(req(),second);assert.equal(second.status,200,'timed out request must release slot');assert.equal(calls,2);
 stalled.resolve(phase==='fetch'?new Response('late'):{done:false,value:Buffer.from('late')});await Promise.resolve();await Promise.resolve();
 assert.equal(first.writes.length,writesBefore,'late fetch/body completion must not write after timeout');
});
