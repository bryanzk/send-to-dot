"""Build a no-secret Apple Shortcuts old-format candidate; use Apple's signer next.
No dependency install, signing credential, personal endpoint or upload code here.
"""
from pathlib import Path
import argparse,json,plistlib,uuid
parser=argparse.ArgumentParser();parser.add_argument('--output-stem',default='Send-to-dot-v5');args=parser.parse_args()
ROOT=Path(__file__).resolve().parent
A=[]
def uid(name):return str(uuid.uuid5(uuid.NAMESPACE_URL,'https://example.invalid/send-to-dot-shortcut/'+name)).upper()
def ref(name):return {'Type':'ActionOutput','OutputUUID':uid(name),'OutputName':name}
def attachment(value):return {'Value':value,'WFSerializationType':'WFTextTokenAttachment'}
def text(*parts):
 s='';ranges={}
 for p in parts:
  if isinstance(p,dict):ranges['{%d, 1}'%len(s)] = p;s+='\ufffc'
  else:s+=p
 return {'Value':{'string':s,**({'attachmentsByRange':ranges} if ranges else {})},'WFSerializationType':'WFTextTokenString'}
def action(name,kind,**params):A.append({'WFWorkflowActionIdentifier':'is.workflow.actions.'+kind,'WFWorkflowActionParameters':{'UUID':uid(name),'CustomOutputName':name,**params}});return ref(name)
def show(message):action('message-'+str(len(A)),'showresult',Text=text(message))
def stop():action('stop-'+str(len(A)),'exit')
def block(name,value,condition,body,number=None,string=None,otherwise=None):
 group=uid('group-'+name);p={'GroupingIdentifier':group,'WFControlFlowMode':0,'WFInput':{'Type':'Variable','Variable':attachment(value)},'WFCondition':condition}
 if number is not None:p['WFNumberValue']=number
 if string is not None:p['WFConditionalActionString']=string
 action(name,'conditional',**p);body()
 if otherwise:action(name+'-else','conditional',GroupingIdentifier=group,WFControlFlowMode=1);otherwise()
 action(name+'-end','conditional',GroupingIdentifier=group,WFControlFlowMode=2)
 return ref(name+'-end')
def reject(message):show(message);stop()
def dictionary(items):return {'Value':{'WFDictionaryFieldValueItems':[{'WFItemType':0,'WFKey':text(k),'WFValue':v if isinstance(v,dict) else text(v)} for k,v in items]},'WFSerializationType':'WFDictionaryFieldValue'}
shortcut_input={'Type':'ExtensionInput'}
action('Privacy note','comment',WFCommentActionText='Keep your configured shortcut private. Anyone who edits it can see your phone connection code. iCloud may copy it to your other devices, and sharing or exporting this shortcut includes it. Do not enter an account password. This code can send photos but cannot read photos already received. It only lasts for the time allowed during setup. The original photo is sent unchanged, including any details about when and where it was taken. Only a question you enter yourself is treated as your request. Photos disappear from the receiving address after one hour; photos already added to your dot conversation stay until you delete them there. This blank copy contains no private address or code.')
count=action('Item count','count',Input=attachment(shortcut_input),WFCountType='Items')
block('Too many',count,2,lambda:reject('Please choose just one JPG or PNG photo. Nothing was sent.'),number=1)
block('No image',count,0,lambda:reject('Open Photos or Files, choose one photo, tap Share, then choose Send to dot. Nothing was sent.'),number=1)
image=action('Original supplied file','getitemfromlist',WFInput=attachment(shortcut_input),WFItemSpecifier='First Item')
extension=action('File extension','properties.files',WFInput=attachment(image),WFContentItemPropertyName='File Extension')
allowed=action('Allowed file extension','text.match',text=text(extension),WFMatchTextPattern='(?i)^(png|jpe?g)$')
block('Unsupported format',allowed,101,lambda:reject('Please choose a JPG or PNG photo. Other kinds of files, including videos, cannot be sent here. Nothing was sent.'))
png=action('PNG check','text.match',text=text(extension),WFMatchTextPattern='(?i)^png$')
mime=block('Choose MIME',png,100,lambda:action('PNG MIME','gettext',WFTextActionText='image/png'),otherwise=lambda:action('JPEG MIME','gettext',WFTextActionText='image/jpeg'))
# Only this explicit manual input may become a question. Never use share-sheet text.
menu_group=uid('group-Optional question')
action('Optional question','choosefrommenu',GroupingIdentifier=menu_group,WFControlFlowMode=0,WFMenuPrompt='Would you like to ask about this photo?',WFMenuItems=['Just the photo','Add a question'])
action('Just the photo branch','choosefrommenu',GroupingIdentifier=menu_group,WFControlFlowMode=1,WFMenuItemTitle='Just the photo')
action('No manual question','dictionary',WFItems=dictionary([('caption',''),('source','none')]))
action('Manual question branch','choosefrommenu',GroupingIdentifier=menu_group,WFControlFlowMode=1,WFMenuItemTitle='Add a question')
manual_question=action('Manual question input','ask',WFAskActionPrompt='What would you like to ask? Keep it under 500 characters. Do not enter passwords or private codes. Tap Cancel to send nothing.',WFInputType='Text')
action('Manual question record','dictionary',WFItems=dictionary([('caption',text(manual_question)),('source','manual-entry')]))
action('Optional question-end','choosefrommenu',GroupingIdentifier=menu_group,WFControlFlowMode=2)
raw_caption=action('Raw manual question','getvalueforkey',WFInput=attachment(ref('Optional question-end')),WFDictionaryKey='caption',WFGetDictionaryValueType='Value')
caption=action('Frozen manual question','text.replace',WFInput=text(raw_caption),WFReplaceTextFind='^[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+|[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+$',WFReplaceTextReplace='',WFReplaceTextRegularExpression=True,WFReplaceTextCaseSensitive=True)
captioncount=action('Question character count','count',Input=attachment(caption),WFCountType='Characters')
block('Question too long',captioncount,2,lambda:reject('Nothing was sent. Please shorten your question to 500 characters or fewer; emoji count too.'),number=500)
caption64=block('Encode question',captioncount,2,lambda:action('Question UTF8 Base64','base64encode',WFInput=attachment(caption),WFEncodeMode='Encode',WFBase64LineBreakMode='None'),otherwise=lambda:action('No question Base64','gettext',WFTextActionText=''),number=0)
record_source=action('Frozen question source','getvalueforkey',WFInput=attachment(ref('Optional question-end')),WFDictionaryKey='source',WFGetDictionaryValueType='Value')
caption_source=block('Upload question source',captioncount,2,lambda:action('Recorded manual source','gettext',WFTextActionText=text(record_source)),otherwise=lambda:action('Empty question source','gettext',WFTextActionText='none'),number=0)
# Bind the retry ID to the same image bytes and exact frozen manual question.

hashvalue=action('Original file hash','hash',WFInput=attachment(image),WFHashType='SHA256')
def question_id():
 material=action('Image and question identity','gettext',WFTextActionText=text(hashvalue,'\n',caption64))
 digest=action('Image and question hash','hash',WFInput=attachment(material),WFHashType='SHA256')
 action('Question submission ID','gettext',WFTextActionText=text('iosq_',digest))
shareid=block('Stable submission ID',captioncount,2,question_id,otherwise=lambda:action('Just the photo submission ID','gettext',WFTextActionText=text('ios_',hashvalue)),number=0)
origin_index=len(A)
origin=action('Approved HTTPS origin','gettext',WFTextActionText='')
originmatch=action('Exact HTTPS origin check','text.match',text=text(origin),WFMatchTextPattern='^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::443)?$')
block('Invalid origin',originmatch,101,lambda:reject('Nothing was sent. The picture-receiving address is missing or does not look right. Add a fresh blank Send to dot v5 and enter the address from your setup instructions. Stop after the website name; do not add anything after it.'))
action('Destination confirmation','alert',WFAlertActionTitle='Send this photo?',WFAlertActionMessage=text('Send to: ',origin,'\nYour question: ',caption,'\nThe original photo is sent unchanged. It may include details such as when and where it was taken. Large photos may be rejected. After sending, check your original dot conversation for the photo and reply. Tap Cancel to send nothing.'),WFAlertActionCancelButtonShown=True)
code_index=len(A)
code=action('Saved upload-only code','gettext',WFTextActionText='')
codecheck=action('Upload code format check','text.match',text=text(code),WFMatchTextPattern='^[A-Za-z0-9_-]{24,512}$')
block('Invalid code',codecheck,101,lambda:reject('Nothing was sent. The phone connection code is missing or does not look right. Add a fresh blank Send to dot v5 and enter the phone connection code from your setup instructions. Do not enter an account password or any other code.'))
url=action('Upload URL','url',WFURLActionURL=text(origin,'/api/upload'))
response=action('Upload original file','downloadurl',WFURL=text(url),Advanced=True,ShowHeaders=True,WFHTTPMethod='POST',WFHTTPBodyType='File',WFRequestVariable=attachment(image),WFHTTPHeaders=dictionary([('Authorization',text('Bearer ',code)),('Origin',text(origin)),('Content-Type',text(mime)),('X-Share-ID',text(shareid)),('X-Inbox-Caption',text(caption64)),('X-Inbox-Caption-Source',text(caption_source))]))
fileid=action('Server receipt file ID','getvalueforkey',WFInput=attachment(response),WFDictionaryKey='file_id',WFGetDictionaryValueType='Value')
block('No receipt',fileid,101,lambda:reject('We cannot confirm that your photo was received. Check your original dot conversation before sending again. If your connection code has expired or been stopped, ask the person who helped you set this up for a new phone connection code. Saving the old code again does not make it last longer. An error or a stopped shortcut does not mean the photo was received.'))
action('Receipt explanation','showresult',Text=text('Your photo was submitted. Open your original dot conversation and wait for the photo and reply.'))
workflow={'WFWorkflowName':'Send to dot v5','WFWorkflowActions':A,'WFWorkflowClientVersion':'4018.0.4','WFWorkflowMinimumClientVersion':900,'WFWorkflowMinimumClientVersionString':'900','WFWorkflowHasShortcutInputVariables':True,'WFWorkflowHasOutputFallback':False,'WFWorkflowInputContentItemClasses':['WFImageContentItem','WFGenericFileContentItem'],'WFWorkflowOutputContentItemClasses':[],'WFWorkflowTypes':['ActionExtension'],'WFQuickActionSurfaces':[],'WFWorkflowImportQuestions':[{'ActionIndex':origin_index,'Category':'Parameter','DefaultValue':'','ParameterKey':'WFTextActionText','Text':'Paste the picture-receiving address from your setup instructions, for example https://inbox.example.com. Stop after the website name; do not add a slash or anything after it. Do not enter a password or code here.'},{'ActionIndex':code_index,'Category':'Parameter','DefaultValue':'','ParameterKey':'WFTextActionText','Text':'Enter only your phone connection code. Anyone who edits this shortcut can see it; it is not hidden or password-protected here. iCloud may copy it to your other devices. Sharing or exporting this shortcut will include the code, so keep this configured copy private. The code lets someone send pictures, not read them. It lasts 30 days only when that time was approved during setup; saving it does not extend it. Leave blank if you do not want to save it; nothing can be sent until it is filled in.'}],'WFWorkflowIcon':{'WFWorkflowIconGlyphNumber':59511,'WFWorkflowIconStartColor':4282601983}}
(ROOT/(args.output_stem+'.unsigned.shortcut')).write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_BINARY,sort_keys=False))
(ROOT/(args.output_stem+'.actions.json')).write_text(json.dumps(workflow,ensure_ascii=False,indent=2)+'\n')
print('Built unsigned no-secret candidate with',len(A),'actions; sign with the official Shortcuts CLI before import.')
