"""Independent schema/contract checks; not an iPhone share-sheet execution."""
import base64,hashlib,json,plistlib,re,unittest
from pathlib import Path
P=Path(__file__).parent;W=json.loads((P/'Send-to-dot-v3.actions.json').read_text());A=W['WFWorkflowActions'];S=json.loads((P/'v3-builtin-schema.json').read_text())['actions']
def p(name):return next(a['WFWorkflowActionParameters'] for a in A if a['WFWorkflowActionParameters'].get('CustomOutputName')==name)
def refs(x):
 if isinstance(x,dict):
  if x.get('Type')=='ActionOutput':yield x['OutputUUID']
  for v in x.values():yield from refs(v)
 elif isinstance(x,list):
  for v in x:yield from refs(v)
def contract(image_sha,question):
 question=re.sub('^[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+|[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+$','',question)
 if len(question)>500 or len(question.encode())>2048:raise ValueError('question limit')
 b64=base64.b64encode(question.encode()).decode()
 return b64,('iosq_'+hashlib.sha256((image_sha+'\n'+b64).encode()).hexdigest()) if question else 'ios_'+image_sha
class V3(unittest.TestCase):
 def test_sources_and_distinct_name(self):
  self.assertEqual(W,plistlib.loads((P/'Send-to-dot-v3.unsigned.shortcut').read_bytes()));self.assertEqual(W['WFWorkflowName'],'Send to dot v3')
 def test_manual_only_source_and_menu(self):
  self.assertEqual(p('Optional question')['WFMenuItems'],['Image only','Add my question'])
  ask=[a for a in A if a['WFWorkflowActionIdentifier'].endswith('.ask')];self.assertEqual({a['WFWorkflowActionParameters']['CustomOutputName'] for a in ask},{'Manual question input','Runtime upload-only code'})
  self.assertTrue(all(not any(s in a['WFWorkflowActionIdentifier'] for s in ['extracttext','clipboard','properties.images']) for a in A))
  self.assertEqual(p('No manual question')['WFItems']['Value']['WFDictionaryFieldValueItems'][0]['WFValue']['Value']['string'],'');self.assertEqual(p('Frozen question source')['WFDictionaryKey'],'source');self.assertEqual(list(refs(p('Frozen question source')['WFInput'])),[p('Optional question-end')['UUID']])
 def test_explicit_question_record_prevents_menu_passthrough(self):
  self.assertEqual(p('Raw manual question')['WFDictionaryKey'],'caption');self.assertEqual(list(refs(p('Raw manual question')['WFInput'])),[p('Optional question-end')['UUID']]);self.assertEqual(p('No question Base64')['WFTextActionText'],'')
  for name in ['No manual question','Manual question record']:
   fields=p(name)['WFItems']['Value']['WFDictionaryFieldValueItems'];self.assertEqual({x['WFKey']['Value']['string'] for x in fields},{'caption','source'})
 def test_schema_ids_and_input_text_types(self):
  for a in A:
   k=a['WFWorkflowActionIdentifier'];self.assertIn(k,S)
   params=a['WFWorkflowActionParameters']
   if k.endswith('.text.match'):self.assertEqual(params['text']['WFSerializationType'],'WFTextTokenString');self.assertNotIn('WFInput',params)
   if k.endswith('.count'):self.assertIn('Input',params);self.assertNotIn('WFInput',params)
  self.assertEqual(p('Upload original file')['WFURL']['WFSerializationType'],'WFTextTokenString')
 def test_empty_question_uses_numeric_zero_not_has_value(self):
  for name in ['Encode question','Stable submission ID']:
   q=p(name);self.assertEqual(q['WFCondition'],2);self.assertEqual(q['WFNumberValue'],0);self.assertEqual(list(refs(q['WFInput'])),[p('Question character count')['UUID']])
 def test_normalization_before_length_encoding_identity(self):
  q=p('Frozen manual question');self.assertTrue(q['WFReplaceTextRegularExpression']);self.assertEqual(q['WFReplaceTextReplace'],'');self.assertEqual(q['WFInput']['WFSerializationType'],'WFTextTokenString');self.assertEqual(list(refs(q['WFInput'])),[p('Raw manual question')['UUID']]);self.assertEqual(contract('a'*64,' \t\n\ufeff\u00a0')[1],'ios_'+'a'*64);self.assertEqual(contract('a'*64,' '*501)[1],'ios_'+'a'*64)
  self.assertEqual(list(refs(p('Recorded manual source')['WFTextActionText'])),[p('Frozen question source')['UUID']]);self.assertEqual(p('Empty question source')['WFTextActionText'],'none')
 def test_standard_base64_no_lines_and_manual_provenance(self):
  q=p('Question UTF8 Base64');self.assertEqual(q['WFEncodeMode'],'Encode');self.assertEqual(q['WFBase64LineBreakMode'],'None');self.assertEqual(list(refs(q['WFInput'])),[p('Frozen manual question')['UUID']])
  self.assertIn('None',S['is.workflow.actions.base64encode']['Parameters']['WFBase64LineBreakMode']['Items'])
 def test_caption_bound_stable_id_and_raw_image(self):
  self.assertEqual(list(refs(p('Image and question identity')['WFTextActionText'])),[p('Original file hash')['UUID'],p('Encode question-end')['UUID']]);self.assertEqual(p('Image and question identity')['WFTextActionText']['Value']['string'],'\ufffc\n\ufffc')
  self.assertEqual(p('Image and question hash')['WFHashType'],'SHA256');self.assertEqual(p('Image only submission ID')['WFTextActionText']['Value']['string'],'ios_\ufffc');self.assertEqual(p('Question submission ID')['WFTextActionText']['Value']['string'],'iosq_\ufffc')
  q=p('Upload original file');self.assertEqual(q['WFHTTPBodyType'],'File');self.assertEqual(list(refs(q['WFRequestVariable'])),[p('Original supplied file')['UUID']])
  h={x['WFKey']['Value']['string']:x['WFValue'] for x in q['WFHTTPHeaders']['Value']['WFDictionaryFieldValueItems']};self.assertEqual(set(h),{'Authorization','Origin','Content-Type','X-Share-ID','X-Inbox-Caption','X-Inbox-Caption-Source'});self.assertEqual(list(refs(h['X-Inbox-Caption'])),[p('Encode question-end')['UUID']]);self.assertEqual(list(refs(h['X-Inbox-Caption-Source'])),[p('Upload question source-end')['UUID']])
 def test_no_quicklook_and_confirmation_includes_frozen_question(self):
  self.assertTrue(all(not a['WFWorkflowActionIdentifier'].endswith(('.previewdocument','.quicklook')) for a in A));self.assertIn(p('Frozen manual question')['UUID'],list(refs(p('Destination confirmation')['WFAlertActionMessage'])));self.assertTrue(p('Destination confirmation')['WFAlertActionCancelButtonShown'])
 def test_independent_contract_vectors_and_boundaries(self):
  image='a'*64;self.assertEqual(contract(image,'')[1],'ios_'+image)
  caption='图里有什么？🙂\n请只回答可见内容。';b64,key=contract(image,caption);self.assertEqual(base64.b64decode(b64).decode(),caption);self.assertNotRegex(b64,r'[\r\n]');self.assertEqual(contract(image,caption)[1],key);self.assertNotEqual(contract(image,caption+'?')[1],key);self.assertLess(len(key),100)
  contract(image,'🙂'*500)
  with self.assertRaises(ValueError):contract(image,'x'*501)
  with self.assertRaises(ValueError):contract(image,'🙂'*513)
 def test_text_ranges_and_no_embedded_user_endpoint(self):
  def walk(x):
   if isinstance(x,dict):
    if x.get('WFSerializationType')=='WFTextTokenString':
     v=x['Value'];units=v['string'].encode('utf-16-le')
     for key in v.get('attachmentsByRange',{}):
      m=re.fullmatch(r'\{(\d+), 1\}',key);self.assertIsNotNone(m);i=int(m[1]);self.assertEqual(units[i*2:i*2+2],b'\xfc\xff')
    for v in x.values():walk(v)
   elif isinstance(x,list):
    for v in x:walk(v)
  walk(W);q=W['WFWorkflowImportQuestions'][0];self.assertEqual(A[q['ActionIndex']]['WFWorkflowActionParameters']['WFTextActionText'],'')
if __name__=='__main__':unittest.main()
