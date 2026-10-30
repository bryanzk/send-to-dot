"""Blank signed Chinese candidate, graph and dataflow checks, not phone execution."""
from pathlib import Path
import unittest,json,plistlib,re,hashlib
P=Path(__file__).parent;W=json.loads((P/'Send-to-dot-v5-zh-CN.actions.json').read_text());E=json.loads((P/'Send-to-dot-v5.actions.json').read_text());A=W['WFWorkflowActions']
def refs(x):
 if isinstance(x,dict):
  if x.get('Type')=='ActionOutput':yield x['OutputUUID']
  for v in x.values():yield from refs(v)
 elif isinstance(x,list):
  for v in x:yield from refs(v)
def normalized(x):
 if isinstance(x,dict):return {k:normalized(v) for k,v in x.items() if k!='OutputName'}
 if isinstance(x,list):return [normalized(v)for v in x]
 return x
class Chinese(unittest.TestCase):
 def test_signed_blank_template(self):
  self.assertEqual((P/'Send-to-dot-v5-zh-CN.shortcut').read_bytes()[:4],b'AEA1');self.assertEqual(plistlib.loads((P/'Send-to-dot-v5-zh-CN.unsigned.shortcut').read_bytes()),W)
  self.assertEqual(len(W['WFWorkflowImportQuestions']),2)
  for q in W['WFWorkflowImportQuestions']:self.assertEqual(q['DefaultValue'],'');self.assertEqual(A[q['ActionIndex']]['WFWorkflowActionParameters']['WFTextActionText'],'')
 def test_raw_upload_and_saved_code_request_unchanged(self):
  e=next(a for a in E['WFWorkflowActions']if a['WFWorkflowActionParameters']['CustomOutputName']=='Upload original file');c=next(a for a in A if a['WFWorkflowActionParameters']['CustomOutputName']=='Upload original file');self.assertEqual(normalized(c),normalized(e))
  asks=[a for a in A if a['WFWorkflowActionIdentifier'].endswith('.ask')];self.assertEqual(len(asks),1);self.assertEqual(asks[0]['WFWorkflowActionParameters']['CustomOutputName'],'Manual question input')
 def test_two_no_network_renders_reuse_saved_inactive_fixture(self):
  code=next(a['WFWorkflowActionParameters']for a in A if a['WFWorkflowActionParameters']['CustomOutputName']=='手机连接码')
  fixture='TEST-ONLY-NOT-AN-ACTIVE-GRANT-0123456789';saved={code['UUID']:fixture}
  upload=next(a['WFWorkflowActionParameters']for a in A if a['WFWorkflowActionParameters']['CustomOutputName']=='Upload original file')
  auth=next(x['WFValue']for x in upload['WFHTTPHeaders']['Value']['WFDictionaryFieldValueItems']if x['WFKey']['Value']['string']=='Authorization')
  v=auth['Value'];slot=next(iter(v['attachmentsByRange'].values()));self.assertEqual(slot['OutputUUID'],code['UUID'])
  rendered=[v['string'].replace('\ufffc',saved[slot['OutputUUID']])for _ in range(2)]
  self.assertEqual(rendered,['Bearer '+fixture]*2)
 def test_graph_and_text_attachment_ranges(self):
  seen=set()
  def walk(x):
   if isinstance(x,dict):
    if x.get('WFSerializationType')=='WFTextTokenString':
     val=x['Value'];units=val['string'].encode('utf-16-le')
     for k in val.get('attachmentsByRange',{}):
      i=int(re.fullmatch(r'\{(\d+), 1\}',k)[1]);self.assertEqual(units[2*i:2*i+2],b'\xfc\xff')
    for v in x.values():walk(v)
   elif isinstance(x,list):
    for v in x:walk(v)
  for a in A:p=a['WFWorkflowActionParameters'];self.assertTrue(set(refs(p))<=seen);seen.add(p['UUID'])
  walk(W)
 def test_chinese_results_and_privacy(self):
  strings=[]
  for a in A:
   p=a['WFWorkflowActionParameters']
   if a['WFWorkflowActionIdentifier'].endswith('.showresult'):strings.append(p['Text']['Value']['string'])
  self.assertIn('图片已提交。请回到原 dot 对话等待图片和回复。',strings)
  self.assertTrue(any('还不能确定' in x for x in strings));self.assertFalse(any('已送达' in x or '图片已收到' in x for x in strings))
  q=W['WFWorkflowImportQuestions'][1]['Text']
  for phrase in ['能编辑','iCloud','导出或分享','只能发图','不能读图','30 天','保存不会延长']:self.assertIn(phrase,q)
 def test_visible_labels_are_plain(self):
  for q in W['WFWorkflowImportQuestions']:self.assertNotRegex(q['Text'],r'OAuth|MCP|token|UTF-8|Keychain|HTTP [0-9]')
if __name__=='__main__':unittest.main()
