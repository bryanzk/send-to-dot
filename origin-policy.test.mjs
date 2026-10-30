import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {Inbox} from './store.mjs';import {createApp} from './server.mjs';
test('OAuth form preserves same-origin Origin while rejecting null/missing/foreign origins',async()=>{
 const origin='https://fixture.example.test',redirect='https://chat.example.test/callback',box=new Inbox(':memory:',Buffer.alloc(32,7));
 const app=createApp({origin,redirects:[redirect],approvalSecret:'nonsecret-fixture-owner'},{inbox:box});
 try{const registration=await app.fetch(new Request(origin+'/oauth/register',{method:'POST',body:JSON.stringify({redirect_uris:[redirect]})}));const client=await registration.json();
 const p=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update('x'.repeat(43)).digest('base64url'),scope:'read subscribe',resource:origin+'/mcp',state:'fixture'});
 const page=await app.fetch(new Request(origin+'/oauth/authorize?'+p));assert.equal(page.status,200);assert.equal(page.headers.get('referrer-policy'),'same-origin');
 p.set('approval','nonsecret-fixture-owner');for(const bad of [null,'null','https://foreign.example.test']){const headers={'Content-Type':'application/x-www-form-urlencoded'};if(bad!==null)headers.Origin=bad;const r=await app.fetch(new Request(origin+'/oauth/approve',{method:'POST',headers,body:p}));assert.equal(r.status,403);assert.deepEqual(await r.json(),{error:'Origin rejected'});}
 const allowed=await app.fetch(new Request(origin+'/oauth/approve',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:p}));assert.equal(allowed.status,303);const url=new URL(allowed.headers.get('location'));assert.equal(url.origin,'https://chat.example.test');assert.equal(url.searchParams.get('iss'),origin);assert.equal(url.searchParams.get('state'),'fixture');assert.ok(url.searchParams.get('code'));
 }finally{box.close();}
});
