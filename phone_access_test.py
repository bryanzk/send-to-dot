import importlib.util, json, os, sqlite3, tempfile, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('phone_access',Path(__file__).parent/'scripts/phone_access.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class PhoneAccessTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name).resolve()
        for name in ('state','.secrets'): (self.root/name).mkdir(mode=0o700)
        self.phone=self.root/'.secrets/phone-upload';self.phone.write_text('fixture-only-upload-token');self.phone.chmod(0o600)
        self.dbpath=self.root/'state/private.sqlite'
        with sqlite3.connect(self.dbpath) as d:
            d.execute('CREATE TABLE tokens(hash TEXT PRIMARY KEY, owner TEXT, scope TEXT, expires INTEGER)')
            d.execute('CREATE TABLE subscriptions(id TEXT)');d.execute("INSERT INTO subscriptions VALUES('keep-sub')")
            d.executemany('INSERT INTO tokens VALUES(?,?,?,?)',[(m.digest(self.phone.read_text()),'owner','upload',2000000),('unrelated-read','owner','read subscribe',9999999)])
        self.dbpath.chmod(0o600)
        self.config=self.root/'approved.config.json';self.config.write_text(json.dumps({'database':str(self.dbpath),'phoneCredentialFile':str(self.phone)}));self.config.chmod(0o600)
    def tearDown(self):self.tmp.cleanup()
    def call(self,action):return m.maintain(self.root,action,clock=lambda:1000)
    def test_renew_revoke_rotate_are_upload_only_no_secrets(self):
        old=self.phone.read_text();r=self.call('renew');self.assertFalse(r['phoneRePairRequired']);self.assertNotIn(old,json.dumps(r))
        self.assertEqual(self.call('status')['status'],'active');self.call('revoke');self.assertEqual(self.call('status')['status'],'expired_or_revoked')
        with self.assertRaises(ValueError):self.call('renew')
        self.assertTrue(self.call('rotate')['phoneRePairRequired']);self.assertNotEqual(self.phone.read_text(),old)
        with sqlite3.connect(self.dbpath) as d:
            self.assertIsNone(d.execute('SELECT * FROM tokens WHERE hash=?',(m.digest(old),)).fetchone())
            self.assertEqual(d.execute('SELECT count(*) FROM subscriptions').fetchone()[0],1)
            self.assertEqual(d.execute("SELECT count(*) FROM tokens WHERE scope='read subscribe'").fetchone()[0],1)
    def test_refuse_scope_and_unsafe_metadata(self):
        with sqlite3.connect(self.dbpath) as d:d.execute("UPDATE tokens SET scope='read subscribe' WHERE scope='upload'")
        for action in ('renew','revoke','rotate'):
            with self.assertRaises(ValueError):self.call(action)
        self.phone.chmod(0o644)
        with self.assertRaises(ValueError):self.call('status')
    def test_state_symlink_refused(self):
        moved=self.root/'moved';(self.root/'state').rename(moved);(self.root/'state').symlink_to(moved)
        with self.assertRaises(ValueError):self.call('rotate')
    def test_recover_every_rotation_checkpoint(self):
        old=self.phone.read_text();new='fixture-new-upload-token'
        journal=self.root/'state/phone-rotation.json';pending=self.root/'.secrets/phone-upload.pending'
        def prepare():m.write_new(journal,json.dumps({'oldHash':m.digest(old),'newHash':m.digest(new),'expires':9999999}))
        prepare();self.assertEqual(self.call('status')['status'],'rotation_pending')
        self.assertEqual(self.call('recover')['status'],'rotation_not_committed_preserved_old')
        prepare();m.write_new(pending,new);self.assertEqual(self.call('recover')['status'],'rotation_not_committed_preserved_old')
        prepare();m.write_new(pending,new)
        with sqlite3.connect(self.dbpath) as d:
            d.execute('DELETE FROM tokens WHERE hash=?',(m.digest(old),));d.execute('INSERT INTO tokens VALUES(?,?,?,?)',(m.digest(new),'owner','upload',9999999))
        self.assertEqual(self.call('recover')['status'],'rotation_completed');self.assertEqual(self.phone.read_text(),new)
        # Simulate commit+rename completed but journal cleanup interrupted.
        prepare();self.assertEqual(self.call('recover')['status'],'rotation_completed')
    def test_invalid_hours_and_foreign_path_refused(self):
        with self.assertRaises(ValueError):m.maintain(self.root,'renew',25)
        cfg=json.loads(self.config.read_text());cfg['phoneCredentialFile']=str(self.root/'outside');self.config.write_text(json.dumps(cfg))
        with self.assertRaises(ValueError):self.call('rotate')

if __name__=='__main__':unittest.main()
