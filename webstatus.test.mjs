import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./web/app.js',import.meta.url),'utf8');
for(const [status,expected]of [[401,/配对已失效/],[404,/图片已过期/],[503,/无法查询状态/]])test('legacy receipt reopens without resend '+status+' is explicit',async()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:'',disabled:false});return nodes.get(id);};
 const item={id:'fixture_share_12345678',remote:'fixture-file',created:Date.now(),state:'queued'};
 const context={AbortController,document:{getElementById:get},location:{origin:'https://fixture.test',search:''},history:{replaceState(){}},navigator:{},URL,URLSearchParams,Date,crypto:{randomUUID:()=>''},D:{setting:async()=> 'fixture-token',all:async()=>[item],put:async()=>{},get:async()=>item,del:async()=>{}},fetch:async()=>({status,ok:false}),console};
 vm.runInNewContext(source,context);await new Promise(r=>setTimeout(r,10));assert.match(get('status').textContent,/此前已发送/);assert.equal(get('retry').disabled,false);assert.equal(get('retry').hidden,true);assert.equal(item.remote,'fixture-file');
});
