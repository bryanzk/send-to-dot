import { DatabaseSync } from 'node:sqlite';
import { createHash,createCipheriv,createDecipheriv,randomBytes,randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync,mkdirSync,lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeCaption,captionAAD,submissionMetadata} from './caption.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export class Inbox {
  constructor(path,key,{clock=Date.now,validate=decodeImage}={}) {
    if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Storage key required');
    this.key=key;this.clock=clock;this.validate=validate;
    if(path!==':memory:'){
      mkdirSync(dirname(path),{recursive:true,mode:0o700});
      if(lstatSync(dirname(path)).isSymbolicLink())throw Error('Unsafe directory');
      chmodSync(dirname(path),0o700);
      try{if(lstatSync(path).isSymbolicLink())throw Error('Unsafe database');}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    this.db=new DatabaseSync(path);if(path!==':memory:')chmodSync(path,0o600);
    this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY,owner TEXT,scope TEXT,expires INTEGER);
      CREATE TABLE IF NOT EXISTS images(id TEXT PRIMARY KEY,owner TEXT,idem TEXT,digest TEXT,body BLOB,mime TEXT,expires INTEGER,event TEXT,UNIQUE(owner,idem));
      CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY,owner TEXT,url TEXT,secret BLOB,expires INTEGER,grant_hash TEXT);
      CREATE TABLE IF NOT EXISTS queue(event TEXT,subscription TEXT,attempt INTEGER DEFAULT 0,next INTEGER,status TEXT DEFAULT 'pending',PRIMARY KEY(event,subscription));`);
    if(!this.db.prepare('PRAGMA table_info(images)').all().some(x=>x.name==='caption'))this.db.exec('ALTER TABLE images ADD COLUMN caption BLOB');
  }
  seal(bytes,aad){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,iv);if(aad)c.setAAD(aad);return Buffer.concat([iv,c.update(bytes),c.final(),c.getAuthTag()]);}
  open(bytes,aad){const b=Buffer.from(bytes),d=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));if(aad)d.setAAD(aad);d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12,-16)),d.final()]);}
  grant(token,owner,scope,ttl=86400000){if(!token||!['upload','read','subscribe','read subscribe'].includes(scope))throw Error('Invalid grant');this.db.prepare('INSERT INTO tokens VALUES(?,?,?,?)').run(hash(token),owner,scope,this.clock()+ttl);}
  auth(token,scope){const t=this.db.prepare('SELECT * FROM tokens WHERE hash=?').get(hash(token??''));if(!t||!t.scope.split(' ').includes(scope)||t.expires<=this.clock())throw Error('Forbidden');return t.owner;}
  revoke(token){const row=this.db.prepare('SELECT * FROM tokens WHERE hash=?').get(hash(token));if(row?.scope.includes('subscribe'))this.db.prepare('DELETE FROM subscriptions WHERE owner=?').run(row.owner);this.db.prepare('DELETE FROM tokens WHERE hash=?').run(hash(token));this.sweep();}
  upload(token,idem,bytes,mime,{caption='',source='none'}={}){const owner=this.auth(token,'upload');this.sweep();
    caption=normalizeCaption(caption);if(caption&&source!=='manual-entry')throw Error('Invalid caption');if(source!=='none'&&source!=='manual-entry')throw Error('Invalid caption');
    if(Boolean(caption)!==/^(?:q_|webq_|iosq_|preflight_q_)/.test(idem))throw Error('Invalid caption');
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(idem)||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>8388608)throw Error('Invalid upload');
    const digest=hash(bytes),old=this.db.prepare('SELECT * FROM images WHERE owner=? AND idem=?').get(owner,idem);
    if(old){if(old.digest!==digest||old.mime!==mime||this.caption(old)!==caption)throw Error('Idempotency conflict');return {file_id:old.id,eventId:old.event};}
    if(this.db.prepare('SELECT count(*) n FROM images WHERE owner=?').get(owner).n>=20)throw Error('Inbox full');
    const detected=this.validate(bytes);if(detected!==mime)throw Error('Invalid image');
    const id=randomUUID(),event='evt_'+randomUUID();
    this.db.exec('BEGIN IMMEDIATE');try{
      const row={id,owner,digest,event};
      this.db.prepare('INSERT INTO images(id,owner,idem,digest,body,mime,expires,event,caption) VALUES(?,?,?,?,?,?,?,?,?)').run(id,owner,idem,digest,this.seal(bytes),mime,this.clock()+3600000,event,caption?this.seal(Buffer.from(caption,'utf8'),captionAAD(row)):null);
      this.db.prepare(`INSERT INTO queue(event,subscription,next) SELECT ?,id,? FROM subscriptions WHERE owner=? AND expires>?`).run(event,this.clock(),owner,this.clock());
      this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
    return {file_id:id,eventId:event};
  }
  caption(row){return row.caption?this.open(row.caption,captionAAD(row)).toString('utf8'):'';}
  read(token,id){const owner=this.auth(token,'read');this.sweep();const row=this.db.prepare('SELECT * FROM images WHERE id=? AND owner=?').get(id,owner);if(!row)throw Error('Not found');return {bytes:this.open(row.body),mime:row.mime,submission:submissionMetadata(row,this.caption(row)),source:{file_id:row.id,event_id:row.event,owner:row.owner,sha256:row.digest,mime:row.mime,expires_at:row.expires}};}
  status(token,id){const owner=this.auth(token,'upload');this.sweep();const row=this.db.prepare('SELECT event FROM images WHERE id=? AND owner=?').get(id,owner);if(!row)throw Error('Not found');const q=this.db.prepare('SELECT status FROM queue WHERE event=?').all(row.event);return {file_id:id,state:q.some(x=>x.status==='delivered')?'callback_accepted':q.some(x=>x.status==='failed')?'delivery_failed':'queued'};}
  // Only call after actual signed HTTPS callback verification, never pass caller's claim.
  subscribeVerified(token,{id,url,secret,ttl=3600000}){const owner=this.auth(token,'subscribe');this.sweep();if(!id||!url||!secret||ttl<=0)throw Error('Invalid subscription');const other=this.db.prepare('SELECT id FROM subscriptions WHERE owner=? AND id!=?').get(owner,id);if(other)throw Error('One dot subscription only');this.db.prepare('INSERT OR REPLACE INTO subscriptions VALUES(?,?,?,?,?,?)').run(id,owner,url,this.seal(Buffer.from(secret)),this.clock()+Math.min(ttl,3600000),hash(token));this.db.prepare('INSERT OR IGNORE INTO queue(event,subscription,next) SELECT event,?,? FROM images WHERE owner=? AND expires>?').run(id,this.clock(),owner,this.clock());}
  unsubscribe(token,id){const owner=this.auth(token,'subscribe');this.db.prepare('DELETE FROM subscriptions WHERE id=? AND owner=?').run(id,owner);this.sweep();}
  pending(){this.sweep();return this.db.prepare(`SELECT q.*,s.owner,s.url,s.secret,i.id file_id,i.mime,i.expires FROM queue q JOIN subscriptions s ON s.id=q.subscription JOIN images i ON i.event=q.event AND i.owner=s.owner WHERE q.status='pending' AND q.next<=?`).all(this.clock()).map(r=>({...r,secret:this.open(r.secret).toString()}));}
  acknowledge(event,id,status){if(status>=200&&status<300)this.db.prepare("UPDATE queue SET status='delivered' WHERE event=? AND subscription=?").run(event,id);else if(status===410||status===413)this.db.prepare("UPDATE queue SET status='failed' WHERE event=? AND subscription=?").run(event,id);else this.db.prepare("UPDATE queue SET attempt=attempt+1,next=?,status=CASE WHEN attempt>=5 THEN 'failed' ELSE 'pending' END WHERE event=? AND subscription=?").run(this.clock()+Math.min(300000,1000*2**(this.db.prepare('SELECT attempt FROM queue WHERE event=? AND subscription=?').get(event,id)?.attempt??0)),event,id);}
  sweep(){this.db.prepare('DELETE FROM images WHERE expires<=?').run(this.clock());this.db.prepare('DELETE FROM subscriptions WHERE expires<=?').run(this.clock());this.db.prepare('DELETE FROM tokens WHERE expires<=?').run(this.clock());this.db.exec("DELETE FROM subscriptions WHERE grant_hash NOT IN (SELECT hash FROM tokens WHERE scope LIKE '%subscribe%'); DELETE FROM queue WHERE event NOT IN (SELECT event FROM images) OR subscription NOT IN (SELECT id FROM subscriptions)");}
  close(){this.db.close();}
}
export function decodeImage(bytes){const r=spawnSync(process.env.DOT_INBOX_PYTHON??'python3',[fileURLToPath(new URL('./validate_image.py',import.meta.url))],{input:bytes,timeout:10000,maxBuffer:1024});if(r.status!==0)throw Error('Invalid image');return r.stdout.toString().trim();}
