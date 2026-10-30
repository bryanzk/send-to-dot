// Compatibility alias; new users should use scripts/setup.mjs directly.
import {cli} from './scripts/setup.mjs';
try{if(!process.argv[2])throw Error('Use node scripts/setup.mjs --origin https://your-own-origin');console.log(JSON.stringify(cli(['--origin',process.argv[2],...process.argv.slice(3)]),null,2));}catch(e){console.error('Setup stopped: '+e.message);process.exitCode=1;}
