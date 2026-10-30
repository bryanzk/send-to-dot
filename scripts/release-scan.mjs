// Allowlisted source package: never scan/copy state or secret contents.
import {readdirSync,readFileSync,lstatSync} from 'node:fs';import {join,relative} from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));const findings=[];let count=0;
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){
 if(e.name==='node_modules'||e.name==='.git')continue;const p=join(dir,e.name),r=relative(root,p);
 if(lstatSync(p).isSymbolicLink()){findings.push(r+': unexpected symlink');continue;}
 if(e.isDirectory()){if(['.secrets','state','__pycache__','.venv'].includes(e.name)){findings.push(r+': runtime directory excluded from release');continue;}walk(p);continue;}
 count++;if(/(?:\.sqlite(?:-.*)?|\.log|\.pyc|approved\.config\.json|\.env|\.png)$/i.test(e.name)&&!r.startsWith('web/'))findings.push(r+': runtime artifact');
 if(/\.(?:mjs|js|json|md|py|txt|example|swift|plist|entitlements)$/.test(e.name)){
 const s=readFileSync(p,'utf8');if(/\/Users\/[^/]+|https:\/\/(?:[a-z]+-){3}[a-z]+\.trycloudflare\.com|asdk_app_[a-z0-9]+|sk-proj-[A-Za-z0-9_-]+/.test(s))findings.push(r+': personal/runtime identifier');
 }
}}
walk(root);console.log(JSON.stringify({files:count,findings},null,2));process.exitCode=findings.length?1:0;
