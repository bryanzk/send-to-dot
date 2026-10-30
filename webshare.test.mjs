import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {webcrypto} from 'node:crypto';
test('share_target worker captures one file locally, redirects without network upload and rejects multi-file',async()=>{
 const listeners={},saved=[];const context={URL,importScripts:()=>{},self:{addEventListener:(n,f)=>listeners[n]=f,skipWaiting:()=>{}},location:{origin:'https://approved.example.test'},crypto:webcrypto,File,Response:class extends Response{static redirect(url,status){return {url,status};}},clients:{claim:async()=>{}},caches:{},D:{put:async x=>saved.push(x)}};
 vm.runInNewContext(readFileSync(new URL('./web/sw.js',import.meta.url),'utf8'),context);
 async function share(count){const data=new FormData();for(let i=0;i<count;i++)data.append('image',new File(['fixture'],'test.png',{type:'image/png'}));let output;listeners.fetch({request:new Request('https://approved.example.test/share',{method:'POST',body:data}),respondWith:p=>output=p});return output;}
 const one=await share(1);assert.equal(one.status,303);assert.match(one.url,/^\/\?share=/);assert.equal(saved.length,1);assert.equal(saved[0].state,'local');const two=await share(2);assert.equal(two.status,400);assert.equal(saved.length,1);
});
