"""Owner-local status/revocation for ChatGPT read/subscribe grants. No secret output."""
import argparse,importlib.util,json,sqlite3,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('phone_access',Path(__file__).with_name('phone_access.py'));phone=importlib.util.module_from_spec(spec);spec.loader.exec_module(phone)
def manage(root,action,clock=time.time):
    if action not in ('status','revoke'):raise ValueError('Choose status or revoke')
    root=Path(root).resolve();cfg=json.loads(phone.read_private(phone.checked(root/'approved.config.json')));state=phone.checked(root/'state',True);dbpath=Path(cfg['database'])
    if dbpath.parent!=state:raise ValueError('Foreign database')
    phone.checked(dbpath);db=sqlite3.connect('file:'+str(dbpath)+'?mode='+('ro'if action=='status'else'rw'),uri=True)
    try:
        condition="owner='owner' AND scope IN ('read','subscribe','read subscribe')"
        if action=='status':
            rows=db.execute('SELECT expires FROM tokens WHERE '+condition).fetchall();return {'grantCount':len(rows),'activeCount':sum(r[0]>int(clock()*1000)for r in rows),'expiresAt':[r[0]for r in rows],'secretsPrinted':False}
        with db:
            db.execute('DELETE FROM tokens WHERE '+condition)
            if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='codes'").fetchone():db.execute('DELETE FROM codes')
            db.execute('DELETE FROM subscriptions WHERE grant_hash NOT IN (SELECT hash FROM tokens)')
            db.execute('DELETE FROM queue WHERE subscription NOT IN (SELECT id FROM subscriptions)')
        return {'status':'revoked','scope':'owner read/subscribe grants and their subscriptions','uploadGrantsChanged':False,'imagesDeleted':False,'secretsPrinted':False}
    finally:db.close()
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['status','revoke']);p.add_argument('--approve-revoke',action='store_true');a=p.parse_args()
    if a.action=='revoke'and not a.approve_revoke:raise SystemExit('Explicit --approve-revoke required; all this owner’s ChatGPT read/subscribe connections stop.')
    try:print(json.dumps(manage(Path(__file__).resolve().parents[1],a.action)))
    except (OSError,ValueError,sqlite3.Error):raise SystemExit('Read access maintenance stopped; inspect private configuration/metadata locally. No credentials printed.')
