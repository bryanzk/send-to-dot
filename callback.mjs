import https from 'node:https';
import { resolve4 } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import { randomBytes } from 'node:crypto';
import { signedRequest, equalText } from './signing.mjs';

// Deliberately IPv4-only webhook transport. Never fall back to an unvalidated address.
const excluded = new BlockList();
for (const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) excluded.addSubnet(ip,bits,'ipv4');
export function publicIPv4(ip) { return isIP(ip)===4 && !excluded.check(ip,'ipv4'); }
export function callbackURL(raw) {
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port&&url.port!=='443'||isIP(url.hostname)||url.hostname.startsWith('[')||url.hostname==='localhost'||url.hostname.endsWith('.localhost')) throw Error('Unsafe callback URL');
  return url;
}
export async function resolveCallback(raw, resolve=resolve4) {
  const url=callbackURL(raw);
  const addresses=await resolve(url.hostname);
  if(!addresses.length||addresses.some(ip=>!publicIPv4(ip))) throw Error('Unsafe callback DNS');
  return {url,address:addresses[0]};
}
export async function postSigned(raw, message, {timeoutMs=10000,maxResponseBytes=16384}={}) {
  if(Buffer.byteLength(message.body)>262144) throw Error('Payload exceeds limit');
  const deadline=Date.now()+timeoutMs;
  const {url,address}=await beforeDeadline(resolveCallback(raw),timeoutMs);
  if(Date.now()>=deadline) throw Error('Callback timeout');
  return new Promise((resolve,reject)=>{
    const request=https.request(url,{method:'POST',agent:false,servername:url.hostname,
      // Pin the socket's DNS lookup, preserve URL hostname for Host and TLS validation.
      lookup:(_host,options,done)=>done(null,options?.all?[{address,family:4}]:address,4),
      headers:message.headers,rejectUnauthorized:true},response=>{
      if(response.statusCode>=300&&response.statusCode<400){response.destroy();reject(Error('Callback redirect forbidden'));return;}
      let size=0;const chunks=[];
      response.on('data',chunk=>{size+=chunk.length;if(size>maxResponseBytes){response.destroy(Error('Callback response too large'));}else chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>resolve({status:response.statusCode,body:Buffer.concat(chunks).toString('utf8')}));
    });
    const timer=setTimeout(()=>request.destroy(Error('Callback timeout')),Math.max(1,deadline-Date.now()));
    request.on('error',reject);request.on('close',()=>clearTimeout(timer));
    request.end(message.body);
  });
}
export async function beforeDeadline(promise,ms) {
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Callback timeout')),ms);})]);}
  finally{clearTimeout(timer);}
}
export async function verifyCallback(subscription, send=postSigned) {
  // validate before even an injected test dispatcher; no real network in tests.
  callbackURL(subscription.url);
  const challenge=randomBytes(32).toString('base64url');
  const body=JSON.stringify({type:'verification',challenge});
  const message=signedRequest(subscription,'verification_'+randomBytes(16).toString('hex'),body,Math.floor(Date.now()/1000));
  const response=await send(subscription.url,message);
  if(response.status<200||response.status>=300) return false;
  let parsed;try{parsed=JSON.parse(response.body);}catch{return false;}
  return parsed!==null && typeof parsed==='object' && !Array.isArray(parsed) && equalText(parsed.challenge,challenge);
}
