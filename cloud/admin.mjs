// Owner tool for the Cloudflare inbox. Needs ADMIN_TOKEN (the Worker secret) in the environment.
//   node cloud/admin.mjs status              counts only
//   node cloud/admin.mjs issue-upload-code   creates a phone upload code, prints it ONCE, stores only its hash
//   node cloud/admin.mjs import-ledger FILE  imports an existing attachment-map.json so delivered items stay deduplicated
//   node cloud/admin.mjs audit [minutes]     recent audit events (never tokens, links or captions)
// Set INBOX_ORIGIN=https://your-inbox.example.com
import {createHash,randomBytes} from 'node:crypto';import {readFileSync} from 'node:fs';
const origin=process.env.INBOX_ORIGIN,token=process.env.ADMIN_TOKEN;
if(!origin?.startsWith('https://')||!token){console.error('Set INBOX_ORIGIN (https://…) and ADMIN_TOKEN');process.exit(2);}
const call=(path,init={})=>fetch(origin+path,{...init,headers:{Authorization:'Bearer '+token,...init.headers}}).then(async r=>{if(!r.ok)throw Error(path+' '+r.status);return r.json();});
const [cmd,arg]=process.argv.slice(2);
if(cmd==='status')console.log(await call('/admin/status'));
else if(cmd==='issue-upload-code'){const code=randomBytes(24).toString('base64url');
  const r=await call('/admin/import',{method:'POST',body:JSON.stringify({tokens:[{hash:createHash('sha256').update(code).digest('hex'),scope:'upload',expires:Date.now()+30*86400000}]})});
  if(r.tokens!==1)throw Error('Upload code not stored');console.log('Phone upload code (shown once, valid 30 days; upload only):\n'+code);}
else if(cmd==='import-ledger'){const items=JSON.parse(readFileSync(arg,'utf8')).items;console.log(await call('/admin/import',{method:'POST',body:JSON.stringify({ledger:items})}));}
else if(cmd==='audit'){const j=await call('/admin/audit?since='+(Date.now()-Number(arg??30)*60000));for(const e of j.entries)console.log(JSON.stringify(e));for(const x of j.items.slice(-10))console.log('item',JSON.stringify(x));}
else{console.error('Commands: status | issue-upload-code | import-ledger FILE | audit [minutes]');process.exit(2);}
