"""Produce a blank Chinese v5 from the reviewed English candidate; no user config."""
from pathlib import Path
import json,plistlib
P=Path(__file__).parent;w=json.loads((P/'Send-to-dot-v5.actions.json').read_text());w['WFWorkflowName']='Send to dot v5 中文'
def token(value,parts):
 old=value['Value']; attachments=list(old.get('attachmentsByRange',{}).values());assert len(parts)==len(attachments)+1
 text='';ranges={}
 for i,part in enumerate(parts):
  text+=part
  if i<len(attachments):ranges['{%d, 1}'%(len(text.encode('utf-16-le'))//2)]=attachments[i];text+='\ufffc'
 value['Value']={'string':text,**({'attachmentsByRange':ranges}if ranges else {})}
messages={
'message-3':'请只选一张 JPG 或 PNG 照片。这次没有发出。',
'message-7':'请打开相册或“文件”，选一张照片，点分享，再选择 Send to dot。这次没有发出。',
'message-14':'请选一张 JPG 或 PNG 照片。其他文件和视频暂时不能发送。这次没有发出。',
'message-34':'这次没有发出。请把问题缩短到 500 个字以内，表情也计入。',
'message-59':'这次没有发出。收图地址还没填，或填写有误。请重新添加空白的 Send to dot v5，填入设置时得到的收图地址，只填到网站名称，不要再加其他内容。',
'message-66':'这次没有发出。手机连接码还没填，或填写有误。请重新添加空白的 Send to dot v5，填入设置时得到的手机连接码，不要填账号密码或其他码。',
'message-73':'还不能确定图片是否已提交。请先到原 dot 对话查看，不要连续重复发送。如果连接码已过期或被停用，请向帮你设置的人取得新的手机连接码。再次保存旧码不会延长使用时间。出现报错或快捷指令停住，都不代表图片已经提交。',
'Receipt explanation':'图片已提交。请回到原 dot 对话等待图片和回复。'
}
for a in w['WFWorkflowActions']:
 p=a['WFWorkflowActionParameters'];name=p['CustomOutputName']
 if name in messages:token(p['Text'],[messages[name]])
 if name=='Privacy note':p['WFCommentActionText']='请保管好设置完成的快捷指令。能编辑它的人可以看到手机连接码；iCloud 可能把它同步到你的其他设备。导出或分享这个快捷指令也会带上连接码，请不要分享填好后的副本。不要填写账号密码。这个码只能发图，不能读取以前收到的图片。使用期限以设置时允许的时间为准，保存不会续期。原图会保持原样发送，也可能带有拍摄时间、地点等信息。只有你自己填写的问题才会作为请求。收图处会在一小时后删除图片和问题；已放进 dot 对话的图片需在对话里另行删除。这个空白文件不含私人地址或连接码。'
 if name=='Optional question':p['WFMenuPrompt']='你想问这张图什么？';p['WFMenuItems']=['只发图片','加一句问题']
 if p.get('WFMenuItemTitle')=='Just the photo':p['WFMenuItemTitle']='只发图片'
 if p.get('WFMenuItemTitle')=='Add a question':p['WFMenuItemTitle']='加一句问题'
 if name=='Manual question input':p['WFAskActionPrompt']='想问什么？最多 500 个字。不要填写密码或私人连接码。点“取消”就不会发送。'
 if name=='Destination confirmation':
  p['WFAlertActionTitle']='发送这张图片吗？'
  token(p['WFAlertActionMessage'],['收图地址：','\n你的问题：','\n原图会保持原样发送，也可能带有拍摄时间、地点等信息。过大或特别清晰的图片可能无法接收。提交后，请到原 dot 对话等待图片和回复。点“取消”就不会发送。'])
 if name=='Approved HTTPS origin':p['CustomOutputName']='收图地址'
 if name=='Saved upload-only code':p['CustomOutputName']='手机连接码'
# Reference display names are cosmetic; exact UUID and request dataflow remain unchanged.
def names(x):
 if isinstance(x,dict):
  if x.get('Type')=='ActionOutput':x['OutputName']={'Approved HTTPS origin':'收图地址','Saved upload-only code':'手机连接码'}.get(x.get('OutputName'),x.get('OutputName'))
  for v in x.values():names(v)
 elif isinstance(x,list):
  for v in x:names(v)
names(w)
w['WFWorkflowImportQuestions'][0]['Text']='填入设置时得到的收图地址，例如 https://inbox.example.com。只填到网站名称，不要在后面加斜线或其他内容。这里不要填密码或连接码。'
w['WFWorkflowImportQuestions'][1]['Text']='只填手机连接码。能编辑快捷指令的人可以看到它，它在这里没有单独的密码保护。iCloud 可能把它同步到其他设备；导出或分享这个快捷指令也会带上连接码，所以请不要分享填好后的副本。这个码只能发图，不能读图。只有设置时已允许 30 天，才能用 30 天；保存不会延长时间。不想保存可以留空，但填好前不能发送。'
(P/'Send-to-dot-v5-zh-CN.actions.json').write_text(json.dumps(w,ensure_ascii=False,indent=2)+'\n')
(P/'Send-to-dot-v5-zh-CN.unsigned.shortcut').write_bytes(plistlib.dumps(w,fmt=plistlib.FMT_BINARY,sort_keys=False))
print('Built blank Chinese v5; no real address or code')
