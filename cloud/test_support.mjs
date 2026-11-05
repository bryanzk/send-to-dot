// Test-only stand-in for Durable Object SQLite (ctx.storage.sql) on Node's SQLite: same cursor
// shape, ArrayBuffer blobs, and it rejects typed-array bindings the real API would not accept.
import {DatabaseSync} from 'node:sqlite';
import zlib from 'node:zlib';import {randomBytes} from 'node:crypto';
const cursor=(rows,written)=>({toArray:()=>rows,rowsWritten:written,one:()=>rows[0]});
export function fakeStorage(){
  const db=new DatabaseSync(':memory:');let depth=0;
  const sql={exec(q,...b){
    if(q.split(';').filter(s=>s.trim()).length>1)throw Error('one statement per exec');
    b=b.map(v=>{if(ArrayBuffer.isView(v))throw Error('typed-array binding');return v instanceof ArrayBuffer?new Uint8Array(v):v;});
    const st=db.prepare(q);
    if(st.columns().length){const rows=st.all(...b).map(r=>{const o={...r};for(const k in o)if(o[k] instanceof Uint8Array)o[k]=o[k].buffer.slice(o[k].byteOffset,o[k].byteOffset+o[k].byteLength);return o;});return cursor(rows,0);}
    return cursor([],Number(st.run(...b).changes));}};
  const tx=fn=>{if(depth)return fn();depth++;db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}finally{depth--;}};
  return {db,sql,tx};
}
const crcT=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=b=>{let c=~0;for(const v of b)c=crcT[(c^v)&255]^(c>>>8);return ~c>>>0;};
const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
// Valid RGB PNG; noise=true makes it incompressible (for multi-chunk bodies).
export function makePng(side,noise=false){const rows=[];for(let y=0;y<side;y++){const r=noise?randomBytes(1+side*3):Buffer.alloc(1+side*3,y%250);r[0]=0;rows.push(r);}
  const h=Buffer.alloc(13);h.writeUInt32BE(side,0);h.writeUInt32BE(side,4);h[8]=8;h[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(Buffer.concat(rows),{level:noise?0:6})),chunk('IEND',Buffer.alloc(0))]);}
