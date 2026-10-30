import {spawnSync} from 'node:child_process';import {isAbsolute} from 'node:path';
// A background service must use the reviewed interpreter selected during setup.
export function verifyDecoderRuntime(python,{run=spawnSync}={}){
 if(typeof python!=='string'||!isAbsolute(python))throw Error('Run setup to select an absolute Python path with Pillow12.0.0');
 const r=run(python,['-c','from PIL import Image; assert Image.__version__ == "12.0.0"; print(Image.__version__)'],{timeout:10000,maxBuffer:1024});
 if(r.status!==0||r.stdout?.toString().trim()!=='12.0.0')throw Error('Configured image decoder must use Pillow12.0.0; run preflight before starting');
 return {python,version:'12.0.0'};
}
