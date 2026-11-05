// Adapts Durable Object SQLite (ctx.storage.sql.exec) to the prepare().run/get/all + exec
// interface InboxCore and OAuth use. Blobs cross as ArrayBuffer in, Buffer out.
const bind=v=>ArrayBuffer.isView(v)?v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength):v;
const row=r=>{for(const k in r)if(r[k] instanceof ArrayBuffer)r[k]=Buffer.from(r[k]);return r;};
export class DOSql {
  constructor(sql){this.sql=sql;}
  // One statement per call: our schema SQL has no semicolons inside literals.
  exec(query){for(const part of query.split(';'))if(part.trim())this.sql.exec(part);}
  prepare(query){
    const run=(args)=>this.sql.exec(query,...args.map(bind));
    return {
      // rowsWritten also counts index writes, so ask SQLite for the affected-row count.
      run:(...a)=>{run(a).toArray();return {changes:Number(this.sql.exec('SELECT changes() AS c').toArray()[0].c)};},
      get:(...a)=>{const r=run(a).toArray()[0];return r?row(r):undefined;},
      all:(...a)=>run(a).toArray().map(row),
    };
  }
}
