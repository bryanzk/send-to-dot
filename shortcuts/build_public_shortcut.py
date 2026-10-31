"""Build blank public-name input; sign locally with Apple's official Shortcuts tool."""
from pathlib import Path
import json,plistlib
root=Path(__file__).parent
workflow=json.loads((root/'Send-to-dot-v5-zh-CN.actions.json').read_text())
workflow['WFWorkflowName']='Send to dot'
for question in workflow['WFWorkflowImportQuestions']:
    assert question['DefaultValue']==''
    assert workflow['WFWorkflowActions'][question['ActionIndex']]['WFWorkflowActionParameters']['WFTextActionText']==''
(root/'Send-to-dot.actions.json').write_text(json.dumps(workflow,ensure_ascii=False,indent=2)+'\n')
(root/'Send-to-dot.unsigned.shortcut').write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_BINARY,sort_keys=False))
