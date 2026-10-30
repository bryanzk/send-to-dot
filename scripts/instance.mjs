// Metadata-only validation; never returns or logs secret contents.
import fs from 'node:fs';import path from 'node:path';
export function supportedNode(version=process.versions.node){const [a,b,c]=version.split('.').map(Number);return a>25||(a===25&&(b>6||(b===6&&c>=1)));}
export function validateInstance(root){root=fs.realpathSync(root);const configPath=path.join(root,'approved.config.json');
 const ownedFile=(p,max=1048576)=>{const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>max||fs.realpathSync(p)!==path.resolve(p))throw Error('Unsafe instance file');};
 const directory=p=>{const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)||fs.realpathSync(p)!==p)throw Error('Unsafe instance directory');};
 ownedFile(configPath);const c=JSON.parse(fs.readFileSync(configPath,'utf8'));let u;try{u=new URL(c.origin);}catch{throw Error('Invalid instance origin');}if(u.protocol!=='https:'||u.origin!==c.origin||c.initializePhone!==false)throw Error('Incomplete instance configuration');
 const state=path.join(root,'state'),secrets=path.join(root,'.secrets');directory(state);directory(secrets);
 for(const [key,base,max]of [['database',state,Infinity],['storageKeyFile',secrets,1024],['approvalSecretFile',secrets,1024],['phoneCredentialFile',secrets,1024]]){if(typeof c[key]!=='string'||!path.isAbsolute(c[key])||!path.resolve(c[key]).startsWith(base+path.sep))throw Error('Foreign instance path');ownedFile(c[key],max);}
 if(typeof c.pythonExecutable!=='string'||!path.isAbsolute(c.pythonExecutable)||!fs.statSync(c.pythonExecutable).isFile())throw Error('Missing Python executable');fs.accessSync(c.pythonExecutable,fs.constants.X_OK);
 return c;
}
