from pathlib import Path
import unittest,json,plistlib
P=Path(__file__).parent
class PublicShortcut(unittest.TestCase):
 def test_public_name_and_no_behavior_change(self):
  public=json.loads((P/'Send-to-dot.actions.json').read_text());old=json.loads((P/'Send-to-dot-v5-zh-CN.actions.json').read_text());self.assertEqual(public['WFWorkflowName'],'Send to dot');public.pop('WFWorkflowName');old.pop('WFWorkflowName');self.assertEqual(public,old)
 def test_signed_file_and_exact_signing_input(self):
  source=json.loads((P/'Send-to-dot.actions.json').read_text());self.assertEqual(plistlib.loads((P/'Send-to-dot.unsigned.shortcut').read_bytes()),source);self.assertEqual((P/'Send-to-dot.shortcut').read_bytes()[:4],b'AEA1')
 def test_setup_fields_blank_not_personal_copy(self):
  w=json.loads((P/'Send-to-dot.actions.json').read_text());self.assertEqual(len(w['WFWorkflowImportQuestions']),2)
  for q in w['WFWorkflowImportQuestions']:self.assertEqual(q['DefaultValue'],'');self.assertEqual(w['WFWorkflowActions'][q['ActionIndex']]['WFWorkflowActionParameters']['WFTextActionText'],'')
if __name__=='__main__':unittest.main()
