import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Inbox} from './store.mjs';
import {OAuth} from './oauth.mjs';

// These fixtures intentionally bypass pixel decoding to isolate queue/auth behavior.
// Actual PNG decoding and HTTP byte preservation are covered in other test files.
function fixture(path=':memory:') {
  let now=1000;
  const options={clock:()=>now,validate:()=> 'image/png'};
  const key=Buffer.alloc(32,19);
  let box=new Inbox(path,key,options);
  box.grant('fixture-phone','owner','upload');
  box.grant('fixture-chat','owner','read subscribe');
  const subscribe=()=>box.subscribeVerified('fixture-chat',{id:'fixture-sub',url:'https://callback.example.test',secret:'not-a-live-secret'});
  return {get box(){return box;},setNow(n){now=n;},advance(n){now+=n;},subscribe,
    upload:(id='fixture_share_000001')=>box.upload('fixture-phone',id,Buffer.from('synthetic fixture'),'image/png'),
    reopen(){box.close();box=new Inbox(path,key,options);},close(){box.close();}};
}

test('restart after retry scheduling retains one event; delivered work does not replay on restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'send-to-dot-recovery-'));
  const f=fixture(join(dir,'state','fixture.sqlite'));
  try {
    f.subscribe();const original=f.upload();
    f.box.acknowledge(original.eventId,'fixture-sub',503);
    f.reopen();assert.deepEqual(f.upload(),original);assert.equal(f.box.pending().length,0);
    f.advance(1000);const pending=f.box.pending();assert.equal(pending.length,1);assert.equal(pending[0].event,original.eventId);
    f.box.acknowledge(original.eventId,'fixture-sub',204);f.reopen();f.advance(10000);
    assert.equal(f.box.pending().length,0);assert.equal(f.box.status('fixture-phone',original.file_id).state,'callback_accepted');
  } finally {f.close();rmSync(dir,{recursive:true,force:true});}
});

test('six failed callback attempts become terminal, including after resubscribe',()=>{
 const f=fixture();try {
  f.subscribe();const item=f.upload();
  for(let attempt=0;attempt<6;attempt++){
   const pending=f.box.pending();assert.equal(pending.length,1,`attempt ${attempt+1}`);assert.equal(pending[0].event,item.eventId);
   f.box.acknowledge(item.eventId,'fixture-sub',503);
   assert.equal(f.box.pending().length,0);f.advance(1000*2**attempt);
  }
  assert.equal(f.box.pending().length,0);assert.equal(f.box.status('fixture-phone',item.file_id).state,'delivery_failed');
  f.subscribe();assert.equal(f.box.pending().length,0,'refresh must not revive exhausted queue rows');
 }finally{f.close();}
});

for(const status of [410,413])test(`callback ${status} is terminal without retry`,()=>{
 const f=fixture();try{f.subscribe();const item=f.upload();f.box.acknowledge(item.eventId,'fixture-sub',status);f.advance(60000);assert.equal(f.box.pending().length,0);assert.equal(f.box.status('fixture-phone',item.file_id).state,'delivery_failed');}finally{f.close();}
});

for(const action of ['revoke','unsubscribe','expiry'])test(`${action} prevents pending delivery and authorized read after appropriate boundary`,()=>{
 const f=fixture();try{
  f.subscribe();const item=f.upload();assert.equal(f.box.pending().length,1);
  if(action==='revoke'){f.box.revoke('fixture-chat');assert.throws(()=>f.box.read('fixture-chat',item.file_id),/Forbidden/);}
  else if(action==='unsubscribe')f.box.unsubscribe('fixture-chat','fixture-sub');
  else {f.advance(3600000);assert.throws(()=>f.box.read('fixture-chat',item.file_id),/Not found/);}
  assert.equal(f.box.pending().length,0);
 }finally{f.close();}
});

test('invalid upload creates no work; 20-image quota recovers after image expiry',()=>{
 const f=fixture();try{
  f.subscribe();
  assert.throws(()=>f.box.upload('fixture-phone','short',Buffer.from('x'),'image/png'),/Invalid upload/);
  assert.throws(()=>f.box.upload('fixture-phone','fixture_mismatch_0001',Buffer.from('x'),'image/jpeg'),/Invalid image/);
  assert.equal(f.box.pending().length,0);
  for(let i=0;i<20;i++)f.upload(`fixture_quota_${String(i).padStart(4,'0')}`);
  assert.equal(f.box.pending().length,20);assert.throws(()=>f.upload('fixture_quota_overflow'),/Inbox full/);
  f.advance(3600000);f.subscribe();assert.doesNotThrow(()=>f.upload('fixture_quota_after_expiry'));assert.equal(f.box.pending().length,1);
 }finally{f.close();}
});

test('OAuth resource, verifier, expiry and replay cannot mint a grant; valid retry after wrong verifier works',()=>{
 const f=fixture();try{
  let now=0;const origin='https://inbox.example.test',redirect='https://chat.example.test/callback';
  const oauth=new OAuth(f.box,{origin,redirects:[redirect],approvalSecret:'fixture-owner',clock:()=>now});
  const client=oauth.register({redirect_uris:[redirect]});const verifier='v'.repeat(43);
  const params={client_id:client.client_id,redirect_uri:redirect,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),scope:'read subscribe',resource:origin+'/mcp'};
  assert.throws(()=>oauth.validate({...params,resource:'https://wrong.example.test/mcp'}),/Invalid authorization/);
  const issue=()=>new URL(oauth.approve(params,'fixture-owner')).searchParams.get('code');
  const grant=code=>({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:redirect,code,code_verifier:verifier,resource:origin+'/mcp'});
  const first=grant(issue());assert.throws(()=>oauth.exchange({...first,resource:'https://wrong.example.test/mcp'}),/Invalid grant/);
  assert.throws(()=>oauth.exchange({...first,code_verifier:'z'.repeat(43)}),/Invalid grant/);
  const valid=oauth.exchange(first);assert.equal(f.box.auth(valid.access_token,'read'),'owner');assert.throws(()=>oauth.exchange(first),/Invalid grant/);
  const expired=grant(issue());now=120000;assert.throws(()=>oauth.exchange(expired),/Invalid grant/);
 }finally{f.close();}
});
