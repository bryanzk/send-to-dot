"""Graph assertions for the signed v2 source. Not an Apple runtime or HTTP test."""
import json,unittest
from pathlib import Path
W=json.loads((Path(__file__).parent/'Send-to-dot-v2.actions.json').read_text());A=W['WFWorkflowActions']
def named(name):return next((i,a['WFWorkflowActionParameters']) for i,a in enumerate(A) if a['WFWorkflowActionParameters'].get('CustomOutputName')==name)
class ReceiptFlow(unittest.TestCase):
 def test_receipt_is_from_actual_http_output(self):
  http,p=named('Upload original file');read,q=named('Server receipt file ID')
  self.assertEqual(read,http+1);self.assertEqual(q['WFInput']['Value']['OutputUUID'],p['UUID']);self.assertEqual(q['WFDictionaryKey'],'file_id');self.assertEqual(q['WFGetDictionaryValueType'],'Value')
 def test_missing_receipt_has_failure_and_exit_before_success(self):
  read,q=named('Server receipt file ID');start,p=named('No receipt');end,e=named('No receipt-end');success,s=named('Receipt explanation')
  self.assertEqual(p['WFCondition'],101);self.assertEqual(p['WFInput']['Variable']['Value']['OutputUUID'],q['UUID']);self.assertEqual(p['WFControlFlowMode'],0);self.assertEqual(e['WFControlFlowMode'],2);self.assertEqual(p['GroupingIdentifier'],e['GroupingIdentifier'])
  body=A[start+1:end];self.assertEqual([a['WFWorkflowActionIdentifier'] for a in body],['is.workflow.actions.showresult','is.workflow.actions.exit']);self.assertTrue(body[0]['WFWorkflowActionParameters']['Text']['Value']['string'].startswith('No confirmed server receipt.'));self.assertEqual(success,end+1)
 def test_success_is_only_final_action(self):
  i,p=named('Receipt explanation');self.assertEqual(i,len(A)-1);self.assertTrue(p['Text']['Value']['string'].startswith('Server received the image.'));self.assertEqual(sum('Server received the image.' in json.dumps(a) for a in A),1)
 def test_current_validation_limit_is_explicit(self):
  # Audit finding: current acceptance gates presence, not a typed/verified receipt.
  read,_=named('Server receipt file ID');remaining=A[read:]
  self.assertFalse(any(a['WFWorkflowActionIdentifier'].endswith('.text.match') for a in remaining))
if __name__=='__main__':unittest.main()
