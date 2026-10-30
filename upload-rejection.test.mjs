import test from 'node:test';import assert from 'node:assert/strict';
import {Inbox} from './store.mjs';import {createApp} from './server.mjs';
test('upload validation records only fixed reason, never supplied errors, images or questions',async()=>{
 for(const [error,reason] of [['Invalid image','invalid_image'],['Invalid caption','invalid_caption'],['Invalid upload','invalid_upload'],['Inbox full','inbox_full'],['Idempotency conflict','idempotency_conflict'],['private-secret-question-filename','request_rejected'],['__proto__','request_rejected'],['constructor','request_rejected']]){
  const logs=[],box=new Inbox(':memory:',Buffer.alloc(32,9));box.grant('fixture-private-token','owner','upload');box.upload=()=>{throw Error(error);};
  const origin='https://fixture.example.test',app=createApp({origin,redirects:['https://chat.example.test/cb'],approvalSecret:'fixture-only',audit:x=>logs.push(x)},{inbox:box});
  try{const result=await app.fetch(new Request(origin+'/api/upload',{method:'POST',headers:{Origin:origin,Authorization:'Bearer fixture-private-token','Content-Type':'image/jpeg','X-Share-ID':'fixture_upload_123456'},body:'private-image-bytes'}));assert.equal(result.status,400);assert.deepEqual(logs,[{event:'upload.validation',outcome:reason}]);assert.doesNotMatch(JSON.stringify(logs),/private-secret|private-image|fixture-private/);}finally{box.close();}
 }
});
