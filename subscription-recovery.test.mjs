import test from 'node:test';
import assert from 'node:assert/strict';
import {Inbox} from './store.mjs';
import {createApp} from './server.mjs';

// Real SDK wire handlers and real in-memory persistence. Callback network and
// receiver are injected so tests cannot contact ChatGPT or use live credentials.
function fixture({grantTtl=86400000}={}) {
 let now=0,verifies=0,allowCallback=true,verificationHook=()=>{};
 const inbox=new Inbox(':memory:',Buffer.alloc(32,31),{clock:()=>now,validate:()=> 'image/png'});
 inbox.grant('fixture-phone','owner','upload');inbox.grant('fixture-chat','owner','read subscribe',grantTtl);
 const origin='https://fixture-inbox.example.test',sent=[],accepted=new Set();
 const app=createApp({origin,redirects:['https://chat.example.test/callback'],approvalSecret:'disposable-owner-fixture'}, {
  inbox,callbackVerifier:async()=>{verifies++;await verificationHook();return allowCallback;},
  dispatcher:async(_url,message)=>{const event=JSON.parse(message.body);sent.push(event);accepted.add(event.eventId);return {status:200};}
 });
 async function rpc(method,params={}) {
  const response=await app.fetch(new Request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer fixture-chat','Content-Type':'application/json',Accept:'application/json, text/event-stream','Mcp-Method':method,'Mcp-Protocol-Version':'2026-07-28'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'subscription-recovery-fixture',version:'1'}}}})}));
  const text=await response.text(),data=text.startsWith('event:')||text.startsWith('data:')?text.split('\n').find(line=>line.startsWith('data:')).slice(5):text;
  return {status:response.status,body:JSON.parse(data)};
 }
 const subscribe=(ttlMs=1000)=>rpc('events/subscribe',{name:'file.created',arguments:{inbox_id:'personal'},delivery:{mode:'webhook',url:'https://callback.example.test/events',secret:'whsec_'+Buffer.alloc(32,2).toString('base64')},ttlMs});
 return {inbox,app,sent,accepted,subscribe,get verifies(){return verifies;},setNow(value){now=value;},setAllowed(value){allowCallback=value;},onVerify(fn){verificationHook=fn;},upload(id){return inbox.upload('fixture-phone',id,Buffer.from('synthetic generated pixels'),'image/png');},close(){inbox.close();}};
}

test('platform renewal before expiry re-verifies callback, extends same subscription and preserves delivered dedupe',async()=>{
 const f=fixture();try {
  const first=await f.subscribe();assert.ok(first.body.result?.id);assert.equal(first.body.result.refreshBefore,new Date(1000).toISOString());
  f.setNow(100);const image=f.upload('fixture_before_expiry_01');await f.app.deliver();assert.equal(f.sent.length,1);
  f.setNow(900);const renewed=await f.subscribe();assert.equal(renewed.body.result.id,first.body.result.id);assert.equal(renewed.body.result.refreshBefore,new Date(1900).toISOString());assert.equal(f.verifies,2);
  f.setNow(1000);await f.app.deliver();assert.equal(f.sent.length,1,'renewal must not replay already delivered queue rows');
  const next=f.upload('fixture_before_expiry_02');await f.app.deliver();assert.deepEqual(f.sent.map(event=>event.eventId),[image.eventId,next.eventId]);
 }finally{f.close();}
});

test('expired subscription recreated with same identity replays retained images under stable event IDs for receiver dedupe',async()=>{
 const f=fixture();try {
  const first=await f.subscribe();f.setNow(100);const old=f.upload('fixture_recreate_retained_01');await f.app.deliver();
  f.setNow(1000);assert.equal(f.inbox.pending().length,0);f.setNow(1100);const duringGap=f.upload('fixture_recreate_retained_02');await f.app.deliver();assert.equal(f.sent.length,1);
  const recreated=await f.subscribe();assert.equal(recreated.body.result.id,first.body.result.id);assert.equal(f.inbox.pending().length,2);
  await f.app.deliver();assert.equal(f.sent.length,3,'expiry removes delivery ledger, so retained old event can replay');
  assert.equal(f.sent.filter(event=>event.eventId===old.eventId).length,2);assert.equal(f.sent.filter(event=>event.eventId===duringGap.eventId).length,1);
  assert.equal(f.accepted.size,2,'receiver deduplication by stable eventId prevents duplicate processing');
  await f.subscribe();await f.app.deliver();assert.equal(f.sent.length,3,'subsequent unexpired refresh must not enqueue again');
 }finally{f.close();}
});

test('server does not self-renew an expired callback subscription while uploads remain retained',async()=>{
 const f=fixture();try {
  await f.subscribe();f.setNow(1000);f.upload('fixture_no_selfrenew_01');
  for(let i=0;i<3;i++){f.setNow(1100+i*100);await f.app.deliver();}
  assert.equal(f.verifies,1);assert.equal(f.sent.length,0);assert.equal(f.inbox.pending().length,0);
  await f.subscribe();await f.app.deliver();assert.equal(f.verifies,2);assert.equal(f.sent.length,1);
 }finally{f.close();}
});

test('failed callback verification does not extend or recreate subscription',async()=>{
 const f=fixture();try {
  await f.subscribe();f.setNow(500);f.setAllowed(false);const denied=await f.subscribe();assert.ok(denied.body.error);
  f.setNow(1000);f.upload('fixture_failed_verify_01');await f.app.deliver();assert.equal(f.sent.length,0);
  const recreated=await f.subscribe();assert.ok(recreated.body.error);assert.equal(f.inbox.pending().length,0);
 }finally{f.close();}
});

test('grant expiry blocks renewal and pending delivery even if subscription TTL remains',async()=>{
 const f=fixture({grantTtl:1000});try {
  await f.subscribe(5000);f.setNow(900);const image=f.upload('fixture_expired_grant_01');assert.equal(f.inbox.pending().length,1);
  f.setNow(1000);const expired=await f.subscribe(5000);assert.equal(expired.status,401);assert.equal(f.verifies,1,'expired grant is rejected before callback verification');
  await f.app.deliver();assert.equal(f.sent.length,0);assert.equal(f.inbox.pending().length,0);assert.throws(()=>f.inbox.read('fixture-chat',image.file_id),/Forbidden/);
 }finally{f.close();}
});

test('grant expiry during callback verification fails closed without recording subscription',async()=>{
 const f=fixture({grantTtl:1000});try {
  f.onVerify(()=>f.setNow(1000));const expired=await f.subscribe();assert.ok(expired.body.error);f.upload('fixture_midverify_expiry_01');assert.equal(f.inbox.pending().length,0);await f.app.deliver();assert.equal(f.sent.length,0);
 }finally{f.close();}
});

test('requested subscription TTL is capped at one hour',async()=>{
 const f=fixture();try{const result=await f.subscribe(7200000);assert.equal(result.body.result.refreshBefore,new Date(3600000).toISOString());}finally{f.close();}
});
