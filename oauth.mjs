import {ACCESS_SECONDS} from './access_policy.mjs';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export class OAuth {
 constructor(inbox,{origin,redirects,approvalSecret,clock=Date.now}){
  if(!origin.startsWith('https://')||!redirects?.length||!approvalSecret)throw Error('Explicit OAuth configuration required');
  this.inbox=inbox;this.origin=origin;this.redirects=redirects;this.approvalSecret=approvalSecret;this.clock=clock;
  inbox.db.exec('CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,redirects TEXT); CREATE TABLE IF NOT EXISTS codes(hash TEXT PRIMARY KEY,client TEXT,redirect TEXT,challenge TEXT,expires INTEGER);');
  inbox.db.exec('CREATE TABLE IF NOT EXISTS settings(name TEXT PRIMARY KEY,value TEXT);');
  const bound=inbox.db.prepare("SELECT value FROM settings WHERE name='origin'").get();
  if(bound&&bound.value!==origin)throw Error('Database belongs to another origin');
  if(!bound)inbox.db.prepare("INSERT INTO settings VALUES('origin',?)").run(origin);
 }
 register(data){if(!Array.isArray(data.redirect_uris)||!data.redirect_uris.length||data.redirect_uris.some(u=>!this.redirects.includes(u))||data.token_endpoint_auth_method&&data.token_endpoint_auth_method!=='none')throw Error('Invalid redirect');
  const redirects=[...new Set(data.redirect_uris)].sort(),canonical=JSON.stringify(redirects),old=this.inbox.db.prepare('SELECT id FROM clients WHERE redirects=?').get(canonical);
  if(!old&&this.inbox.db.prepare('SELECT count(*) n FROM clients').get().n>=10)throw Error('Registration limit');
  const id=old?.id??randomBytes(24).toString('base64url');if(!old)this.inbox.db.prepare('INSERT INTO clients VALUES(?,?)').run(id,canonical);return {client_id:id,redirect_uris:redirects,token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']};}
 validate(p){const c=this.inbox.db.prepare('SELECT * FROM clients WHERE id=?').get(p.client_id);if(!c||!JSON.parse(c.redirects).includes(p.redirect_uri)||p.response_type!=='code'||p.code_challenge_method!=='S256'||!/^[-_a-zA-Z0-9]{43}$/.test(p.code_challenge)||p.scope&&p.scope!=='read subscribe'||p.resource&&p.resource!==this.origin+'/mcp')throw Error('Invalid authorization');return p;}
 approve(p,secret){this.validate(p);if(!equal(secret,this.approvalSecret))throw Error('Forbidden');const code=randomBytes(32).toString('base64url');this.inbox.db.prepare('INSERT INTO codes VALUES(?,?,?,?,?)').run(digest(code),p.client_id,p.redirect_uri,p.code_challenge,this.clock()+120000);const url=new URL(p.redirect_uri);url.searchParams.set('code',code);url.searchParams.set('iss',this.origin);if(p.state)url.searchParams.set('state',p.state);return url.href;}
 exchange(p){
  if(p.resource&&p.resource!==this.origin+'/mcp'||p.grant_type!=='authorization_code'||!/^[-._~a-zA-Z0-9]{43,128}$/.test(p.code_verifier??''))throw Error('Invalid grant');
  const key=digest(p.code??''),challenge=createHash('sha256').update(p.code_verifier).digest('base64url');
  this.inbox.db.exec('BEGIN IMMEDIATE');
  try{
   const row=this.inbox.db.prepare('SELECT * FROM codes WHERE hash=?').get(key);
   if(!row||row.expires<=this.clock()||row.client!==p.client_id||row.redirect!==p.redirect_uri||!equal(row.challenge,challenge))throw Error('Invalid grant');
   if(this.inbox.db.prepare('DELETE FROM codes WHERE hash=?').run(key).changes!==1)throw Error('Invalid grant');
   const token=randomBytes(32).toString('base64url');this.inbox.grant(token,'owner','read subscribe');this.inbox.db.exec('COMMIT');
   return {access_token:token,token_type:'Bearer',expires_in:ACCESS_SECONDS,scope:'read subscribe'};
  }catch(e){this.inbox.db.exec('ROLLBACK');throw e;}
 }

}
