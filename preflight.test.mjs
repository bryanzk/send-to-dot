import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';import {initialize} from './scripts/setup.mjs';
test('preflight verifies actual grant metadata and rejects expired grant or missing database',()=>{
 const root=mkdtempSync(join(tmpdir(),'dot-preflight-fixture-'));try{mkdirSync(join(root,'scripts'));copyFileSync(new URL('./scripts/preflight.mjs',import.meta.url),join(root,'scripts/preflight.mjs'));initialize({root,origin:'https://inbox.example.test',pythonExecutable:process.env.DOT_INBOX_PYTHON??'python3'});
 const inspect=()=>{const r=spawnSync(process.execPath,[join(root,'scripts/preflight.mjs'),join(root,'approved.config.json')],{encoding:'utf8'});return JSON.parse(r.stdout).checks.find(x=>x.check==='Private runtime metadata and active upload grant');};assert.equal(inspect().status,'pass');
 const db=new DatabaseSync(join(root,'state/private.sqlite'));db.exec('UPDATE tokens SET expires=0');db.close();assert.equal(inspect().status,'fail');rmSync(join(root,'state/private.sqlite'));assert.equal(inspect().status,'fail');
 }finally{rmSync(root,{recursive:true,force:true});}
});
