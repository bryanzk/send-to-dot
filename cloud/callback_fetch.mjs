// Webhook transport for Workers: fetch with no redirects, a hard timeout and a bounded response.
// Same URL policy as callback.mjs (HTTPS, port 443, named host, no credentials). Workers cannot
// pin DNS; Cloudflare's edge does not route Worker subrequests to private networks.
import {randomBytes} from 'node:crypto';
import {signedRequest,equalText} from '../signing.mjs';
export function callbackURL(raw){
  const url=new URL(raw);const h=url.hostname;
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port&&url.port!=='443'||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.startsWith('[')||h==='localhost'||h.endsWith('.localhost')||!h.includes('.'))throw Error('Unsafe callback URL');
  return url;
}
export async function postSigned(raw,message,{timeoutMs=10000,maxResponseBytes=16384,fetcher=fetch}={}){
  if(Buffer.byteLength(message.body)>262144)throw Error('Payload exceeds limit');
  const url=callbackURL(raw);
  const r=await fetcher(url.href,{method:'POST',headers:message.headers,body:message.body,redirect:'manual',signal:AbortSignal.timeout(timeoutMs)});
  if(r.status>=300&&r.status<400){await r.body?.cancel();throw Error('Callback redirect forbidden');}
  const reader=r.body?.getReader();const chunks=[];let size=0;
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxResponseBytes){await reader.cancel();throw Error('Callback response too large');}chunks.push(value);}
  return {status:r.status,body:Buffer.concat(chunks.map(c=>Buffer.from(c))).toString('utf8')};
}
export async function verifyCallback(subscription,send=postSigned){
  callbackURL(subscription.url);
  const challenge=randomBytes(32).toString('base64url');
  const body=JSON.stringify({type:'verification',challenge});
  const message=signedRequest(subscription,'verification_'+randomBytes(16).toString('hex'),body,Math.floor(Date.now()/1000));
  const response=await send(subscription.url,message);
  if(response.status<200||response.status>=300)return false;
  let parsed;try{parsed=JSON.parse(response.body);}catch{return false;}
  return parsed!==null&&typeof parsed==='object'&&!Array.isArray(parsed)&&equalText(parsed.challenge,challenge);
}
