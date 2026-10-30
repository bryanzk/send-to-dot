"""Synthetic scoring fixtures, never evidence of actual phone or dot performance."""
import unittest
from scripts.verify_latency import evaluate
class Score(unittest.TestCase):
 def data(self,t):return {'source':'single_continuous_recording','recording_sha256':'a'*64,'marker':'STDOT-TEST123456','conversation_id':'test-original-dot','visible_conversation_id':'test-original-dot','phone_start':{'kind':'phone_tap_send','ui_reviewed':True,'marker':'STDOT-TEST123456','frame_index':0},'dot_visible':{'kind':'original_image_pixels_visible','ui_reviewed':True,'marker':'STDOT-TEST123456','frame_index':1}}
 def test_hard_boundary(self):
  self.assertTrue(evaluate(self.data(0),[0,30],'a'*64)['pass']);self.assertFalse(evaluate(self.data(0),[0,30.001],'a'*64)['pass'])
 def test_api_acceptance_never_counts_as_visibility(self):
  d=self.data(0);d['dot_visible']['kind']='message_accepted';self.assertEqual(evaluate(d,[0,1],'a'*64)['verdict'],'INVALID_EVIDENCE')
 def test_phone_start_cannot_be_server_receipt(self):
  d=self.data(0);d['phone_start']['kind']='upload_accepted';self.assertFalse(evaluate(d,[0,1],'a'*64)['pass'])
 def test_marker_recording_and_conversation_must_match(self):
  for field,value in [('recording_sha256','b'*64),('visible_conversation_id','wrong-dot')]:
   d=self.data(0);d[field]=value;self.assertFalse(evaluate(d,[0,1],'a'*64)['pass'])
  d=self.data(0);d['dot_visible']['marker']='STDOT-DIFFERENT';self.assertFalse(evaluate(d,[0,1],'a'*64)['pass'])
 def test_timeout_is_failure_not_a_successful_submission(self):
  d=self.data(0);d.pop('dot_visible');d['deadline']={'kind':'image_absent_through_deadline','ui_reviewed':True,'continuous_review':True,'frame_index':1};self.assertEqual(evaluate(d,[0,30],'a'*64)['verdict'],'FAIL');self.assertEqual(evaluate(d,[0,29.9],'a'*64)['verdict'],'INVALID_EVIDENCE')
 def test_missing_ui_review_or_negative_duration_fails(self):
  d=self.data(0);d['phone_start']['ui_reviewed']=False;self.assertFalse(evaluate(d,[0,1],'a'*64)['pass']);self.assertFalse(evaluate(self.data(0),[2,1],'a'*64)['pass'])
if __name__=='__main__':unittest.main()
