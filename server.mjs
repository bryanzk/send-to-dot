// Node deployment entry: file storage, Node HTTPS webhook transport, local read cache and the Python ledger runner.
import {readFileSync} from 'node:fs';
import {Inbox} from './store.mjs';
import {verifyCallback,postSigned} from './callback.mjs';
import {ReadCache} from './read_cache.mjs';
import {ledgerRunner} from './ledger_runner.mjs';
import {createApp as createCore} from './app.mjs';
export function createApp(config,{inbox=new Inbox(config.database,config.storageKey),callbackVerifier=verifyCallback,dispatcher=postSigned,...rest}={}){
 return createCore(config,{inbox,callbackVerifier,dispatcher,
  readCache:config.readCacheDirectory?new ReadCache(config.readCacheDirectory):null,
  webFile:name=>readFileSync(new URL('./web/'+name,import.meta.url)),
  ledgerRun:config.dotNativeDelivery===true&&!config.ledgerRunner?ledgerRunner({python:process.env.DOT_INBOX_PYTHON}):null,...rest});
}
