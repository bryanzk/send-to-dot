import test from 'node:test';
import assert from 'node:assert/strict';
import { Webhook } from 'standardwebhooks';
import {publicIPv4,callbackURL,resolveCallback,verifyCallback,beforeDeadline} from './callback.mjs';
test('deadline bounds hanging DNS work',async()=>{
  await assert.rejects(beforeDeadline(new Promise(()=>{}),5),/timeout/);
  assert.equal(await beforeDeadline(Promise.resolve('done'),100),'done');
});
test('reject private, special, encoded IP, IPv6, credentials and non-HTTPS targets',async()=>{
  for(const ip of ['127.0.0.1','10.1.1.1','100.64.0.1','169.254.169.254','172.16.0.1','192.168.0.1','198.18.1.1','192.0.2.1','203.0.113.1','224.0.0.1','255.255.255.255','::1','::ffff:127.0.0.1'])assert.equal(publicIPv4(ip),false,ip);
  assert.equal(publicIPv4('8.8.8.8'),true);
  for(const u of ['http://example.com','https://127.1','https://2130706433','https://[::1]','https://a:b@example.com','https://example.com:8443','https://localhost','https://example.com/#x'])assert.throws(()=>callbackURL(u));
  await assert.rejects(resolveCallback('https://example.com',async()=>['8.8.8.8','10.0.0.1']));
  await assert.rejects(resolveCallback('https://example.com',async()=>[]));
  assert.equal((await resolveCallback('https://example.com',async()=>['8.8.8.8'])).address,'8.8.8.8');
});
test('fresh signed challenges, exact echo and successful status required',async()=>{
  const secret='whsec_'+Buffer.alloc(32,1).toString('base64');
  const subscription={id:'test',url:'https://callback.example.test',secret};
  const challenges=[];
  const echo=async(_u,m)=>{const p=new Webhook(secret).verify(m.body,m.headers);challenges.push(p.challenge);return {status:200,body:JSON.stringify({challenge:p.challenge})};};
  assert.equal(await verifyCallback(subscription,echo),true);
  assert.equal(await verifyCallback(subscription,echo),true);
  assert.notEqual(challenges[0],challenges[1]);
  for(const body of ['null','[]','42','"text"'])assert.equal(await verifyCallback(subscription,async()=>({status:200,body})),false);
  for(const response of [{status:302,body:'{}'},{status:500,body:'{}'},{status:200,body:'bad'},{status:200,body:JSON.stringify({challenge:challenges[0]})}])assert.equal(await verifyCallback(subscription,async()=>response),false);
});
