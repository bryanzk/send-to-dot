"""Consume one authorized native-read cache receipt, never arbitrary paths or DB blobs."""
import argparse,contextlib,fcntl,hashlib,json,os,re,sqlite3,stat,sys,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
RECEIPT=re.compile(r'read_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}')
HASH=re.compile(r'[0-9a-f]{64}')


def directory(path):
    path=Path(os.path.abspath(path));s=path.lstat()
    if not stat.S_ISDIR(s.st_mode) or s.st_uid!=os.getuid() or stat.S_IMODE(s.st_mode)!=0o700 or path.resolve()!=path:
        raise ValueError('Unsafe fixed directory')
    return path


def open_owned(path,limit):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or stat.S_IMODE(s.st_mode)!=0o600 or s.st_nlink!=1 or s.st_size>limit:
            raise ValueError('Unsafe cache file')
        return fd,s
    except BaseException:os.close(fd);raise


def consume(receipt,file_id,event_id,sha256,*,database,cache,staging,clock=time.time):
    if not RECEIPT.fullmatch(receipt) or str(uuid.UUID(file_id))!=file_id or not re.fullmatch(r'evt_[A-Za-z0-9_-]{8,100}',event_id) or not HASH.fullmatch(sha256):
        raise ValueError('Invalid read receipt identifiers')
    cache=directory(cache);staging=Path(os.path.abspath(staging))
    staging.mkdir(mode=0o700,parents=True,exist_ok=True);staging=directory(staging)
    manifest=cache/(receipt+'.json');claimed=cache/(receipt+'.claimed.json');body=cache/(receipt+'.bin')
    # Lock persists as a zero-byte metadata tombstone; retries never resurrect a receipt.
    lockfd=os.open(cache/(receipt+'.lock'),os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        s=os.fstat(lockfd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or stat.S_IMODE(s.st_mode)!=0o600 or s.st_nlink!=1:raise ValueError('Unsafe cache lock')
        fcntl.flock(lockfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        fd,_=open_owned(manifest,4096)
        try:m=json.loads(os.read(fd,4097))
        finally:os.close(fd)
        # Claim before any export; an interrupted/uncertain consume is never retried.
        if claimed.exists() or claimed.is_symlink():raise ValueError('Read receipt already claimed')
        os.rename(manifest,claimed)
        def cleanup():
            for path in (claimed,body):
                try:
                    s=path.lstat()
                    if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or stat.S_IMODE(s.st_mode)!=0o600 or s.st_nlink!=1:raise ValueError('Unsafe cache cleanup entry')
                    path.unlink()
                except FileNotFoundError:pass
        try:
            now=int(clock()*1000)
            keys={'version','receipt','file_id','event_id','owner','grant_hash','sha256','mime','byte_length','created_at','expires_at'}
            if not isinstance(m,dict) or set(m)!=keys or type(m['version']) is not int or m['version']!=1 or m['receipt']!=receipt or m['file_id']!=file_id or m['event_id']!=event_id or m['sha256']!=sha256 or m['owner']!='owner' or not isinstance(m['grant_hash'],str) or not HASH.fullmatch(m['grant_hash']) or m['mime'] not in ('image/png','image/jpeg') or type(m['byte_length']) is not int or not 0<m['byte_length']<=8388608 or type(m['expires_at']) is not int or type(m['created_at']) is not int or not m['created_at']<=now<m['expires_at']<=m['created_at']+300000:
                raise ValueError('Cache identity or expiry mismatch')
            with contextlib.closing(sqlite3.connect('file:'+str(Path(database).resolve())+'?mode=ro',uri=True)) as db:
                db.row_factory=sqlite3.Row
                row=db.execute("SELECT event,digest,expires,mime FROM images WHERE id=? AND owner=?",(file_id,m['owner'])).fetchone()
                grant=db.execute('SELECT owner,scope,expires FROM tokens WHERE hash=?',(m['grant_hash'],)).fetchone()
                if not row or row['event']!=event_id or row['digest']!=sha256 or row['mime']!=m['mime'] or row['expires']<=now or m['expires_at']>row['expires'] or not grant or grant['owner']!=m['owner'] or 'read' not in grant['scope'].split() or grant['expires']<=now:
                    raise ValueError('Source or read grant unavailable')
            source_fd,s=open_owned(body,8388608)
            target=staging/('cache_'+receipt[5:]+('.png' if m['mime']=='image/png' else '.jpg'))
            target_fd=None;created=False
            try:
                if s.st_size!=m['byte_length']:raise ValueError('Cache length mismatch')
                target_fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);created=True
                digest=hashlib.sha256();size=0
                while True:
                    chunk=os.read(source_fd,65536)
                    if not chunk:break
                    size+=len(chunk)
                    if size>m['byte_length']:raise ValueError('Cache length changed')
                    digest.update(chunk)
                    with os.fdopen(os.dup(target_fd),'wb',closefd=True) as out:out.write(chunk);out.flush()
                if size!=m['byte_length'] or digest.hexdigest()!=sha256 or int(clock()*1000)>=min(m['expires_at'],row['expires'],grant['expires']):raise ValueError('Cache bytes or authorization expired')
                # Recheck revocation/source deletion after copying as well as
                # before it; expiry alone cannot establish a still-live grant.
                with contextlib.closing(sqlite3.connect('file:'+str(Path(database).resolve())+'?mode=ro',uri=True)) as db:
                    latest=db.execute('SELECT owner,scope,expires FROM tokens WHERE hash=?',(m['grant_hash'],)).fetchone()
                    original=db.execute('SELECT event,digest,expires,mime FROM images WHERE id=? AND owner=?',(file_id,m['owner'])).fetchone()
                    if not latest or latest[0]!=m['owner'] or 'read' not in latest[1].split() or latest[2]<=int(clock()*1000) or not original or original[0]!=event_id or original[1]!=sha256 or original[2]<=int(clock()*1000) or original[3]!=m['mime']:raise ValueError('Source or grant revoked during consume')
                os.fsync(target_fd)
            except BaseException:
                if created:target.unlink(missing_ok=True)
                raise
            finally:
                os.close(source_fd)
                if target_fd is not None:os.close(target_fd)
            cleanup()
            return {'staged_path':str(target),'sha256':sha256,'mime':m['mime'],'byte_length':size}
        except BaseException:
            cleanup();raise
    finally:
        fcntl.flock(lockfd,fcntl.LOCK_UN);os.close(lockfd)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('receipt','file_id','event_id','original_sha256'):p.add_argument(arg)
    args=p.parse_args();config=json.loads((ROOT/'approved.config.json').read_text());database=Path(config['database']).resolve()
    if not database.is_relative_to(ROOT/'state'):raise ValueError('Approved database required')
    result=consume(args.receipt,args.file_id,args.event_id,args.original_sha256,database=database,cache=ROOT/'state/read-cache',staging=ROOT/'.delivery/inbox-images')
    print(json.dumps(result))


if __name__=='__main__':main()
