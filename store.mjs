import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { chmodSync,mkdirSync,lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import {fileURLToPath} from 'node:url';
import {InboxCore} from './store_core.mjs';
// Node deployment: file-backed SQLite with owner-only permissions and the Python image decoder.
export class Inbox extends InboxCore {
  constructor(path,key,{clock=Date.now,validate=decodeImage}={}) {
    if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Storage key required');
    if(path!==':memory:'){
      mkdirSync(dirname(path),{recursive:true,mode:0o700});
      if(lstatSync(dirname(path)).isSymbolicLink())throw Error('Unsafe directory');
      chmodSync(dirname(path),0o700);
      try{if(lstatSync(path).isSymbolicLink())throw Error('Unsafe database');}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    const db=new DatabaseSync(path);if(path!==':memory:')chmodSync(path,0o600);
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;');
    super(db,key,{clock,validate});
  }
}
export function decodeImage(bytes){const r=spawnSync(process.env.DOT_INBOX_PYTHON??'python3',[fileURLToPath(new URL('./validate_image.py',import.meta.url))],{input:bytes,timeout:10000,maxBuffer:1024});if(r.status!==0)throw Error('Invalid image');return r.stdout.toString().trim();}
