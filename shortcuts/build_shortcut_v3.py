"""Build a no-secret Apple Shortcuts old-format candidate; use Apple's signer next.
No dependency install, signing credential, personal endpoint or upload code here.
"""
from pathlib import Path
import argparse,json,plistlib,uuid
parser=argparse.ArgumentParser();parser.add_argument('--output-stem',default='Send-to-dot-v3');args=parser.parse_args()
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
action('Privacy note','comment',WFCommentActionText='No embedded endpoint or credential. Accept exactly one supplied PNG/JPEG and optional manually typed question. No shared text, OCR or EXIF is used as a question. No image conversion/resizing. Ask for upload-only code at runtime; the input may be visible. Never enter owner/read/OpenAI/Tunnel credentials. This template does not store the code or use clipboard. The OS/source app may supply an exported representation. Inbox expiry and persistent Space attachments are separate. iPhone acceptance is still required.')
count=action('Item count','count',Input=attachment(shortcut_input),WFCountType='Items')
block('Too many',count,2,lambda:reject('Share exactly one PNG/JPEG. Multiple items were not sent.'),number=1)
block('No image',count,0,lambda:reject('Use Photos or Files → Share → Send to dot with one PNG/JPEG.'),number=1)
image=action('Original supplied file','getitemfromlist',WFInput=attachment(shortcut_input),WFItemSpecifier='First Item')
extension=action('File extension','properties.files',WFInput=attachment(image),WFContentItemPropertyName='File Extension')
allowed=action('Allowed file extension','text.match',text=text(extension),WFMatchTextPattern='(?i)^(png|jpe?g)$')
block('Unsupported format',allowed,101,lambda:reject('Only supplied PNG/JPEG files are accepted. HEIC, PDF and video are not converted. Export a PNG/JPEG explicitly if needed.'))
png=action('PNG check','text.match',text=text(extension),WFMatchTextPattern='(?i)^png$')
mime=block('Choose MIME',png,100,lambda:action('PNG MIME','gettext',WFTextActionText='image/png'),otherwise=lambda:action('JPEG MIME','gettext',WFTextActionText='image/jpeg'))
# Only this explicit manual input may become a question. Never use share-sheet text.
menu_group=uid('group-Optional question')
action('Optional question','choosefrommenu',GroupingIdentifier=menu_group,WFControlFlowMode=0,WFMenuPrompt='Send just the image, or add your own question?',WFMenuItems=['Image only','Add my question'])
action('Image only branch','choosefrommenu',GroupingIdentifier=menu_group,WFControlFlowMode=1,WFMenuItemTitle='Image only')
action('No manual question','dictionary',WFItems=dictionary([('caption',''),('source','none')]))
action('Manual question branch','choosefrommenu',GroupingIdentifier=menu_group,WFControlFlowMode=1,WFMenuItemTitle='Add my question')
manual_question=action('Manual question input','ask',WFAskActionPrompt='Type your own optional question (maximum 500 Unicode characters / 2048 UTF-8 bytes). Do not paste a credential. Cancel to send nothing.',WFInputType='Text')
action('Manual question record','dictionary',WFItems=dictionary([('caption',text(manual_question)),('source','manual-entry')]))
action('Optional question-end','choosefrommenu',GroupingIdentifier=menu_group,WFControlFlowMode=2)
raw_caption=action('Raw manual question','getvalueforkey',WFInput=attachment(ref('Optional question-end')),WFDictionaryKey='caption',WFGetDictionaryValueType='Value')
caption=action('Frozen manual question','text.replace',WFInput=text(raw_caption),WFReplaceTextFind='^[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+|[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+$',WFReplaceTextReplace='',WFReplaceTextRegularExpression=True,WFReplaceTextCaseSensitive=True)
captioncount=action('Question character count','count',Input=attachment(caption),WFCountType='Characters')
block('Question too long',captioncount,2,lambda:reject('Your question is too long. Send nothing; shorten it to at most 500 Unicode characters / 2048 UTF-8 bytes.'),number=500)
caption64=block('Encode question',captioncount,2,lambda:action('Question UTF8 Base64','base64encode',WFInput=attachment(caption),WFEncodeMode='Encode',WFBase64LineBreakMode='None'),otherwise=lambda:action('No question Base64','gettext',WFTextActionText=''),number=0)
record_source=action('Frozen question source','getvalueforkey',WFInput=attachment(ref('Optional question-end')),WFDictionaryKey='source',WFGetDictionaryValueType='Value')
caption_source=block('Upload question source',captioncount,2,lambda:action('Recorded manual source','gettext',WFTextActionText=text(record_source)),otherwise=lambda:action('Empty question source','gettext',WFTextActionText='none'),number=0)
# Bind the retry ID to the same image bytes and exact frozen manual question.

hashvalue=action('Original file hash','hash',WFInput=attachment(image),WFHashType='SHA256')
def question_id():
 material=action('Image and question identity','gettext',WFTextActionText=text(hashvalue,'\n',caption64))
 digest=action('Image and question hash','hash',WFInput=attachment(material),WFHashType='SHA256')
 action('Question submission ID','gettext',WFTextActionText=text('iosq_',digest))
shareid=block('Stable submission ID',captioncount,2,question_id,otherwise=lambda:action('Image only submission ID','gettext',WFTextActionText=text('ios_',hashvalue)),number=0)
origin_index=len(A)
origin=action('Approved HTTPS origin','gettext',WFTextActionText='')
originmatch=action('Exact HTTPS origin check','text.match',text=text(origin),WFMatchTextPattern='^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::443)?$')
block('Invalid origin',originmatch,101,lambda:reject('Enter an exact HTTPS origin with no path, query, credentials, fragment or trailing slash. Nothing was uploaded.'))
action('Destination confirmation','alert',WFAlertActionTitle='Send this original image?',WFAlertActionMessage=text('Destination: ',origin,'\nQuestion: ',caption,'\nOne original supplied PNG/JPEG, including metadata. Image only if question is blank. Maximum 8 MiB / 16 million pixels; question at most 500 Unicode characters / 2048 UTF-8 bytes (server enforced). A receipt is not a dot reply. Cancel to send nothing.'),WFAlertActionCancelButtonShown=True)
code=action('Runtime upload-only code','ask',WFAskActionPrompt='Enter ONLY this inbox’s short-lived upload-only code. This input may be visible. It is not saved by this Shortcut. Never use owner/read/OpenAI/Tunnel credentials.',WFInputType='Text')
codecheck=action('Upload code format check','text.match',text=text(code),WFMatchTextPattern='^[A-Za-z0-9_-]{24,512}$')
block('Invalid code',codecheck,101,lambda:reject('The upload-only code format is invalid. Nothing was sent. Do not substitute a more privileged key.'))
url=action('Upload URL','url',WFURLActionURL=text(origin,'/api/upload'))
response=action('Upload original file','downloadurl',WFURL=text(url),Advanced=True,ShowHeaders=True,WFHTTPMethod='POST',WFHTTPBodyType='File',WFRequestVariable=attachment(image),WFHTTPHeaders=dictionary([('Authorization',text('Bearer ',code)),('Origin',text(origin)),('Content-Type',text(mime)),('X-Share-ID',text(shareid)),('X-Inbox-Caption',text(caption64)),('X-Inbox-Caption-Source',text(caption_source))]))
fileid=action('Server receipt file ID','getvalueforkey',WFInput=attachment(response),WFDictionaryKey='file_id',WFGetDictionaryValueType='Value')
block('No receipt',fileid,101,lambda:reject('No confirmed server receipt. Check pairing/type/limits/network. A timeout is unknown; retry the SAME supplied image so its hash ID is reused. Do not repeatedly resend a different representation.'))
action('Receipt explanation','showresult',Text=text('Server received the image. Check the original dot conversation for the original attachment and reply. Callback acceptance alone is not proof of a reply.'))
workflow={'WFWorkflowName':'Send to dot v3','WFWorkflowActions':A,'WFWorkflowClientVersion':'4018.0.4','WFWorkflowMinimumClientVersion':900,'WFWorkflowMinimumClientVersionString':'900','WFWorkflowHasShortcutInputVariables':True,'WFWorkflowHasOutputFallback':False,'WFWorkflowInputContentItemClasses':['WFImageContentItem','WFGenericFileContentItem'],'WFWorkflowOutputContentItemClasses':[],'WFWorkflowTypes':['ActionExtension'],'WFQuickActionSurfaces':[],'WFWorkflowImportQuestions':[{'ActionIndex':origin_index,'Category':'Parameter','DefaultValue':'','ParameterKey':'WFTextActionText','Text':'Set your own nonsecret stable HTTPS origin once (for example https://inbox.example.com), no path or trailing slash. Do not enter any token. You can edit this Text action later if your address changes.'}],'WFWorkflowIcon':{'WFWorkflowIconGlyphNumber':59511,'WFWorkflowIconStartColor':4282601983}}
(ROOT/(args.output_stem+'.unsigned.shortcut')).write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_BINARY,sort_keys=False))
(ROOT/(args.output_stem+'.actions.json')).write_text(json.dumps(workflow,ensure_ascii=False,indent=2)+'\n')
print('Built unsigned no-secret candidate with',len(A),'actions; sign with the official Shortcuts CLI before import.')
