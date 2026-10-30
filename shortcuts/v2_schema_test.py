"""Compare v2 wiring against an independently sourced action schema fixture.
This does not execute Apple's Shortcuts runtime.
"""
import json,plistlib,re,unittest
from pathlib import Path
P=Path(__file__).parent
W=json.loads((P/'Send-to-dot-v2.actions.json').read_text());A=W['WFWorkflowActions'];SCHEMA=json.loads((P/'action-schema-fixture.json').read_text())['summaries']
class Schema(unittest.TestCase):
 def test_all_identifiers_are_known(self):
  self.assertTrue(all(SCHEMA.get(a['WFWorkflowActionIdentifier']) is not None for a in A))
 def test_independent_input_keys(self):
  # These input names are extracted from the external dataset, not the builder.
  for ident in ['count','text.match','getitemfromlist','properties.files','hash','previewdocument','getvalueforkey','downloadurl']:
   actionid='is.workflow.actions.'+ident
   variants=[set(x.split(',')) for x in SCHEMA[actionid]]
   for a in A:
    if a['WFWorkflowActionIdentifier']!=actionid:continue
    params=a['WFWorkflowActionParameters']
    self.assertTrue(any(v.issubset(params) for v in variants),(actionid,list(params)))
    accepted=set.union(*variants)
    for inputkey in ['Input','WFInput','text','WFURL']:
     if inputkey in params:self.assertIn(inputkey,accepted,(actionid,inputkey))
 def test_explicit_count_extension_input(self):
  p=next(a['WFWorkflowActionParameters'] for a in A if a['WFWorkflowActionIdentifier'].endswith('.count'))
  self.assertEqual(p['Input'],{'Value':{'Type':'ExtensionInput'},'WFSerializationType':'WFTextTokenAttachment'})
 def test_every_match_has_explicit_source(self):
  matches=[a['WFWorkflowActionParameters'] for a in A if a['WFWorkflowActionIdentifier'].endswith('.text.match')]
  self.assertEqual(len(matches),4)
  self.assertTrue(all(p['text']['WFSerializationType']=='WFTextTokenString' for p in matches))
 def test_url_is_text_input_not_variable_picker(self):
  p=next(a['WFWorkflowActionParameters'] for a in A if a['WFWorkflowActionIdentifier'].endswith('.downloadurl'));self.assertEqual(p['WFURL']['WFSerializationType'],'WFTextTokenString');self.assertEqual(p['WFRequestVariable']['WFSerializationType'],'WFTextTokenAttachment')
 def test_text_token_ranges_and_references(self):
  ids={a['WFWorkflowActionParameters'].get('UUID') for a in A}
  def visit(obj):
   if isinstance(obj,dict):
    if obj.get('WFSerializationType')=='WFTextTokenString':
     value=obj['Value']; string=value['string']; units=string.encode('utf-16-le')
     for key,ref in value.get('attachmentsByRange',{}).items():
      m=re.fullmatch(r'\{(\d+), 1\}',key);self.assertIsNotNone(m);i=int(m[1]);self.assertEqual(units[i*2:i*2+2],b'\xfc\xff')
      if ref.get('Type')=='ActionOutput':self.assertIn(ref['OutputUUID'],ids)
    for value in obj.values():visit(value)
   elif isinstance(obj,list):
    for value in obj:visit(value)
  visit(W)
 def test_source_artifacts_match(self):self.assertEqual(W,plistlib.loads((P/'Send-to-dot-v2.unsigned.shortcut').read_bytes()))
 def test_file_body_original_reference_and_four_headers(self):
  p=next(a['WFWorkflowActionParameters'] for a in A if a['WFWorkflowActionIdentifier'].endswith('.downloadurl'))
  original=next(a['WFWorkflowActionParameters'] for a in A if a['WFWorkflowActionIdentifier'].endswith('.getitemfromlist'))
  self.assertEqual(p['WFRequestVariable']['Value']['OutputUUID'],original['UUID']);self.assertEqual(p['WFHTTPBodyType'],'File');self.assertEqual(p['WFHTTPMethod'],'POST')
  self.assertEqual({x['WFKey']['Value']['string'] for x in p['WFHTTPHeaders']['Value']['WFDictionaryFieldValueItems']},{'Authorization','Origin','Content-Type','X-Share-ID'})
if __name__=='__main__':unittest.main()
