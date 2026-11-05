// Pre-stage originals in the owner's Cloudflare R2 bucket right after upload, so the dot
// downloads from Cloudflare's edge instead of waiting on the host's home uplink.
// Random object keys (unlinkable to file IDs), 2-minute presigned GET, deleted after use,
// swept after 15 minutes; a bucket lifecycle rule is the backstop. Credentials stay local.
import https from 'node:https';import {createHash,createHmac,randomBytes} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const hmac=(k,s)=>createHmac('sha256',k).update(s).digest();
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const amzDate=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
function signingKey(secret,date,region,service){return hmac(hmac(hmac(hmac('AWS4'+secret,date),region),service),'aws4_request');}
export function presignGet({host,path,accessKeyId,secretAccessKey,region='auto',service='s3',expires=120,now=new Date()}){
 const t=amzDate(now),d=t.slice(0,8),scope=`${d}/${region}/${service}/aws4_request`;
 const q={'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':`${accessKeyId}/${scope}`,'X-Amz-Date':t,'X-Amz-Expires':String(expires),'X-Amz-SignedHeaders':'host'};
 const cq=Object.keys(q).sort().map(k=>`${enc(k)}=${enc(q[k])}`).join('&');
 const creq=['GET',path,cq,`host:${host}\n`,'host','UNSIGNED-PAYLOAD'].join('\n');
 const sts=['AWS4-HMAC-SHA256',t,scope,sha(creq)].join('\n');
 const sig=createHmac('sha256',signingKey(secretAccessKey,d,region,service)).update(sts).digest('hex');
 return `https://${host}${path}?${cq}&X-Amz-Signature=${sig}`;
}
export function signedHeaders({method,host,path,body=Buffer.alloc(0),contentType,accessKeyId,secretAccessKey,region='auto',service='s3',now=new Date(),extra={}}){
 const t=amzDate(now),d=t.slice(0,8),scope=`${d}/${region}/${service}/aws4_request`,ph=sha(body);
 const h={host,'x-amz-content-sha256':ph,'x-amz-date':t,...(contentType?{'content-type':contentType}:{}),...extra};
 const names=Object.keys(h).sort();const ch=names.map(n=>`${n}:${h[n]}\n`).join('');const sh=names.join(';');
 const creq=[method,path,'',ch,sh,ph].join('\n');const sts=['AWS4-HMAC-SHA256',t,scope,sha(creq)].join('\n');
 const sig=createHmac('sha256',signingKey(secretAccessKey,d,region,service)).update(sts).digest('hex');
 return {...h,authorization:`AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${sh}, Signature=${sig}`};
}
function send(method,host,path,headers,body,timeoutMs){return new Promise((resolve,reject)=>{const r=https.request({method,host,path,headers:{...headers,...(body?{'content-length':body.length}:{})},timeout:timeoutMs},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('timeout',()=>r.destroy(Error('timeout')));r.on('error',reject);r.end(body);});}
export class R2Stage{
 constructor({accountId,bucket,accessKeyId,secretAccessKey},{audit=()=>{},clock=Date.now,request=send,maxAgeMs=15*60000,expires=120}={}){
  if(!/^[a-f0-9]{32}$/.test(accountId??'')||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket??'')||!accessKeyId||!secretAccessKey)throw Error('R2 configuration incomplete');
  Object.assign(this,{host:`${accountId}.r2.cloudflarestorage.com`,bucket,accessKeyId,secretAccessKey,audit,clock,request,maxAgeMs,expires});this.items=new Map();
 }
 path(key){return `/${this.bucket}/${key}`;}
 stage(fileId,bytes,mime){
  if(this.items.has(fileId))return;const key='o/'+randomBytes(24).toString('base64url');const rec={key,status:'uploading',at:this.clock(),bytes:bytes.length};this.items.set(fileId,rec);const t0=this.clock();
  const h=signedHeaders({method:'PUT',host:this.host,path:this.path(key),body:bytes,contentType:mime,accessKeyId:this.accessKeyId,secretAccessKey:this.secretAccessKey});
  return this.request('PUT',this.host,this.path(key),h,bytes,60000).then(st=>{rec.status=st>=200&&st<300?'ready':'failed';this.audit({event:'r2.stage',outcome:rec.status,status:st,bytes:bytes.length,ms:this.clock()-t0});},e=>{rec.status='failed';this.audit({event:'r2.stage',outcome:'failed',error:String(e?.message??e).slice(0,60),ms:this.clock()-t0});});
 }
 url(fileId){const r=this.items.get(fileId);if(r?.status!=='ready')return null;return {url:presignGet({host:this.host,path:this.path(r.key),accessKeyId:this.accessKeyId,secretAccessKey:this.secretAccessKey,expires:this.expires}),expires_at:new Date(this.clock()+this.expires*1000).toISOString()};}
 drop(fileId){const r=this.items.get(fileId);if(!r)return;this.items.delete(fileId);if(r.status==='failed')return;const h=signedHeaders({method:'DELETE',host:this.host,path:this.path(r.key),accessKeyId:this.accessKeyId,secretAccessKey:this.secretAccessKey});
  return this.request('DELETE',this.host,this.path(r.key),h,null,30000).then(st=>this.audit({event:'r2.delete',outcome:st>=200&&st<300?'ok':'failed',status:st}),()=>this.audit({event:'r2.delete',outcome:'failed'}));}
 sweep(){const now=this.clock();for(const [f,r] of [...this.items])if(now-r.at>this.maxAgeMs&&r.status!=='uploading')this.drop(f);}
}
