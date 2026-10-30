"""Static contract checks; this is not an iPhone runtime test."""
from pathlib import Path
import json, plistlib, re, unittest
P=Path(__file__).resolve().parent
class Contract(unittest.TestCase):
 def setUp(self):
  self.w=plistlib.loads((P/'Send-to-dot-v2.unsigned.shortcut').read_bytes()); self.a=self.w['WFWorkflowActions']
 def test_sources_agree(self):
  self.assertEqual(self.w,json.loads((P/'Send-to-dot-v2.actions.json').read_text()))
 def test_share_sheet(self):
  self.assertEqual(self.w['WFWorkflowTypes'],['ActionExtension']); self.assertEqual(self.w['WFWorkflowInputContentItemClasses'],['WFImageContentItem','WFGenericFileContentItem'])
 def test_file_body_and_headers(self):
  req=[a['WFWorkflowActionParameters'] for a in self.a if a['WFWorkflowActionIdentifier'].endswith('.downloadurl')]
  self.assertEqual(len(req),1); q=req[0]; self.assertEqual(q['WFHTTPMethod'],'POST'); self.assertEqual(q['WFHTTPBodyType'],'File')
  self.assertEqual(q['WFRequestVariable']['Value']['Type'],'ActionOutput')
  headers=q['WFHTTPHeaders']['Value']['WFDictionaryFieldValueItems']; self.assertEqual({x['WFKey']['Value']['string'] for x in headers},{'Authorization','Origin','Content-Type','X-Share-ID'})
 def test_no_conversion_or_secret_persistence(self):
  forbidden=['clipboard','base64','convertimage','resizeimage','runjavascript','runscript','shell','savefile','setvariable']
  for a in self.a:
   self.assertFalse(any(x in a['WFWorkflowActionIdentifier'] for x in forbidden),a)
  asks=[a for a in self.a if a['WFWorkflowActionIdentifier'].endswith('.ask')]; self.assertEqual(len(asks),1)
  self.assertTrue(all('WFAskActionDefaultAnswer' not in a['WFWorkflowActionParameters'] for a in asks))
 def test_single_file_and_stable_retry_id(self):
  kinds=[a['WFWorkflowActionIdentifier'] for a in self.a]; self.assertEqual(kinds.count('is.workflow.actions.count'),1); self.assertEqual(kinds.count('is.workflow.actions.hash'),1)
  h=next(a['WFWorkflowActionParameters'] for a in self.a if a['WFWorkflowActionIdentifier'].endswith('.hash')); self.assertEqual(h['WFHashType'],'SHA256')
  self.assertIn('ios_',json.dumps(self.w)); self.assertIn('(?i)^(png|jpe?g)$',json.dumps(self.w))
 def test_no_personal_payload(self):
  data=(P/'Send-to-dot-v2.actions.json').read_bytes()+ (P/'Send-to-dot-v2.shortcut').read_bytes()
  for marker in [b'/' + b'Users' + b'/',b'@icloud.com',b'@gmail.com',b'trycloudflare.com',b'tunnel_',b'plugin_asdk_',b'sk-proj-']:
   self.assertNotIn(marker,data)
  text=(P/'Send-to-dot-v2.actions.json').read_text(); urls=set(re.findall(r'https://[^\s"<>]+',text)); self.assertEqual(urls,{'https://inbox.example.com),','https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::443)?$'})
 def test_origin_setup_is_nonsecret_only(self):
  questions=self.w['WFWorkflowImportQuestions']; self.assertEqual(len(questions),1); q=questions[0]; self.assertEqual(q['ParameterKey'],'WFTextActionText'); self.assertEqual(q['DefaultValue'],'')
  target=self.a[q['ActionIndex']]; self.assertEqual(target['WFWorkflowActionIdentifier'],'is.workflow.actions.gettext'); self.assertEqual(target['WFWorkflowActionParameters']['WFTextActionText'],'')
 def test_signature_container(self):
  self.assertTrue((P/'Send-to-dot-v2.shortcut').read_bytes().startswith(b'AEA1'))
if __name__=='__main__':unittest.main()
