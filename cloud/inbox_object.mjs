// The whole inbox as one Durable Object: one SQLite database, single-threaded, so every ledger
// and queue change is serialized exactly like the Node service. No Mac in the path.
import {timingSafeEqual,createHash} from 'node:crypto';
import {InboxCore} from '../store_core.mjs';
import {createApp} from '../app.mjs';
import {DOSql} from './do_sqlite.mjs';
import {validateImage} from './image_check.mjs';
import {SplitLedger} from './split_ledger.mjs';
import {SqlOriginalLinks} from './original_links.mjs';
import {verifyCallback,postSigned} from './callback_fetch.mjs';
import {webFile} from './web_assets.mjs';
const CHUNK=1024*1024;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function buildInbox({sql,tx,env,clock=Date.now,deps={}}){
  const key=Buffer.from(env.STORAGE_KEY??'','base64');
  const inbox=new InboxCore(new DOSql(sql),key,{clock,validate:validateImage,tx,maxBlob:CHUNK});
  const ledger=new SplitLedger(inbox,{clock:()=>clock()/1000});
  const audit=e=>console.log(JSON.stringify({time:new Date(clock()).toISOString(),...e}));
  const app=createApp({origin:env.ORIGIN,redirects:JSON.parse(env.REDIRECTS??'[]'),approvalSecret:env.APPROVAL_SECRET,
    dotNativeDelivery:true,originalDownloadLinks:true,dispatchOnUpload:true,audit,clock},
    {inbox,callbackVerifier:deps.callbackVerifier??verifyCallback,dispatcher:deps.dispatcher??postSigned,webFile,
     ledgerRun:ledger.run,ledgerItems:()=>ledger.items(),originalLinks:new SqlOriginalLinks(inbox,{clock})});
  // Owner-only maintenance, off unless ADMIN_TOKEN is set: import hashed phone codes and the
  // existing delivery history so dedup survives the move. Never returns or logs secrets.
  async function admin(request){
    if(!env.ADMIN_TOKEN||!same(request.headers.get('authorization')??'','Bearer '+env.ADMIN_TOKEN))return null;
    const u=new URL(request.url);
    if(u.pathname==='/admin/import'&&request.method==='POST'){
      const body=await request.json();const now=clock();let tokens=0;
      inbox.tx(()=>{for(const t of body.tokens??[]){if(t.scope!=='upload'||!/^[0-9a-f]{64}$/.test(t.hash)||!(t.expires>now))continue;
        tokens+=inbox.db.prepare('INSERT OR IGNORE INTO tokens VALUES(?,?,?,?)').run(t.hash,'owner','upload',t.expires).changes;}});
      const r=ledger.importItems(body.ledger??[]);audit({event:'admin.import',tokens,ledger:r.imported});
      return Response.json({tokens,ledger:r.imported});
    }
    if(u.pathname==='/admin/status'&&request.method==='GET'){const n=q=>inbox.db.prepare(q).get().n;
      return Response.json({images:n('SELECT count(*) n FROM images'),ledger:n('SELECT count(*) n FROM ledger'),upload_codes:n("SELECT count(*) n FROM tokens WHERE scope='upload'"),read_grants:n("SELECT count(*) n FROM tokens WHERE scope LIKE '%read%'"),subscriptions:n('SELECT count(*) n FROM subscriptions'),queue_pending:n("SELECT count(*) n FROM queue WHERE status='pending'")});}
    return Response.json({error:'Not found'},{status:404});
  }
  async function tick(){await app.deliver();app.watchUnclaimed();inbox.sweep();}
  // Next wake-up: the earliest pending dispatch, else every 15 s while images wait, else none.
  function nextWake(){const now=clock();const q=inbox.db.prepare("SELECT MIN(next) n FROM queue WHERE status='pending'").get().n;
    if(q!=null)return Math.max(now+1000,q);
    return inbox.db.prepare('SELECT count(*) n FROM images').get().n?now+15000:null;}
  return {inbox,ledger,app,admin,tick,nextWake,digest:t=>createHash('sha256').update(t).digest('hex')};
}
