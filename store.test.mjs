import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Inbox,decodeImage} from './store.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGNkYPjPgA0wYRUdtBIAy0MBD1YkjLoAAAAASUVORK5CYII=','base64');
test('decoder validates full pixels and rejects spoof/truncation',()=>{assert.equal(decodeImage(png),'image/png');for(const b of [Buffer.from('not png'),png.subarray(0,30)])assert.throws(()=>decodeImage(b));});
test('private authorization, encrypted persistence, durable event retry, expiry',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dot-inbox-')),path=join(dir,'state','inbox.sqlite'),key=Buffer.alloc(32,7);let now=1000;let box;
 try{
 box=new Inbox(path,key,{clock:()=>now});for(const [t,o,s] of [['phone','owner','upload'],['reader','owner','read'],['subscriber','owner','subscribe'],['other','other','read']])box.grant(t,o,s);
 box.subscribeVerified('subscriber',{id:'sub_1',url:'https://callback.example.test',secret:'fixture-secret'});
 const a=box.upload('phone','unique_share_123456',png,'image/png');assert.deepEqual(box.upload('phone','unique_share_123456',png,'image/png'),a);
 assert.throws(()=>box.upload('phone','unique_share_123456',Buffer.from('changed'),'image/png'),/conflict/);
 assert.throws(()=>box.read('phone',a.file_id),/Forbidden/);assert.throws(()=>box.read('other',a.file_id),/Not found/);
 assert.deepEqual(box.read('reader',a.file_id).bytes,png);assert.equal(box.pending().length,1);box.acknowledge(a.eventId,'sub_1',500);assert.equal(box.pending().length,0);
 box.close();box=new Inbox(path,key,{clock:()=>now});now+=2000;assert.equal(box.pending()[0].event,a.eventId);box.acknowledge(a.eventId,'sub_1',200);assert.equal(box.status('phone',a.file_id).state,'callback_accepted');
 assert.equal(readFileSync(path).includes(png),false);assert.equal(readFileSync(path).includes(Buffer.from('fixture-secret')),false);
 box.revoke('reader');assert.throws(()=>box.read('reader',a.file_id));now+=3600001;box.sweep();assert.throws(()=>box.status('phone',a.file_id),/Not found/);assert.equal(box.pending().length,0);
 }finally{box?.close();rmSync(dir,{recursive:true,force:true});}
});
