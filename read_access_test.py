import importlib.util,sqlite3,json,tempfile,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('read_access',Path(__file__).parent/'scripts/read_access.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Revocation(unittest.TestCase):
 def test_scope_metadata_only_and_no_image_or_upload_deletion(self):
  with tempfile.TemporaryDirectory()as d:
   r=Path(d).resolve();(r/'state').mkdir(mode=0o700);p=r/'state/db';c=r/'approved.config.json';c.write_text(json.dumps({'database':str(p)}));c.chmod(0o600)
   with sqlite3.connect(p)as db:
    db.executescript("CREATE TABLE tokens(hash TEXT,owner TEXT,scope TEXT,expires INTEGER);CREATE TABLE subscriptions(id TEXT,grant_hash TEXT);CREATE TABLE queue(subscription TEXT);CREATE TABLE images(id TEXT);CREATE TABLE codes(hash TEXT);INSERT INTO codes VALUES('pending-approved-code');INSERT INTO tokens VALUES('read-fixture','owner','read subscribe',9999999999),('upload-fixture','owner','upload',9999999999);INSERT INTO subscriptions VALUES('s','read-fixture');INSERT INTO queue VALUES('s');INSERT INTO images VALUES('kept');")
   p.chmod(0o600);self.assertEqual(m.manage(r,'status',lambda:0)['activeCount'],1);result=m.manage(r,'revoke');self.assertFalse(result['uploadGrantsChanged']);self.assertNotIn('read-fixture',json.dumps(result))
   with sqlite3.connect(p)as db:self.assertEqual(db.execute('SELECT count(*) FROM tokens').fetchone()[0],1);self.assertEqual(db.execute('SELECT count(*) FROM images').fetchone()[0],1);self.assertEqual(db.execute('SELECT count(*) FROM subscriptions').fetchone()[0],0);self.assertEqual(db.execute('SELECT count(*) FROM codes').fetchone()[0],0)
   self.assertEqual(m.manage(r,'status')['grantCount'],0)
 def test_foreign_db_refused(self):
  with tempfile.TemporaryDirectory()as d:
   r=Path(d).resolve();(r/'state').mkdir(mode=0o700);c=r/'approved.config.json';c.write_text(json.dumps({'database':str(r/'foreign')}));c.chmod(0o600)
   with self.assertRaises(ValueError):m.manage(r,'revoke')
if __name__=='__main__':unittest.main()
