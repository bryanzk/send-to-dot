import importlib.util,json,sqlite3,tempfile,time,unittest,contextlib
from verify_submission_test import metadata_fixture
from pathlib import Path
spec=importlib.util.spec_from_file_location('ledger',Path(__file__).with_name('attachment_ledger.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class LedgerTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name);self.db=self.base/'meta.sqlite';self.id='11111111-1111-4111-8111-111111111111';self.event='evt_fixture_12345678';self.now=1000
  with contextlib.closing(sqlite3.connect(self.db)) as db,db:
   db.executescript('CREATE TABLE images(id,mime,expires,idem,event,digest,owner);CREATE TABLE tokens(owner,scope,expires);')
   db.execute('INSERT INTO images VALUES(?,?,?,?,?,?,?)',(self.id,'image/png',2000000,'user_submission_123',self.event,'fixture-sha','owner'));db.execute('INSERT INTO tokens VALUES(?,?,?)',('owner','read subscribe',2000000))
  self.l=mod.Ledger(self.db,self.base/'map.json',clock=lambda:self.now)
 def tearDown(self):self.tmp.cleanup()
 def test_exclusive_claim_and_expired_create_hold(self):
  a=self.l.claim(self.id,self.event);self.assertEqual(a['decision'],'prepare');self.assertEqual(self.l.claim(self.id,self.event)['reason'],'worker_active')
  self.l.transition(self.id,'begin-create',{'claim_id':a['claim_id']});self.now+=1000;self.assertEqual(self.l.claim(self.id,self.event)['decision'],'hold')
 def test_reuse_receipt_and_no_duplicate_send(self):
  a=self.l.claim(self.id,self.event);claim={'claim_id':a['claim_id']};self.l.transition(self.id,'begin-create',claim);self.l.transition(self.id,'saved',{**claim,'library_file_id':'libfile_fixture','file_id':'file_fixture','version':0})
  self.assertEqual(self.l.claim(self.id,self.event)['decision'],'reuse');self.l.transition(self.id,'begin-post',{});self.assertEqual(self.l.claim(self.id,self.event)['decision'],'hold')
  self.l.transition(self.id,'accepted',{'send_receipt':'Sentinel_fixture','send_accepted_at':'fixture-time'});self.assertEqual(self.l.claim(self.id,self.event)['reason'],'send_accepted')
 def test_skip_preflight_and_expired_source(self):
  with contextlib.closing(sqlite3.connect(self.db)) as db,db:db.execute('UPDATE images SET idem=?',('preflight_fixture',))
  self.assertEqual(self.l.claim(self.id,self.event)['reason'],'generated_preflight');self.now=3000;self.assertEqual(self.l.claim(self.id,self.event)['reason'],'source_expired_or_missing')
 def test_mismatch_and_fake_commit_rejected(self):
  with self.assertRaises(ValueError):self.l.claim(self.id,'evt_other_12345678')
  self.l.claim(self.id,self.event)
  with self.assertRaises(ValueError):self.l.transition(self.id,'saved',{'library_file_id':'fake'})
 def test_uncertain_outcome_requires_confirmed_native_receipt(self):
  a=self.l.claim(self.id,self.event);claim={'claim_id':a['claim_id']};self.l.transition(self.id,'begin-create',claim);self.l.transition(self.id,'uncertain',{})
  receipt={**claim,'library_file_id':'libfile_fixture','file_id':'file_fixture','version':0}
  with self.assertRaises(ValueError):self.l.transition(self.id,'saved',receipt)
  self.l.transition(self.id,'saved',{**receipt,'outcome_verified':True});self.l.transition(self.id,'begin-post',{});self.l.transition(self.id,'uncertain',{})
  sent={'send_receipt':'Sentinel_fixture','send_accepted_at':'fixture-time'}
  with self.assertRaises(ValueError):self.l.transition(self.id,'accepted',sent)
  self.l.transition(self.id,'accepted',{**sent,'outcome_verified':True});self.assertEqual(self.l.claim(self.id,self.event)['reason'],'send_accepted')
 def test_saved_library_copy_can_post_after_source_expiry_without_rereading(self):
  a=self.l.claim(self.id,self.event);claim={'claim_id':a['claim_id']};self.l.transition(self.id,'begin-create',claim);self.l.transition(self.id,'saved',{**claim,'library_file_id':'libfile_fixture','file_id':'file_fixture','version':0});self.now=3000
  self.assertEqual(self.l.claim(self.id,self.event)['decision'],'reuse');self.assertEqual(self.l.transition(self.id,'begin-post',{})['state'],'posting')
 def caption_claim(self):
  with contextlib.closing(sqlite3.connect(self.db)) as db,db:
   db.execute('ALTER TABLE images ADD COLUMN caption BLOB');db.execute('UPDATE images SET digest=?,caption=?',('f'*64,b'opaque-ciphertext-never-read'))
  return self.l.claim(self.id,self.event),metadata_fixture()
 def caption_saved(self):
  claim,metadata=self.caption_claim();payload={'claim_id':claim['claim_id'],'metadata':metadata}
  self.l.transition(self.id,'bind-submission',payload)
  self.l.transition(self.id,'begin-create',{'claim_id':claim['claim_id']})
  self.l.transition(self.id,'saved',{'claim_id':claim['claim_id'],'library_file_id':'libfile_fixture','file_id':'file_fixture','version':0})
  return claim,metadata
 def test_caption_bind_requires_authorized_active_claim_and_never_persists_text(self):
  claim,metadata=self.caption_claim()
  with self.assertRaises(ValueError):self.l.transition(self.id,'begin-create',{'claim_id':claim['claim_id']})
  with self.assertRaises(ValueError):self.l.transition(self.id,'bind-submission',{'claim_id':'wrong','metadata':metadata})
  saved=self.l.transition(self.id,'bind-submission',{'claim_id':claim['claim_id'],'metadata':metadata})
  self.assertEqual(saved['caption_sha256'],metadata['caption_sha256']);self.assertFalse(saved['question_response_included'])
  self.assertNotIn('caption',saved);self.assertNotIn(metadata['caption'],self.l.path.read_text())
  self.now=3000
  with self.assertRaises(ValueError):self.l.transition(self.id,'bind-submission',{'claim_id':claim['claim_id'],'metadata':metadata})
 def test_caption_combined_send_and_contradictory_accepted_receipt_rejected(self):
  claim,metadata=self.caption_saved();digests={k:metadata[k] for k in ('caption_sha256','submission_sha256')}
  with self.assertRaises(ValueError):self.l.transition(self.id,'begin-post',{})
  self.l.transition(self.id,'begin-post',{**digests,'caption_context_verified':True})
  receipt={'send_receipt':'native_combined_fixture','send_accepted_at':'fixture-time',**digests}
  with self.assertRaises(ValueError):self.l.transition(self.id,'accepted',receipt)
  accepted=self.l.transition(self.id,'accepted',{**receipt,'question_response_included':True})
  self.assertTrue(accepted['question_response_included']);self.assertEqual(self.l.claim(self.id,self.event)['decision'],'skip')
  with self.assertRaises(ValueError):self.l.transition(self.id,'accepted',{**receipt,'question_response_included':True,'caption_sha256':'0'*64})
 def test_saved_caption_context_restore_requires_previously_bound_same_metadata(self):
  claim,metadata=self.caption_saved();self.now=3000
  self.assertEqual(self.l.transition(self.id,'bind-submission',{'metadata':metadata})['caption_sha256'],metadata['caption_sha256'])
  with self.assertRaises(ValueError):self.l.transition(self.id,'bind-submission',{'metadata':metadata_fixture('不同问题')})
  with self.assertRaises(ValueError):self.l.claim(self.id,'evt_other_12345678')
 def test_saved_legacy_image_cannot_first_bind_a_new_question(self):
  a=self.l.claim(self.id,self.event);claim={'claim_id':a['claim_id']}
  self.l.transition(self.id,'begin-create',claim);self.l.transition(self.id,'saved',{**claim,'library_file_id':'libfile_fixture','file_id':'file_fixture','version':0})
  # Legacy record has a fixture image digest; use a matching well-formed one
  # to show refusal is based on first-bind state, not malformed metadata.
  with self.l.transaction() as data:data['items'][0]['source_sha256']='f'*64
  with self.assertRaises(ValueError):self.l.transition(self.id,'bind-submission',{'metadata':metadata_fixture()})
 def test_terminal_legacy_without_event_is_skip_only_and_nonterminal_holds(self):
  self.l.claim(self.id,self.event)
  for state in ('send_accepted','user_visible','library_deleted'):
   with self.l.transaction() as data:
    data['items'][0].update(state=state,library_file_id='libfile_legacy');data['items'][0].pop('event_id',None)
   self.assertEqual(self.l.claim(self.id,self.event)['decision'],'skip')
  with self.l.transaction() as data:data['items'][0]['state']='library_saved'
  self.assertEqual(self.l.claim(self.id,self.event)['reason'],'legacy_event_missing')
  with self.assertRaises(ValueError):self.l.transition(self.id,'begin-post',{})
  with self.l.transaction() as data:data['items'][0].update(state='send_accepted',event_id='evt_other_12345678')
  with self.assertRaises(ValueError):self.l.claim(self.id,self.event)
if __name__=='__main__':unittest.main()
