// Node only: runs scripts/attachment-fast.py (the Python SplitDelivery ledger) for each state change.
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
export function ledgerRunner({python=process.env.DOT_INBOX_PYTHON??'python3',script=fileURLToPath(new URL('./scripts/attachment-fast.py',import.meta.url)),ledger='existing-workspace',timeoutMs=20000}={}){
 return (action,fileId,eventId,payload={})=>new Promise(resolve=>{
  const child=spawn(python,[script,action,fileId,eventId,'--ledger',ledger],{stdio:['pipe','pipe','ignore']});let out='';
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
  child.stdout.on('data',c=>{if(out.length<65536)out+=c;});
  child.on('error',()=>{});
  child.on('close',code=>{clearTimeout(timer);let r;try{r=JSON.parse(out.trim().split('\n').pop());}catch{r={decision:'hold',reason:'ledger_result_unavailable'};}resolve({exit:code,...r});});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(payload));
 });
}
