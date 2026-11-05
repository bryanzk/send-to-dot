import {DurableObject} from 'cloudflare:workers';
import {buildInbox} from './inbox_object.mjs';
export class InboxObject extends DurableObject {
  constructor(ctx,env){super(ctx,env);
    this.box=buildInbox({sql:ctx.storage.sql,tx:fn=>ctx.storage.transactionSync(fn),env});}
  async fetch(request){
    const r=await this.box.handle(request);await this.schedule();return r;}
  async alarm(){await this.box.tick();await this.schedule();}
  async schedule(){const at=this.box.nextWake();const cur=await this.ctx.storage.getAlarm();
    if(at==null){if(cur!=null)await this.ctx.storage.deleteAlarm();return;}
    if(cur==null||cur>at)await this.ctx.storage.setAlarm(at);}
}
export default {fetch(request,env){return env.INBOX.get(env.INBOX.idFromName('personal')).fetch(request);}};
