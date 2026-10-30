import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,lstatSync,rmSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {deploymentOrigin,callbackURI,initialize} from './scripts/setup.mjs';import {DatabaseSync} from 'node:sqlite';
test('BYO setup rejects unsafe/stale origins and wildcard callbacks',()=>{
 for(const x of ['http://inbox.example.test','https://u:p@inbox.example.test','https://inbox.example.test/path','https://*.example.test'])assert.throws(()=>deploymentOrigin(x));
 assert.equal(deploymentOrigin('https://inbox.example.test/'),'https://inbox.example.test');const trialOrigin='https://'+['one','two','three','four'].join('-')+'.trycloudflare.com';assert.throws(()=>deploymentOrigin(trialOrigin));assert.equal(deploymentOrigin(trialOrigin,{trial:true}),trialOrigin);
 for(const x of ['http://chat.example/cb','https://*.example/cb','https://%2a.example/cb','https://chat.example/cb?x=1'])assert.throws(()=>callbackURI(x));
});
test('one command prepares private fresh project; rerun never overwrites it',()=>{
 const root=mkdtempSync(join(tmpdir(),'dot-setup-fixture-'));try{const args={root,origin:'https://inbox.example.test',pythonExecutable:'python3'};assert.equal(initialize({...args,dryRun:true}).status,'checks_passed_no_changes');assert.equal(existsSync(join(root,'.secrets')),false);
 const result=initialize(args);assert.equal(result.secretsPrinted,false);const c=JSON.parse(readFileSync(join(root,'approved.config.json'),'utf8'));assert.equal(c.initializePhone,false);assert.equal(c.origin,args.origin);for(const p of [c.storageKeyFile,c.approvalSecretFile,c.phoneCredentialFile])assert.equal(lstatSync(p).mode&0o077,0);
 const db=new DatabaseSync(c.database,{readOnly:true});assert.equal(db.prepare("SELECT count(*) n FROM tokens WHERE scope='upload'").get().n,1);db.close();const original=readFileSync(c.storageKeyFile);assert.throws(()=>initialize(args),/preserved/);assert.deepEqual(readFileSync(c.storageKeyFile),original);assert.equal(existsSync(join(root,'.setup.lock')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
