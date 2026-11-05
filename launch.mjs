import {verifyDecoderRuntime} from './decoder_runtime.mjs';
import {ACCESS_MS} from './access_policy.mjs';
// Start only after approval of exact HTTPS ingress, private connection and secret scopes.
import http from 'node:http';import {readFileSync,lstatSync} from 'node:fs';
import {resolve,sep} from 'node:path';import {fileURLToPath} from 'node:url';
import {createApp} from './server.mjs';
import {nodeHandler} from './http_bridge.mjs';
import {observeUpload} from './upload_audit.mjs';

const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
const decoder=verifyDecoderRuntime(config.pythonExecutable??process.env.DOT_INBOX_PYTHON);
process.env.DOT_INBOX_PYTHON=decoder.python;
const project=fileURLToPath(new URL('.',import.meta.url));
if(!resolve(config.database).startsWith(resolve(project,'state')+sep))throw Error('Database must stay inside this project state directory');
function secret(path){if(!resolve(path).startsWith(resolve(project,'.secrets')+sep))throw Error('Use only this private project secret directory');const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('Secrets must be owner-only regular files');return readFileSync(path,'utf8').trim();}
config.storageKey=Buffer.from(secret(config.storageKeyFile),'base64');config.approvalSecret=secret(config.approvalSecretFile);
if(config.r2CredentialsFile){const c=JSON.parse(secret(config.r2CredentialsFile));config.r2Credentials={accountId:c.account_id,bucket:c.bucket,accessKeyId:c.access_key_id,secretAccessKey:c.secret_access_key};}
if(new URL(config.origin).protocol!=='https:'||new URL(config.origin).origin!==config.origin)throw Error('Exact approved HTTPS origin required');
config.audit=event=>console.log(JSON.stringify({time:new Date().toISOString(),...event}));
if(config.pythonExecutable)process.env.DOT_INBOX_PYTHON=config.pythonExecutable;
config.readCacheDirectory=resolve(project,'state/read-cache');
const app=createApp(config);app.inbox.sweep();app.cleanupReadCache();const phone=secret(config.phoneCredentialFile);
// Do not renew expired/revoked phone grants on restart. Initial grant is explicit.
if(config.initializePhone===true){app.inbox.grant(phone,'owner','upload',ACCESS_MS);app.inbox.close();console.log('Phone initialized; set initializePhone=false before starting.');process.exit(0);}
const serve=nodeHandler(app.fetch,config.origin);
const server=http.createServer((req,res)=>{observeUpload(req,res,config.audit);if(req.headers.host!=='127.0.0.1:43187'){res.writeHead(403).end();return;}
 let path;try{path=new URL(req.url,'http://127.0.0.1:43187').pathname;}catch{res.writeHead(400).end();return;}
 if(path==='/api/upload'||path==='/mcp'){try{app.inbox.auth(req.headers.authorization?.replace(/^Bearer /,''),path==='/mcp'?'read':'upload');}catch{res.writeHead(401,{'WWW-Authenticate':'Bearer resource_metadata=\"'+config.origin+'/.well-known/oauth-protected-resource\"'}).end();return;}}
 if(path==='/api/upload'&&req.headers.origin!==config.origin){res.writeHead(403).end();return;}serve(req,res);});
server.listen(43187,'127.0.0.1',()=>console.log('Private inbox listening on approved loopback; no content logged'));
const delivery=setInterval(()=>app.deliver().catch(()=>{}),5000);const cleanup=setInterval(()=>{app.inbox.sweep();app.cleanupReadCache();},30000);const watch=setInterval(()=>{try{app.watchUnclaimed?.();app.r2Sweep?.();}catch{}},15000);
function stop(){clearInterval(delivery);clearInterval(cleanup);clearInterval(watch);server.closeAllConnections();server.close(()=>{app.inbox.close();process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
