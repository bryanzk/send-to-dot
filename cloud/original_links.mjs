// Single-use original download links kept in SQLite (a Durable Object may be evicted between
// claim and download). Stores only a token hash and the file id; bytes are read at download.
import {createHash,randomBytes} from 'node:crypto';
const digest=t=>createHash('sha256').update(t).digest('hex');
export class SqlOriginalLinks {
  constructor(inbox,{ttlMs=120000,clock=Date.now,maxEntries=20}={}){
    this.inbox=inbox;this.ttl=ttlMs;this.clock=clock;this.max=maxEntries;
    inbox.db.exec('CREATE TABLE IF NOT EXISTS original_links(hash TEXT PRIMARY KEY,file_id TEXT,sha256 TEXT,expires INTEGER)');
  }
  sweep(){this.inbox.db.prepare('DELETE FROM original_links WHERE expires<=?').run(this.clock());}
  issue(_bytes,_mime,meta){this.sweep();
    if(this.inbox.db.prepare('SELECT count(*) n FROM original_links').get().n>=this.max)throw Error('Too many pending downloads');
    const token=randomBytes(32).toString('base64url'),expires=this.clock()+this.ttl;
    this.inbox.db.prepare('INSERT INTO original_links VALUES(?,?,?,?)').run(digest(token),meta.file_id,meta.sha256,expires);return {token,expires};}
  take(token){this.sweep();if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    const key=digest(token),row=this.inbox.db.prepare('SELECT * FROM original_links WHERE hash=?').get(key);if(!row)return null;
    this.inbox.db.prepare('DELETE FROM original_links WHERE hash=?').run(key);
    if(row.expires<=this.clock())return null;
    const o=this.inbox.originalById(row.file_id);if(!o||o.sha256!==row.sha256)return null;
    return {bytes:o.bytes,mime:o.mime,meta:{file_id:row.file_id,sha256:row.sha256}};}
}
