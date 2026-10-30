import concurrent.futures,contextlib,hashlib,importlib.util,json,os,sqlite3,tempfile,time,unittest,uuid
from pathlib import Path
spec=importlib.util.spec_from_file_location('consume_read_cache',Path(__file__).parent/'scripts/consume_read_cache.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class CacheTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name).resolve();self.cache=self.root/'cache';self.cache.mkdir(mode=0o700);self.staging=self.root/'staging';self.db=self.root/'meta.sqlite';self.now=1000;self.file='11111111-1111-4111-8111-111111111111';self.event='evt_fixture_12345678';self.bytes=b'x'*8165000;self.sha=hashlib.sha256(self.bytes).hexdigest();self.grant='a'*64
  with contextlib.closing(sqlite3.connect(self.db)) as db,db:
   db.executescript('CREATE TABLE images(id,owner,event,digest,expires,mime);CREATE TABLE tokens(hash,owner,scope,expires);')
   db.execute('INSERT INTO images VALUES(?,?,?,?,?,?)',(self.file,'owner',self.event,self.sha,2000000,'image/jpeg'));db.execute('INSERT INTO tokens VALUES(?,?,?,?)',(self.grant,'owner','read subscribe',2000000))
 def tearDown(self):self.tmp.cleanup()
 def receipt(self,**extra):
  r='read_'+str(uuid.uuid4());m={'version':1,'receipt':r,'file_id':self.file,'event_id':self.event,'owner':'owner','grant_hash':self.grant,'sha256':self.sha,'mime':'image/jpeg','byte_length':len(self.bytes),'created_at':1000000,'expires_at':1300000,**extra}
  for suffix,data in (('.bin',self.bytes),('.json',json.dumps(m).encode())):
   p=self.cache/(r+suffix);p.write_bytes(data);p.chmod(0o600)
  return r
 def consume(self,r):return mod.consume(r,self.file,self.event,self.sha,database=self.db,cache=self.cache,staging=self.staging,clock=lambda:self.now)
 def test_large_exact_bytes_and_no_second_consume(self):
  r=self.receipt();result=self.consume(r);self.assertEqual(Path(result['staged_path']).read_bytes(),self.bytes);self.assertEqual(Path(result['staged_path']).stat().st_mode&0o777,0o600);self.assertNotIn('caption',result)
  with self.assertRaises((FileNotFoundError,ValueError)):self.consume(r)
 def test_expiry_and_revoked_or_wrong_grant_delete_without_export(self):
  for mode in ('expired','revoked','wrong_scope'):
   r=self.receipt(expires_at=999999 if mode=='expired' else 1300000)
   with contextlib.closing(sqlite3.connect(self.db)) as db,db:
    if mode=='revoked':db.execute('DELETE FROM tokens')
    if mode=='wrong_scope':db.execute('INSERT OR REPLACE INTO tokens VALUES(?,?,?,?)',(self.grant,'owner','upload',2000000))
   with self.assertRaises(ValueError):self.consume(r)
   self.assertFalse((self.cache/(r+'.bin')).exists());self.assertFalse(any(self.staging.glob('cache_*')))
 def test_swapped_metadata_and_body_digest_reject(self):
  r=self.receipt(file_id='22222222-2222-4222-8222-222222222222')
  with self.assertRaises(ValueError):self.consume(r)
  r=self.receipt();(self.cache/(r+'.bin')).write_bytes(b'changed')
  with self.assertRaises(ValueError):self.consume(r)
  self.assertFalse(any(self.staging.glob('cache_*')))
 def test_symlink_paths_and_concurrent_duplicate_have_no_resurrection(self):
  r=self.receipt();outside=self.root/'outside';outside.write_bytes(self.bytes);outside.chmod(0o600);(self.cache/(r+'.bin')).unlink();(self.cache/(r+'.bin')).symlink_to(outside)
  with self.assertRaises((ValueError,OSError)):self.consume(r)
  self.assertTrue(outside.exists())
  r=self.receipt()
  def one():
   try:return self.consume(r)
   except (ValueError,OSError):return None
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:one(),range(2)))
  self.assertEqual(sum(x is not None for x in results),1)
  with self.assertRaises((ValueError,OSError)):self.consume(r)
if __name__=='__main__':unittest.main()
