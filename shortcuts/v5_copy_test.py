"""Local unsigned candidate checks; no claim of device import or signing."""
import json,plistlib,re,unittest
from pathlib import Path
P=Path(__file__).parent;W=json.loads((P/'Send-to-dot-v5.actions.json').read_text());A=W['WFWorkflowActions'];OLD=json.loads((P/'Send-to-dot-v4.actions.json').read_text());schema=json.loads((P/'v3-builtin-schema.json').read_text())['actions']
def params(name):return next(a['WFWorkflowActionParameters']for a in A if a['WFWorkflowActionParameters']['CustomOutputName']==name)
def refs(x):
 if isinstance(x,dict):
  if x.get('Type')=='ActionOutput':yield x['OutputUUID']
  for v in x.values():yield from refs(v)
 elif isinstance(x,list):
  for v in x:yield from refs(v)
def visible(x):
 if isinstance(x,dict):
  if x.get('WFSerializationType')=='WFTextTokenString':yield x['Value']['string']
  else:
   for v in x.values():yield from visible(v)
 elif isinstance(x,str):yield x
 elif isinstance(x,list):
  for v in x:yield from visible(v)
class PlainCopy(unittest.TestCase):
 def test_unsigned_matches_json(self):
  self.assertEqual(plistlib.loads((P/'Send-to-dot-v5.unsigned.shortcut').read_bytes()),W);self.assertEqual(W['WFWorkflowName'],'Send to dot v5')
 def test_setup_is_blank_once(self):
  q=W['WFWorkflowImportQuestions'];self.assertEqual(len(q),2)
  for row in q:self.assertEqual(row['DefaultValue'],'');self.assertEqual(A[row['ActionIndex']]['WFWorkflowActionParameters']['WFTextActionText'],'')
  asks=[a['WFWorkflowActionParameters']['CustomOutputName']for a in A if a['WFWorkflowActionIdentifier'].endswith('.ask')];self.assertEqual(asks,['Manual question input'])
 def test_schema_and_reference_order(self):
  seen=set()
  for a in A:
   self.assertIn(a['WFWorkflowActionIdentifier'],schema);p=a['WFWorkflowActionParameters'];self.assertTrue(set(refs(p))<=seen,p['CustomOutputName']);seen.add(p['UUID'])
 def test_raw_file_and_request_contract_not_changed(self):
  old={a['WFWorkflowActionParameters']['CustomOutputName']:a['WFWorkflowActionParameters'] for a in OLD['WFWorkflowActions']}
  for name in ['Upload original file','Original file hash','Image and question hash','Question UTF8 Base64','Upload code format check']:
   self.assertEqual(params(name),old[name],name)
 def test_user_prompts_have_no_protocol_jargon(self):
  values=[]
  for a in A:
   p=a['WFWorkflowActionParameters']
   for k in ['WFAskActionPrompt','WFAlertActionTitle','WFAlertActionMessage','WFMenuPrompt','WFMenuItems','WFCommentActionText']:
    if k in p:values+=list(visible(p[k]))
   if a['WFWorkflowActionIdentifier'].endswith('.showresult'):values+=list(visible(p['Text']))
  values += [q['Text']for q in W['WFWorkflowImportQuestions']]
  for value in values:self.assertNotRegex(value,r'(?i)\b(?:OAuth|MCP|callback|UTF-8|Unicode|Keychain|Base64|HTTP\s*\d|receipt|submission ID|HTTPS origin|token)\b')
 def test_privacy_and_no_false_success(self):
  q=W['WFWorkflowImportQuestions'][1]['Text']
  for phrase in ['Anyone who edits','iCloud','Sharing or exporting','not read','does not extend']:self.assertIn(phrase,q)
  v=json.dumps(A)
  for phrase in ['Nothing was sent','cannot confirm','Your photo was submitted','wait for the photo and reply','when and where']:self.assertIn(phrase,v)
if __name__=='__main__':unittest.main()
