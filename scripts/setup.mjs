import {ACCESS_MS,ACCESS_DAYS} from '../access_policy.mjs';
// One-time BYO deployment initialization. No model API key or author resources.
import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,openSync,closeSync,unlinkSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';
import {Inbox} from '../store.mjs';
export function deploymentOrigin(raw,{trial=false}={}){
 let u;try{u=new URL(raw);}catch{throw Error('Use an exact HTTPS origin');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||(u.pathname!==''&&u.pathname!=='/')||/[\s*]/.test(u.hostname))throw Error('Use an HTTPS origin without credentials, path, query or wildcard');
 if(u.hostname.endsWith('.trycloudflare.com')&&!trial)throw Error('Temporary Quick Tunnel requires --trial; use your own stable HTTPS origin for daily use');
 return u.origin;
}
export function callbackURI(raw){let u;try{u=new URL(raw);}catch{throw Error('Invalid callback URI');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||/[\s;"'<>*]/.test(raw)||/[\s;"'<>*]/.test(u.href))throw Error('Use the exact approved HTTPS callback URI, without wildcard or query');return u.href;}
export function prerequisites(root){
 const require=createRequire(join(root,'package.json'));require.resolve('@modelcontextprotocol/server');require.resolve('zod');
 const selected=process.env.DOT_INBOX_PYTHON??(existsSync(join(root,'.venv/bin/python'))?join(root,'.venv/bin/python'):'python3');
 const r=spawnSync(selected,['-c','import sys;from PIL import Image;assert Image.__version__ == "12.0.0";print(sys.executable)'],{encoding:'utf8',timeout:10000});
 if(r.status!==0)throw Error('Python with Pillow12.0.0 required; run scripts/bootstrap.sh or set DOT_INBOX_PYTHON');return r.stdout.trim();
}
export function initialize({root,origin,redirects=['https://chatgpt.com/connector_platform_oauth_redirect'],pythonExecutable,trial=false,dryRun=false}){
 if(typeof process.getuid!=='function')throw Error('Use a POSIX runtime; Windows native ACL setup is not supported');
 root=realpathSync(resolve(root));origin=deploymentOrigin(origin,{trial});redirects=[...new Set(redirects.map(callbackURI))];if(!redirects.length)throw Error('At least one exact callback URI required');
 const configPath=join(root,'approved.config.json'),secrets=join(root,'.secrets'),state=join(root,'state'),database=join(state,'private.sqlite');
 if(dryRun)return {status:'checks_passed_no_changes',origin,alreadyConfigured:existsSync(configPath)};
 const lock=join(root,'.setup.lock');const fd=openSync(lock,'wx',0o600);let db;
 try{
  if(existsSync(configPath)||existsSync(secrets)||existsSync(database))throw Error('Existing configuration/secrets/database preserved. Use preflight; do not run setup again or overwrite data');
  if(existsSync(state)&&(lstatSync(state).isSymbolicLink()||(lstatSync(state).mode&0o077)))throw Error('Existing state directory must be private and not a symlink');
  mkdirSync(secrets,{mode:0o700});mkdirSync(state,{recursive:true,mode:0o700});
  const storage=randomBytes(32),owner=randomBytes(32).toString('base64url'),phone=randomBytes(32).toString('base64url');
  const secretPaths={storageKeyFile:join(secrets,'storage'),approvalSecretFile:join(secrets,'owner-approval'),phoneCredentialFile:join(secrets,'phone-upload')};
  for(const [path,value]of [[secretPaths.storageKeyFile,storage.toString('base64')],[secretPaths.approvalSecretFile,owner],[secretPaths.phoneCredentialFile,phone]])writeFileSync(path,value,{mode:0o600,flag:'wx'});
  db=new Inbox(database,storage);db.grant(phone,'owner','upload',ACCESS_MS);db.close();db=null;
  const config={origin,redirects,database,...secretPaths,pythonExecutable,initializePhone:false};writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {status:'ready_to_start',origin,next:['node scripts/preflight.mjs approved.config.json','node launch.mjs approved.config.json'],secretsPrinted:false,phoneGrantDays:ACCESS_DAYS,phoneGrantHours:ACCESS_DAYS*24};
 }finally{db?.close();closeSync(fd);unlinkSync(lock);}
}
export function cli(args){
 const options={redirects:[]};for(let i=0;i<args.length;i++){const a=args[i];if(a==='--trial')options.trial=true;else if(a==='--check')options.dryRun=true;else if(a==='--origin'||a==='--redirect'){if(!args[i+1])throw Error('Option value required');if(a==='--origin')options.origin=args[++i];else options.redirects.push(args[++i]);}else throw Error('Usage: node scripts/setup.mjs --origin https://your-origin [--redirect exact-callback] [--trial] [--check]');}
 if(!options.origin)throw Error('--origin is required');if(!options.redirects.length)delete options.redirects;
 const root=fileURLToPath(new URL('../',import.meta.url));return initialize({root,pythonExecutable:prerequisites(root),...options});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(cli(process.argv.slice(2)),null,2));}catch(e){console.error('Setup stopped: '+e.message);process.exitCode=1;}}
