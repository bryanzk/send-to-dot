// Agent-guided local setup. Native platform actions always require real tools/receipts.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {validateInstance,supportedNode} from './instance.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const owns=s=>s.uid===process.getuid();
function privateFile(p){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||!owns(s)||(s.mode&0o077))throw Error('Unsafe private metadata');return JSON.parse(fs.readFileSync(p,'utf8'));}
function originOf(value){let u;try{u=new URL(value);}catch{throw Error('Exact HTTPS origin required');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||(u.pathname!=='/'&&u.pathname!==''))throw Error('Exact HTTPS origin required');return u.origin;}
function statePath(root){return path.join(root,'state/installer.json');}
function load(root){const s=path.join(root,'state');if(fs.existsSync(s)){const st=fs.lstatSync(s);if(!st.isDirectory()||st.isSymbolicLink()||!owns(st)||(st.mode&0o077))throw Error('Unsafe state directory');}return fs.existsSync(statePath(root))?privateFile(statePath(root)):null;}
function save(root,value){const dir=path.join(root,'state');fs.mkdirSync(dir,{recursive:true,mode:0o700});load(root);const tmp=path.join(dir,'installer.'+process.pid+'.tmp'),fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,statePath(root));const d=fs.openSync(dir,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
export function parse(args){const options={action:args.shift()||'plan'};for(let i=0;i<args.length;i++){const a=args[i];if(a==='--origin'){if(!args[i+1])throw Error('Origin value required');options.origin=args[++i];}else if(a==='--capabilities'){options.capabilityNames=args[++i]?.split(',')??[];}else if(['--approve-local','--accept-access','--source-reviewed','--install-deps','--trial'].includes(a)){options[{'--approve-local':'approveLocal','--accept-access':'acceptAccess','--source-reviewed':'sourceReviewed','--install-deps':'installDeps','--trial':'trial'}[a]]=true;}else throw Error('Unknown installer option');}return options;}
const nativeNext=['Configure and verify your own stable HTTPS ingress; no resource is purchased','Install/start the Mac user service only with explicit service approval','Complete your own ChatGPT application connection and owner authorization','Discover real target-dot event and native attachment tools; configure one existing-conversation subscription','Install/pair the phone yourself and share a generated sample','Confirm response and original assistant attachment in that same dot; local tests do not prove this'];
export async function installer({root=project,action='plan',origin,approveLocal=false,acceptAccess=false,sourceReviewed=false,installDeps=false,trial=false,capabilityNames=[],run}={}){
 root=fs.realpathSync(root);if(!['plan','run','status','verify'].includes(action))throw Error('Choose plan, run, status or verify');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));if(pkg.name!=='send-to-dot'||!fs.existsSync(path.join(root,'package-lock.json')))throw Error('Wrong source project');
 const configPath=path.join(root,'approved.config.json'),config=fs.existsSync(configPath)?privateFile(configPath):null;
 if(config)validateInstance(root);
 const configuredOrigin=config?.origin;origin=origin?originOf(origin):configuredOrigin;
 if(configuredOrigin&&origin!==configuredOrigin)throw Error('Origin mismatch; existing deployment preserved');
 const checkpoint=load(root);if(checkpoint&&checkpoint.origin!==origin)throw Error('Checkpoint origin mismatch; inspect existing deployment');
 const capabilities=Object.fromEntries(['local_exec','browser','events','library','attachments'].map(n=>[n,capabilityNames.includes(n)?'caller_declared_unverified':'unknown']));
 if(action==='plan'||action==='status')return {status:action==='plan'?'plan_only':checkpoint?.status??'not_started',mutations:false,origin:origin??null,sourceVersion:pkg.version,sourceTrust:'requires official source/version review; project name is not authentication',runtime:{node:process.versions.node,posix:typeof process.getuid==='function'},capabilities,checkpoint:checkpoint??null,next:nativeNext};
 if(!origin)throw Error('Supply your exact HTTPS origin');
 if(action==='run'&&(!approveLocal||!sourceReviewed||(!config&&!acceptAccess)))return {status:'approval_required',mutations:false,required:['--approve-local','--source-reviewed',...(!config?['--accept-access (local one-user storage/owner/upload secrets; upload grant24h)']:[])],next:nativeNext};
 if(typeof process.getuid!=='function'||!supportedNode())throw Error('Use supported POSIX Node25.6.1 or newer');
 if(!trial&&new URL(origin).hostname.endsWith('.trycloudflare.com'))throw Error('Temporary ingress requires --trial and is not daily-use readiness');
 if(!config&&(fs.existsSync(path.join(root,'.secrets'))||fs.existsSync(path.join(root,'state/private.sqlite'))))throw Error('Incomplete setup; preserve existing files and inspect before recovery');
 const invoke=run??(async stage=>{const python=process.env.DOT_INBOX_PYTHON;const commands={dependencies:['/bin/sh',['scripts/bootstrap.sh']],initialize:[process.execPath,['scripts/setup.mjs','--origin',origin,...(trial?['--trial']:[])]],preflight:[process.execPath,['scripts/preflight.mjs','approved.config.json']],verify:[process.execPath,['scripts/preflight.mjs','approved.config.json','--live']]};const [command,args]=commands[stage],r=spawnSync(command,args,{cwd:root,stdio:'pipe',timeout:stage==='dependencies'?300000:60000,maxBuffer:1048576,env:{...process.env,...(python?{DOT_INBOX_PYTHON:python}:{})}});return {ok:r.status===0};});
 if(action==='verify'){const r=await invoke('verify');return {status:r.ok?'https_checked_platform_unverified':'https_check_failed',mutations:false,next:nativeNext.slice(2),secretOutput:false};}
 const lockPath=path.join(root,'.installer.lock');let lock;try{lock=fs.openSync(lockPath,'wx',0o600);fs.writeFileSync(lock,JSON.stringify({pid:process.pid,version:1}));}catch{throw Error('Installer lock exists; inspect owner/process before recovery');}
 try{
 const state=checkpoint??{version:1,origin,sourceVersion:pkg.version,stages:{}};state.status='in_progress';save(root,state);
 for(const stage of [...(installDeps?['dependencies']:[]),...(!config?['initialize']:[]),'preflight']){
  // Recheck dependency/preflight health; never blindly reinitialize existing configuration.
  const result=await invoke(stage);state.stages[stage]=result.ok?'passed':'failed';state.updatedAt=new Date().toISOString();state.status=result.ok?'in_progress':'failed';save(root,state);
  if(!result.ok)return {status:'failed',stage,detail:'Stage failed; inspect locally without sharing secrets. Existing configuration preserved.',resume:'Correct this stage, then rerun the same reviewed command',secretOutput:false};
 }
 state.status='local_ready_platform_pending';save(root,state);return {status:'human_action_required',localReady:true,origin,stages:state.stages,capabilities,next:nativeNext,grantLifetime:'24h; no refresh token or automatic extension',secretOutput:false};
 }finally{fs.closeSync(lock);fs.unlinkSync(lockPath);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const result=await installer(parse(process.argv.slice(2)));console.log(JSON.stringify(result,null,2));if(['failed','https_check_failed','approval_required'].includes(result.status))process.exitCode=1;}catch{console.error(JSON.stringify({status:'stopped',reason:'Unsafe or incomplete source/configuration, missing prerequisites or invalid options. Review INSTALL_FOR_DOT.md; do not overwrite or expose secrets.'}));process.exitCode=1;}}
