// The whole inbox as one Durable Object: one SQLite database, single-threaded, so every ledger
// and queue change is serialized exactly like the Node service. No Mac in the path.
import {timingSafeEqual,createHash,randomBytes} from 'node:crypto';
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
  const db=new DOSql(sql);
  db.exec('CREATE TABLE IF NOT EXISTS settings(name TEXT PRIMARY KEY,value TEXT)');
  const setting=n=>db.prepare('SELECT value FROM settings WHERE name=?').get(n)?.value??null;
  // One-click deployments have no STORAGE_KEY secret: generate one inside this object once.
  // (A STORAGE_KEY secret, when set, keeps the encryption key outside the object's storage.)
  let keyText=env.STORAGE_KEY||setting('storage_key');
  if(!keyText){keyText=randomBytes(32).toString('base64');db.prepare('INSERT INTO settings VALUES(?,?)').run('storage_key',keyText);}
  const key=Buffer.from(keyText,'base64');
  let audit=()=>{};
  // Rejected images log only a structural reason code and the size, never content.
  const validate=b=>{try{return validateImage(b);}catch(e){audit({event:'image.check',outcome:e.reason??'invalid',bytes:b?.length??0});throw e;}};
  const inbox=new InboxCore(db,key,{clock,validate,tx,maxBlob:CHUNK});
  const ledger=new SplitLedger(inbox,{clock:()=>clock()/1000});
  // Audit events (never tokens, links or captions) go to the Workers log and a 1000-entry table
  // that /admin/audit reads, so latency can be measured per event without log access.
  inbox.db.exec('CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,time INTEGER,entry TEXT)');
  audit=e=>{const t=clock(),line=JSON.stringify({time:new Date(t).toISOString(),...e});console.log(line);
    try{inbox.db.prepare('INSERT INTO audit_log(time,entry) VALUES(?,?)').run(t,line);inbox.db.prepare('DELETE FROM audit_log WHERE id<=(SELECT MAX(id) FROM audit_log)-1000').run();}catch{}};
  // The public origin comes from ORIGIN, or is bound once by the owner's first /setup (one-click
  // deployments do not know their workers.dev address in advance). Until then only /setup answers.
  let app=null;
  // Only a real https origin counts as configured; an empty or placeholder value means "bind on /setup".
  const origin=()=>(/^https:\/\/[^/]+$/.test(env.ORIGIN??'')?env.ORIGIN:null)||setting('origin');
  function ensureApp(){if(app)return app;const o=origin();if(!o)return null;
    app=createApp({origin:o,redirects:JSON.parse(env.REDIRECTS??'[]'),approvalSecret:env.APPROVAL_SECRET,
      dotNativeDelivery:true,originalDownloadLinks:true,dispatchOnUpload:true,audit,clock},
      {inbox,callbackVerifier:deps.callbackVerifier??verifyCallback,dispatcher:deps.dispatcher??postSigned,webFile,
       ledgerRun:ledger.run,ledgerItems:()=>ledger.items(),originalLinks:new SqlOriginalLinks(inbox,{clock})});
    return app;}
  const ownerOK=v=>!!env.APPROVAL_SECRET&&same(v??'',env.APPROVAL_SECRET);
  let tries=0,minute=0;
  const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const page=(body,status=200)=>new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Send to dot 设置</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:32px auto;padding:0 16px;color:#1f2937;background:#f8fafc}code,input{font:15px ui-monospace,monospace}code{background:#e5e7eb;padding:2px 6px;border-radius:4px;word-break:break-all}input{width:100%;padding:10px;box-sizing:border-box;margin:8px 0}button{padding:10px 16px;font-size:16px}li{margin:6px 0}</style><h1>Send to dot 设置</h1>${body}</html>`,{status,headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
  const form=msg=>page(`${msg?`<p><strong>${esc(msg)}</strong></p>`:''}<p>输入部署时设置的<strong>本人确认码</strong>，生成一个手机连接码。连接码只显示一次，30 天有效，只能上传图片，不能查看图片。</p><form method="post" action="/setup"><label>本人确认码<input name="owner" type="password" required autocomplete="off"></label><button>生成手机连接码</button></form>`);
  // Owner setup page: binds the origin on first use and issues phone upload codes (shown once).
  async function setup(request){
    const u=new URL(request.url);
    if(!env.APPROVAL_SECRET)return page('<p>还没有设置本人确认码（APPROVAL_SECRET）。请在 Cloudflare 的 Worker 设置里添加这个密钥后再打开本页。</p>',503);
    if(request.method==='GET')return form('');
    if(request.method!=='POST')return page('<p>不支持。</p>',405);
    if(request.headers.get('origin')!==u.origin)return page('<p>请从本页提交。</p>',403);
    const m=Math.floor(clock()/60000);if(m!==minute){minute=m;tries=0;}if(++tries>10)return page('<p>尝试太多次，请一分钟后再试。</p>',429);
    const body=new URLSearchParams(await request.text());
    if(!ownerOK(body.get('owner'))){audit({event:'setup.owner',outcome:'rejected'});return form('本人确认码不对。');}
    if(!origin()){if(u.protocol!=='https:')return page('<p>只能通过 https 地址设置。</p>',400);db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run('origin',u.origin);}
    if(origin()!==u.origin)return page(`<p>这个收件箱已经绑定到 <code>${esc(origin())}</code>，请从那个地址打开设置页。</p>`,409);
    ensureApp();const code=randomBytes(24).toString('base64url');inbox.grant(code,'owner','upload');audit({event:'setup.upload_code',outcome:'issued'});
    const o=origin();
    return page(`<p>手机连接码（只显示这一次，请现在保存）：</p><p><code>${esc(code)}</code></p>
<ol><li><strong>Android</strong>：用手机浏览器打开 <code>${esc(o)}</code>，粘贴上面的连接码，再添加到主屏幕。</li>
<li><strong>iPhone</strong>：导入 Send to dot 快捷指令，把“收图地址”改成 <code>${esc(o)}</code>，“手机连接码”填上面的码。</li>
<li><strong>ChatGPT</strong>：添加自定义 MCP 服务器 <code>${esc(o)}/mcp</code>（OAuth），授权时输入本人确认码。</li>
<li>然后在原 dot 对话里请 dot 创建 file.created 定时任务。</li></ol>
<p>换手机或丢失连接码时，回到本页再生成一个。</p>`);
  }
  // Owner-only maintenance, off unless ADMIN_TOKEN is set: import hashed phone codes and the
  // existing delivery history so dedup survives the move. Never returns or logs secrets.
  async function admin(request){
    const auth=request.headers.get('authorization')??'';
    if(!(env.ADMIN_TOKEN&&same(auth,'Bearer '+env.ADMIN_TOKEN))&&!ownerOK(auth.replace(/^Bearer /,'')))return null;
    const u=new URL(request.url);
    if(u.pathname==='/admin/import'&&request.method==='POST'){
      const body=await request.json();const now=clock();let tokens=0;
      inbox.tx(()=>{for(const t of body.tokens??[]){if(t.scope!=='upload'||!/^[0-9a-f]{64}$/.test(t.hash)||!(t.expires>now))continue;
        tokens+=inbox.db.prepare('INSERT OR IGNORE INTO tokens VALUES(?,?,?,?)').run(t.hash,'owner','upload',t.expires).changes;}});
      const r=ledger.importItems(body.ledger??[]);audit({event:'admin.import',tokens,ledger:r.imported});
      return Response.json({tokens,ledger:r.imported});
    }
    if(u.pathname==='/admin/audit'&&request.method==='GET'){const since=Number(u.searchParams.get('since')??0)||0;
      const entries=inbox.db.prepare('SELECT entry FROM audit_log WHERE time>=? ORDER BY id LIMIT 1000').all(since).map(r=>JSON.parse(r.entry));
      const items=ledger.items().filter(x=>x.image_send_receipt||x.image_state).slice(-50).map(x=>({file_id:x.source_file_id,event_id:x.event_id??null,state:x.state,image_state:x.image_state??null,answer_state:x.answer_state??null,accepted_at:x.image_send_receipt?.accepted_at??null}));
      return Response.json({entries,items});}
    if(u.pathname==='/admin/status'&&request.method==='GET'){const n=q=>inbox.db.prepare(q).get().n;
      return Response.json({images:n('SELECT count(*) n FROM images'),ledger:n('SELECT count(*) n FROM ledger'),upload_codes:n("SELECT count(*) n FROM tokens WHERE scope='upload'"),read_grants:n("SELECT count(*) n FROM tokens WHERE scope LIKE '%read%'"),subscriptions:n('SELECT count(*) n FROM subscriptions'),queue_pending:n("SELECT count(*) n FROM queue WHERE status='pending'")});}
    return Response.json({error:'Not found'},{status:404});
  }
  async function tick(){const a=ensureApp();if(a){await a.deliver();a.watchUnclaimed();}inbox.sweep();}
  // Next wake-up: the earliest pending dispatch, else every 15 s while images wait, else none.
  function nextWake(){const now=clock();const q=inbox.db.prepare("SELECT MIN(next) n FROM queue WHERE status='pending'").get().n;
    if(q!=null)return Math.max(now+1000,q);
    return inbox.db.prepare('SELECT count(*) n FROM images').get().n?now+15000:null;}
  async function handle(request){const p=new URL(request.url).pathname;
    if(p==='/setup')return setup(request);
    if(p.startsWith('/admin/'))return (await admin(request))??Response.json({error:'Not found'},{status:404});
    const a=ensureApp();if(!a)return p==='/'?Response.redirect(new URL('/setup',request.url).href,302):Response.json({error:'Setup required: open /setup'},{status:503});
    return a.fetch(request);}
  return {inbox,ledger,get app(){return ensureApp();},admin,setup,handle,tick,nextWake,digest:t=>createHash('sha256').update(t).digest('hex')};
}
