// Bounded binary HTTP adapter. Buffer fixed JSON/image responses; this app does not use SSE.
export function nodeHandler(fetch,origin,{maxBytes=8388608,maxResponseBytes=16777216,maxConcurrent=4,requestTimeoutMs=15000}={}){
 let active=0;
 return async(req,res)=>{
  if(active>=maxConcurrent){res.writeHead(503).end();return;}active++;
  const abort=new AbortController();let timer,reader;
  const stopped=new Promise((_,reject)=>{abort.signal.addEventListener('abort',()=>reject(Error('Deadline')),{once:true});});
  const race=p=>Promise.race([p,stopped]);
  const onClose=()=>{if(!res.writableEnded)abort.abort();};res.on?.('close',onClose);res.on?.('error',onClose);
  timer=setTimeout(()=>{abort.abort();req.destroy();},requestTimeoutMs);
  try{
   if(Number(req.headers['content-length'])>maxBytes){res.writeHead(413).end();return;}
   const chunks=[];let size=0;const iterator=req[Symbol.asyncIterator]();
   while(true){const value=await race(iterator.next());if(value.done)break;const b=Buffer.from(value.value);size+=b.length;if(size>maxBytes){res.writeHead(413).end();return;}chunks.push(b);}
   const method=req.method??'GET',request=new Request(origin+req.url,{method,headers:req.headers,signal:abort.signal,...(method==='GET'||method==='HEAD'?{}:{body:Buffer.concat(chunks)})});
   const result=await race(Promise.resolve().then(()=>fetch(request)));let length=0;const output=[];
   if(result.body){reader=result.body.getReader();while(true){const part=await race(reader.read());if(part.done)break;length+=part.value.length;if(length>maxResponseBytes)throw Error('Response too large');output.push(Buffer.from(part.value));}}
   if(!abort.signal.aborted&&!res.destroyed&&!res.writableEnded)res.writeHead(result.status,Object.fromEntries(result.headers)).end(Buffer.concat(output));
  }catch{
   if(!res.destroyed&&!res.writableEnded){if(!res.headersSent)res.writeHead(abort.signal.aborted?408:400);res.end();}
  }finally{clearTimeout(timer);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}res.off?.('close',onClose);res.off?.('error',onClose);active--;}
 };
}
