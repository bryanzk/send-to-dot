import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const RECEIPT=/^read_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH=/^[0-9a-f]{64}$/;
function owned(s,mode){return s.uid===process.getuid()&&(s.mode&0o777)===mode;}
export class ReadCache {
 constructor(directory,{clock=Date.now,maxEntries=4,maxBytes=33554432,ttlMs=300000}={}){
  this.directory=path.resolve(directory);this.clock=clock;this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.ttlMs=ttlMs;
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('Invalid cache limits');
  fs.mkdirSync(this.directory,{recursive:true,mode:0o700});this.checkDirectory();
 }
 checkDirectory(){const s=fs.lstatSync(this.directory);if(!s.isDirectory()||s.isSymbolicLink()||!owned(s,0o700)||fs.realpathSync(this.directory)!==this.directory)throw Error('Unsafe cache directory');}
 paths(receipt){if(!RECEIPT.test(receipt))throw Error('Invalid read receipt');return {manifest:path.join(this.directory,receipt+'.json'),body:path.join(this.directory,receipt+'.bin'),claimed:path.join(this.directory,receipt+'.claimed.json'),temporary:path.join(this.directory,receipt+'.json.tmp')};}
 readManifest(file){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=fs.fstatSync(fd);if(!s.isFile()||!owned(s,0o600)||s.nlink!==1||s.size>4096)throw Error('Unsafe cache manifest');return JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}}
 delete(receipt){this.checkDirectory();const p=this.paths(receipt);for(const file of Object.values(p)){try{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||!owned(s,0o600)||s.nlink!==1)throw Error('Unsafe cache entry');fs.unlinkSync(file);}catch(e){if(e.code!=='ENOENT')throw e;}}}
 sweep(){this.checkDirectory();const now=this.clock();for(const name of fs.readdirSync(this.directory)){const partial=/^(read_[0-9a-f-]+)\.json\.tmp$/.exec(name);if(partial&&RECEIPT.test(partial[1])){this.delete(partial[1]);continue;}const match=/^(read_[0-9a-f-]+)(?:\.claimed)?\.json$/.exec(name);if(!match||!RECEIPT.test(match[1]))continue;try{const m=this.readManifest(path.join(this.directory,name));if(m.receipt!==match[1]||!Number.isSafeInteger(m.expires_at))throw Error('Invalid cache manifest');if(m.expires_at<=now)this.delete(match[1]);}catch(e){if(e.code!=='ENOENT')throw e;}}
  for(const name of fs.readdirSync(this.directory)){const m=/^(read_[0-9a-f-]+)\.bin$/.exec(name);if(!m||!RECEIPT.test(m[1]))continue;const p=this.paths(m[1]);if(!fs.existsSync(p.manifest)&&!fs.existsSync(p.claimed)&&!fs.existsSync(p.temporary))this.delete(m[1]);}
 }
 stage(bytes,metadata){
  this.checkDirectory();this.sweep();
  const {file_id,event_id,owner,grant_hash,sha256,mime,expires_at}=metadata;
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>8388608||bytes.length>this.maxBytes||typeof owner!=='string'||!owner||owner.length>128||!HASH.test(grant_hash)||!HASH.test(sha256)||!['image/png','image/jpeg'].includes(mime)||!/^evt_[A-Za-z0-9_-]{8,100}$/.test(event_id)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(file_id)||!Number.isSafeInteger(expires_at)||expires_at<=this.clock()||createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('Invalid cache source');
  // A claimed entry is in use: do not evict or replace its files.
  const entries=fs.readdirSync(this.directory).filter(n=>/^read_[0-9a-f-]+\.json$/.test(n)&&!n.endsWith('.claimed.json')).map(n=>this.readManifest(path.join(this.directory,n))).sort((a,b)=>a.created_at-b.created_at);
  const claimed=fs.readdirSync(this.directory).filter(n=>/^read_[0-9a-f-]+\.claimed\.json$/.test(n)).map(n=>this.readManifest(path.join(this.directory,n)));
  let count=entries.length+claimed.length,size=[...entries,...claimed].reduce((n,m)=>n+m.byte_length,0);
  while(count>=this.maxEntries||size+bytes.length>this.maxBytes){const old=entries.shift();if(!old)throw Error('Read cache busy');this.delete(old.receipt);count--;size-=old.byte_length;}
  const receipt='read_'+randomUUID(),p=this.paths(receipt),now=this.clock();
  const m={version:1,receipt,file_id,event_id,owner,grant_hash,sha256,mime,byte_length:bytes.length,created_at:now,expires_at:Math.min(expires_at,now+this.ttlMs)};
  const write=(file,data)=>{const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
  try{write(p.temporary,JSON.stringify(m));write(p.body,bytes);fs.renameSync(p.temporary,p.manifest);const fd=fs.openSync(this.directory,fs.constants.O_RDONLY);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  catch(e){for(const f of [p.body,p.manifest+'.tmp',p.manifest])try{fs.unlinkSync(f);}catch{}throw e;}
  return receipt;
 }
}
