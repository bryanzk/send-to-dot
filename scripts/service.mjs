// Only this instance's macOS user job. No power/network settings or resource provisioning.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {validateInstance} from './instance.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function safeFile(p){const s=fs.lstatSync(p);if(s.isSymbolicLink()||!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('Unsafe instance metadata');}
function safeDir(p){const s=fs.lstatSync(p);if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o022))throw Error('Unsafe directory');}
export function servicePlan({root=project,home=os.homedir(),platform=process.platform,node=process.execPath,validateRuntime=true}={}){
 if(platform!=='darwin')throw Error('Mac user service only; use your own process manager on other systems');
 root=fs.realpathSync(root);home=fs.realpathSync(home);const config=path.join(root,'approved.config.json');const c=validateRuntime?validateInstance(root):{origin:null};
 if(validateRuntime&&(!c.origin?.startsWith('https://')||c.initializePhone!==false))throw Error('Complete reviewed setup first');
 const state=path.join(root,'state');if(validateRuntime)safeDir(state);const label='com.sendtodot.'+createHash('sha256').update(root).digest('hex').slice(0,20),dir=path.join(home,'Library/LaunchAgents'),plist=path.join(dir,label+'.plist');
 const args=[fs.realpathSync(node),path.join(root,'launch.mjs'),config];
 const log=path.join(state,'service.log');const text='<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>'+label+'</string><key>ProgramArguments</key><array>'+args.map(s=>'<string>'+xml(s)+'</string>').join('')+'</array><key>WorkingDirectory</key><string>'+xml(root)+'</string><key>EnvironmentVariables</key><dict><key>HOME</key><string>'+xml(home)+'</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer><key>StandardOutPath</key><string>'+xml(log)+'</string><key>StandardErrorPath</key><string>'+xml(log)+'</string></dict></plist>\n';
 if(fs.existsSync(dir))safeDir(dir);
 if(fs.existsSync(plist)){safeFile(plist);if(fs.readFileSync(plist,'utf8')!==text)throw Error('Unknown existing job preserved');}
 return {root,home,state,label,dir,plist,log,text,args,origin:c.origin,domain:'gui/'+process.getuid()};
}
export function service({action='plan',approveService=false,...options}={},exec=(args)=>spawnSync('/bin/launchctl',args,{encoding:'utf8',timeout:15000,maxBuffer:1048576})){
 if(!['plan','install','status','stop'].includes(action))throw Error('Choose plan, install, status or stop');const p=servicePlan({...options,validateRuntime:action==='plan'||action==='install'}),target=p.domain+'/'+p.label;
 const summary={instance:p.label,origin:p.origin,scope:'one current-user Mac job only',keepsComputerAwake:false,configuresHTTPS:false};
 if(action==='plan')return {status:'plan_only',mutations:false,...summary,approval:'--approve-service',next:'Validate config and approve this user job, then verify local and public HTTPS health'};
 const inspect=()=>{const r=exec(['print',target]);const absent=!r.error&&r.status!==0&&/could not find (?:specified )?service|service could not be found/i.test(r.stderr??'');return {known:r.status===0||absent,loaded:r.status===0,running:r.status===0&&/state = running/.test(r.stdout??'')};};
 let actual=inspect();
 if(!actual.known)return {status:action==='stop'?'stop_unconfirmed':'inspection_unconfirmed',mutations:false,...summary};
 if(action==='status')return {status:actual.running?'running':actual.loaded?'loaded_not_running':'stopped',mutations:false,...summary};
 if(!approveService)return {status:'approval_required',mutations:false,...summary};
 if(actual.loaded&&!fs.existsSync(p.plist))throw Error('Existing job without owned metadata; preserved');
 if(action==='stop'){if(!actual.loaded)return {status:'already_stopped',...summary};const r=exec(['bootout',target]);actual=inspect();if(!actual.known||actual.loaded)return {status:'stop_unconfirmed',...summary};return {status:'stopped',...summary,plistRetained:true};}
 if(actual.loaded)return {status:actual.running?'already_running':'loaded_not_running',...summary,next:'Inspect own service.log and configuration; no duplicate bootstrap'};
 // Only after approval, create this exact owned plist and private log.
 for(const dir of [path.join(p.home,'Library'),p.dir]){if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});safeDir(dir);}
 if(!fs.existsSync(p.log)){const fd=fs.openSync(p.log,'wx',0o600);fs.closeSync(fd);}else safeFile(p.log);
 if(!fs.existsSync(p.plist))fs.writeFileSync(p.plist,p.text,{flag:'wx',mode:0o600});
 const result=exec(['bootstrap',p.domain,p.plist]);actual=inspect();
 return {status:actual.running?'running':actual.loaded?'loaded_not_running':result.status===0?'start_unconfirmed':'start_failed',...summary,next:'Run installer verify; this status alone does not prove HTTPS, OAuth or original-dot delivery'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const args=process.argv.slice(2),action=args.shift()||'plan';if(args.some(x=>x!=='--approve-service'))throw Error('Unknown option');const r=service({action,approveService:args.includes('--approve-service')});console.log(JSON.stringify(r,null,2));if(['approval_required','start_failed','start_unconfirmed','stop_unconfirmed','loaded_not_running','inspection_unconfirmed'].includes(r.status))process.exitCode=1;}catch{console.error(JSON.stringify({status:'stopped',reason:'Unsupported system, incomplete setup or unsafe/unrecognized service metadata. Preserve existing jobs and review INSTALL_FOR_DOT.md.'}));process.exitCode=1;}}
