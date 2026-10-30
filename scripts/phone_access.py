"""Explicit local-owner upload-grant maintenance. Never prints credential values."""
import argparse, contextlib, fcntl, hashlib, json, os, secrets, sqlite3, stat, time
from pathlib import Path

def checked(path, directory=False):
    path = Path(path)
    s = path.lstat()
    valid = stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode)
    if not valid or s.st_uid != os.getuid() or stat.S_IMODE(s.st_mode) & 0o077:
        raise ValueError('Unsafe private file/directory metadata')
    return path

def read_private(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        s = os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or stat.S_IMODE(s.st_mode) & 0o077:
            raise ValueError('Unsafe private file metadata')
        with os.fdopen(fd, 'r') as stream:
            fd = None
            return stream.read()
    finally:
        if fd is not None: os.close(fd)

def sync_dir(path):
    fd = os.open(path, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)

def write_new(path, text):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as out:
        out.write(text); out.flush(); os.fsync(out.fileno())
    sync_dir(path.parent)

def digest(value): return hashlib.sha256(value.encode()).hexdigest()

def maintain(root, action, hours=720, clock=time.time):
    if action not in ('status', 'renew', 'revoke', 'rotate', 'recover') or not 1 <= hours <= 720:
        raise ValueError('Choose status/renew/revoke/rotate/recover; hours must be 1..720 (at most30days)')
    root = Path(root).resolve()
    cfg = json.loads(read_private(checked(root/'approved.config.json')))
    state, secret_dir = checked(root/'state', True), checked(root/'.secrets', True)
    phone, database = Path(cfg['phoneCredentialFile']), Path(cfg['database'])
    if phone != secret_dir/'phone-upload' or database.parent != state:
        raise ValueError('Only this instance phone file and state database are allowed')
    checked(phone); checked(database)
    lock = state/'phone-access.lock'
    fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        checked(lock); fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with contextlib.closing(sqlite3.connect(database, timeout=5)) as db:
            db.row_factory = sqlite3.Row
            now = int(clock()*1000)
            pending, journal = secret_dir/'phone-upload.pending', state/'phone-rotation.json'
            def row_for(h): return db.execute('SELECT owner,scope,expires FROM tokens WHERE hash=?', (h,)).fetchone()
            def upload_only(row):
                if row and (row['owner'] != 'owner' or row['scope'] != 'upload'):
                    raise ValueError('Refusing non-upload or different-owner grant')
            if journal.exists() or pending.exists():
                if action == 'status': return {'status':'rotation_pending','next':'phone_access.py recover','secretsPrinted':False}
                if action != 'recover': raise ValueError('Interrupted rotation; run recover before further changes')
                j = json.loads(read_private(checked(journal)))
                current = read_private(phone).strip()
                new = read_private(checked(pending)).strip() if pending.exists() else current
                if set(j) != {'oldHash','newHash','expires'} or (pending.exists() and digest(new) != j['newHash']):
                    raise ValueError('Rotation journal mismatch; preserve files for owner inspection')
                oldrow, newrow = row_for(j['oldHash']), row_for(j['newHash'])
                upload_only(oldrow); upload_only(newrow)
                if newrow and not oldrow and digest(new) == j['newHash']:
                    if pending.exists(): os.replace(pending, phone); sync_dir(secret_dir)
                    journal.unlink(); sync_dir(state)
                    return {'status':'rotation_completed','phoneRePairRequired':True,'secretsPrinted':False}
                if not newrow and digest(current) == j['oldHash']:
                    if pending.exists(): pending.unlink(); sync_dir(secret_dir)
                    journal.unlink(); sync_dir(state)
                    return {'status':'rotation_not_committed_preserved_old','secretsPrinted':False}
                raise ValueError('Ambiguous rotation; no grant or secret changed')
            if action == 'recover': return {'status':'nothing_to_recover','secretsPrinted':False}
            token = read_private(phone).strip()
            if not token or len(token) > 512: raise ValueError('Invalid upload credential file')
            h = digest(token); row = row_for(h); upload_only(row)
            if action == 'status':
                return {'status':'active' if row and row['expires']>now else 'expired_or_revoked', 'expiresAt':row['expires'] if row else None,'secretsPrinted':False}
            if action == 'renew':
                if not row: raise ValueError('Grant missing/revoked/swept; rotate to issue a fresh upload code')
                expiry = now + hours*3600000
                with db:
                    changed=db.execute("UPDATE tokens SET expires=? WHERE hash=? AND owner='owner' AND scope='upload'",(expiry,h)).rowcount
                    if changed != 1: raise ValueError('Grant disappeared; rotate to issue a fresh code')
                return {'status':'renewed','expiresAt':expiry,'phoneRePairRequired':False,'secretsPrinted':False}
            if action == 'revoke':
                with db: db.execute("DELETE FROM tokens WHERE hash=? AND owner='owner' AND scope='upload'",(h,))
                return {'status':'revoked','readAndSubscriptionsChanged':False,'secretsPrinted':False}
            new = secrets.token_urlsafe(32); expiry = now+hours*3600000
            write_new(journal,json.dumps({'oldHash':h,'newHash':digest(new),'expires':expiry}))
            write_new(pending,new)
            with db:
                db.execute("DELETE FROM tokens WHERE hash=? AND owner='owner' AND scope='upload'",(h,))
                db.execute('INSERT INTO tokens VALUES(?,?,?,?)',(digest(new),'owner','upload',expiry))
            os.replace(pending,phone); sync_dir(secret_dir)
            journal.unlink(); sync_dir(state)
            return {'status':'rotated','expiresAt':expiry,'phoneRePairRequired':True,'secretsPrinted':False}
    finally: os.close(fd)

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['status','renew','revoke','rotate','recover'])
    duration=parser.add_mutually_exclusive_group()
    duration.add_argument('--hours',type=int)
    duration.add_argument('--days',type=int)
    args=parser.parse_args()
    try: print(json.dumps(maintain(Path(__file__).resolve().parents[1],args.action,(args.days*24 if args.days is not None else args.hours if args.hours is not None else 720))))
    except (ValueError,OSError,sqlite3.Error) as e: raise SystemExit('Upload access stopped: '+str(e))
