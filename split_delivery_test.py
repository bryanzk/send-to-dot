"""Isolated native-receipt simulations: no Library/chat calls or real user photos."""
import contextlib,copy,json,sqlite3,tempfile,unittest,threading,time,importlib.util,io,hashlib,uuid,shutil,os
from pathlib import Path
from attachment_ledger import Ledger
from split_delivery import SplitDelivery
from scripts.verify_submission import hashes
FILE='11111111-1111-4111-8111-111111111111';EVENT='evt_fixture_split_12345678'
class SplitTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name).resolve();self.db=self.root/'state/source.sqlite';self.db.parent.mkdir(mode=0o700);self.now=1000;self.sha='f'*64
  with contextlib.closing(sqlite3.connect(self.db))as d,d:
   d.executescript('CREATE TABLE images(id,mime,expires,idem,event,digest,owner,caption);CREATE TABLE tokens(hash,owner,scope,expires);')
   d.execute('INSERT INTO images VALUES(?,?,?,?,?,?,?,?)',(FILE,'image/png',2000000,'q_user_split_fixture',EVENT,self.sha,'owner',b'encrypted-fixture-only'))
   d.execute('INSERT INTO tokens VALUES(?,?,?,?)',('a'*64,'owner','read subscribe',2000000))
  self.ledger=Ledger(self.db,self.root/'map.json',clock=lambda:self.now);self.flow=SplitDelivery(self.ledger);self.meta=self.metadata();self.library={'library_file_id':'libfile_fake_fixture','file_id':'file_fake_fixture','version':0}
 def tearDown(self):self.tmp.cleanup()
 def metadata(self):
  c='明确的测试问题';a,b=hashes(self.sha,c)
  return {'type':'send-to-dot.submission','version':1,'file_id':FILE,'eventId':EVENT,'image_sha256':self.sha,'caption':c,'caption_sha256':a,'submission_sha256':b,'caption_source':'paired_manual_entry_assertion','provenance':{'authenticated_upload':True,'client_entry_claim':'manual-entry','manual_entry_independently_verified':False},'instruction_scope':'image_question_only'}
 def start_prepare(self,meta=True):
  a=self.flow.start(FILE,EVENT);self.claim=a['claim_id'];return self.flow.prepare(FILE,EVENT,self.claim,{'staging_ref':'stage_test_fixture_123456','mime':'image/png','sha256':self.sha,'byte_length':100,'width':2,'height':2},self.meta if meta is True else meta)
 def saved(self):return self.flow.saved_and_reserve_image(FILE,EVENT,self.claim,self.library)
 def image(self):return self.flow.image_accepted(FILE,EVENT,{'message_id':'FAKE_IMAGE_MESSAGE','accepted_at':'2026-10-30T19:00:00Z'})
 def answer(self):return self.flow.answer_accepted(FILE,EVENT,{'message_id':'FAKE_ANSWER_MESSAGE','accepted_at':'2026-10-30T19:00:01Z'},caption_sha256=self.meta['caption_sha256'],submission_sha256=self.meta['submission_sha256'],question_response_included=True)
 def test_image_then_answer_independent_and_final_replay_skip(self):
  self.start_prepare();self.assertEqual(self.saved()['decision'],'send_image_once');self.image();r=self.flow.start(FILE,EVENT);self.assertEqual(r['decision'],'answer_pending');self.assertEqual(self.flow.reserve_answer(FILE,EVENT,self.meta)['decision'],'send_answer_once');self.answer();self.assertEqual(self.flow.start(FILE,EVENT)['decision'],'skip');self.assertEqual(self.ledger.claim(FILE,EVENT)['decision'],'skip')
 def test_legacy_accepted_skips_without_fabricating_event(self):
  self.ledger.path.write_text(json.dumps({'items':[{'source_file_id':FILE,'state':'send_accepted','send_receipt':'fake_legacy'}]}));self.assertEqual(self.flow.start(FILE,EVENT)['decision'],'skip')
 def test_existing_legacy_inflight_is_held(self):
  self.ledger.claim(FILE,EVENT);self.assertEqual(self.flow.start(FILE,EVENT)['reason'],'existing_legacy_operation')
 def test_legacy_worker_cannot_reclaim_split_record(self):
  self.start_prepare();self.now+=1000;self.assertEqual(self.ledger.claim(FILE,EVENT)['reason'],'split_delivery_requires_split_planner')
 def test_bad_caption_pauses_answer_but_preserves_verified_image(self):
  m=copy.deepcopy(self.meta);m['provenance']['authenticated_upload']=False
  self.assertEqual(self.start_prepare(m)['answer_state'],'paused_unverified');self.saved();self.image();
  with self.assertRaises(ValueError):self.flow.reserve_answer(FILE,EVENT,m)
  self.assertEqual(self.flow.reserve_answer(FILE,EVENT,self.meta)['decision'],'send_answer_once')
 def test_wrong_image_cannot_create(self):
  a=self.flow.start(FILE,EVENT)
  with self.assertRaises(ValueError):self.flow.prepare(FILE,EVENT,a['claim_id'],{'staging_ref':'stage_test_fixture_1234','mime':'image/png','sha256':'a'*64,'byte_length':100,'width':2,'height':2},self.meta)
 def test_concurrent_save_and_reserve_is_one_winner(self):
  self.start_prepare();results=[]
  def worker():
   try:results.append(self.saved()['decision'])
   except ValueError:results.append('held')
  ts=[threading.Thread(target=worker)for _ in range(2)]
  for t in ts:t.start()
  for t in ts:t.join()
  self.assertCountEqual(results,['send_image_once','held'])
 def test_no_answer_before_actual_image_receipt(self):
  self.start_prepare();self.saved()
  with self.assertRaises(ValueError):self.flow.reserve_answer(FILE,EVENT,self.meta)
 def test_image_receipt_does_not_skip_unfinished_answer(self):
  self.start_prepare();self.saved();self.image();self.assertEqual(self.flow.start(FILE,EVENT)['decision'],'answer_pending')
 def test_image_only_completes_after_image_receipt(self):
  with contextlib.closing(sqlite3.connect(self.db))as d,d:d.execute('UPDATE images SET caption=NULL,idem=?',('user_image_only_fixture',))
  self.start_prepare(None);self.saved();self.image();self.assertEqual(self.flow.start(FILE,EVENT)['decision'],'skip')
 def test_unknown_image_or_answer_outcomes_never_blind_retry(self):
  self.start_prepare();self.saved();self.flow.uncertain(FILE,EVENT,'image');self.now+=10000;self.assertEqual(self.flow.start(FILE,EVENT)['reason'],'posting_uncertain')
  with self.assertRaises(ValueError):self.image()
 def test_unknown_answer_keeps_image_accepted_and_holds_answer(self):
  self.start_prepare();self.saved();self.image();self.flow.reserve_answer(FILE,EVENT,self.meta);self.flow.uncertain(FILE,EVENT,'answer');self.assertEqual(self.flow.start(FILE,EVENT)['answer_state'],'posting_uncertain')
 def test_expired_or_revoked_question_context_holds(self):
  self.start_prepare();self.saved();self.image();self.now=3000;self.assertEqual(self.flow.reserve_answer(FILE,EVENT,self.meta)['reason'],'question_context_unavailable')
 def test_no_caption_or_credentials_in_durable_map(self):
  self.start_prepare();self.saved();self.image();self.flow.reserve_answer(FILE,EVENT,self.meta);self.answer();s=self.ledger.path.read_text();self.assertNotIn(self.meta['caption'],s);self.assertNotIn('access_token',s);self.assertIn('caption_sha256',s)
 def test_conflicting_image_receipt_rejected(self):
  self.start_prepare();self.saved();self.image()
  with self.assertRaises(ValueError):self.flow.image_accepted(FILE,EVENT,{'message_id':'DIFFERENT_FAKE','accepted_at':'2026-10-30T19:00:00Z'})
 def test_missing_existing_ledger_fails_without_creating_new_history(self):
  spec=importlib.util.spec_from_file_location('fast_ledger_selection',Path(__file__).parent/'scripts/attachment-fast.py');fast=importlib.util.module_from_spec(spec);spec.loader.exec_module(fast)
  isolated=self.root/'app';isolated.mkdir()
  with self.assertRaises(FileNotFoundError):fast.select_ledger(isolated,'existing-workspace')
  self.assertFalse((self.root/'.delivery').exists());self.assertFalse((isolated/'state').exists())
  existing=self.root/'.delivery/inbox-images/attachment-map.json';existing.parent.mkdir(parents=True,mode=0o700);existing.write_text('{"items": []}');existing.chmod(0o600)
  self.assertEqual(fast.select_ledger(isolated,'existing-workspace'),existing)
  with self.assertRaises(ValueError):fast.select_ledger(isolated,'instance')
  existing.chmod(0o644)
  with self.assertRaises(ValueError):fast.select_ledger(isolated,'existing-workspace')
 def test_compact_read_receipt_stages_exact_original_and_prepares_once(self):
  from PIL import Image
  out=io.BytesIO();Image.new('RGB',(4,3),(30,80,120)).save(out,format='PNG');body=out.getvalue();self.sha=hashlib.sha256(body).hexdigest();self.meta=self.metadata()
  with contextlib.closing(sqlite3.connect(self.db))as d,d:d.execute('UPDATE images SET digest=?',(self.sha,))
  a=self.flow.start(FILE,EVENT);cache=self.root/'state/read-cache';cache.mkdir(mode=0o700);rid='read_'+str(uuid.uuid4());now_ms=int(time.time()*1000)
  # Real consume helper checks real wall clock; use same wall clock for this fixture.
  self.now=time.time()
  with contextlib.closing(sqlite3.connect(self.db))as d,d:d.execute('UPDATE images SET expires=?',(now_ms+3600000,));d.execute('UPDATE tokens SET expires=?',(now_ms+3600000,))
  with self.ledger.transaction()as data:data['items'][0]['lease_until']=self.now+300
  manifest={'version':1,'receipt':rid,'file_id':FILE,'event_id':EVENT,'owner':'owner','grant_hash':'a'*64,'sha256':self.sha,'mime':'image/png','byte_length':len(body),'created_at':now_ms,'expires_at':now_ms+300000}
  for name,b in [(rid+'.json',json.dumps(manifest).encode()),(rid+'.bin',body)]:p=cache/name;p.write_bytes(b);p.chmod(0o600)
  (self.root/'scripts').mkdir();shutil.copyfile(Path(__file__).parent/'scripts/consume_read_cache.py',self.root/'scripts/consume_read_cache.py')
  spec=importlib.util.spec_from_file_location('attachment_fast_test',Path(__file__).parent/'scripts/attachment-fast.py');fast=importlib.util.module_from_spec(spec);spec.loader.exec_module(fast)
  desc={'type':'send-to-dot.attachment-source','version':1,'file_id':FILE,'eventId':EVENT,'original_sha256':self.sha,'original_bytes':len(body),'original_mime':'image/png','expires_at':now_ms+3600000,'read_receipt_max_ttl_ms':300000,'read_receipt':rid,'submission':self.meta}
  result=fast.stage_native(self.flow,FILE,EVENT,a['claim_id'],[{'type':'text','text':json.dumps(desc)}],root=self.root)
  self.assertEqual(result['decision'],'save_original_once');self.assertEqual(Path(result['staged_path']).read_bytes(),body);self.assertEqual(result['width'],4);self.assertNotIn(self.meta['caption'],json.dumps(result));self.assertEqual(self.ledger.path.stat().st_mode&0o777,0o600)
if __name__=='__main__':unittest.main()
