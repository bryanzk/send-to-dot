"""Build a no-secret Apple Shortcuts old-format candidate; use Apple's signer next.
No dependency install, signing credential, personal endpoint or upload code here.
"""
from pathlib import Path
import argparse,json,plistlib,uuid
parser=argparse.ArgumentParser();parser.add_argument('--output-stem',default='Send-to-dot-v2');args=parser.parse_args()
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
shortcut_input={'Type':'ExtensionInput'}
action('Privacy note','comment',WFCommentActionText='No embedded endpoint or credential. Accept exactly one supplied PNG/JPEG. No image conversion/resizing. Ask for upload-only code at runtime; the input may be visible. Never enter owner/read/OpenAI/Tunnel credentials. This template does not store the code or use clipboard. The OS/source app may supply an exported representation. Inbox expiry and persistent Space attachments are separate. iPhone acceptance is still required.')
count=action('Item count','count',Input=attachment(shortcut_input),WFCountType='Items')
block('Too many',count,2,lambda:reject('Share exactly one PNG/JPEG. Multiple items were not sent.'),number=1)
block('No image',count,0,lambda:reject('Use Photos or Files → Share → Send to dot with one PNG/JPEG.'),number=1)
image=action('Original supplied file','getitemfromlist',WFInput=attachment(shortcut_input),WFItemSpecifier='First Item')
extension=action('File extension','properties.files',WFInput=attachment(image),WFContentItemPropertyName='File Extension')
allowed=action('Allowed file extension','text.match',text=text(extension),WFMatchTextPattern='(?i)^(png|jpe?g)$')
block('Unsupported format',allowed,101,lambda:reject('Only supplied PNG/JPEG files are accepted. HEIC, PDF and video are not converted. Export a PNG/JPEG explicitly if needed.'))
png=action('PNG check','text.match',text=text(extension),WFMatchTextPattern='(?i)^png$')
mime=block('Choose MIME',png,100,lambda:action('PNG MIME','gettext',WFTextActionText='image/png'),otherwise=lambda:action('JPEG MIME','gettext',WFTextActionText='image/jpeg'))
# Hashing the file makes an uncertain retry of the same supplied bytes reuse its ID.
hashvalue=action('Original file hash','hash',WFInput=attachment(image),WFHashType='SHA256')
shareid=action('Stable submission ID','gettext',WFTextActionText=text('ios_',hashvalue))
origin_index=len(A)
origin=action('Approved HTTPS origin','gettext',WFTextActionText='')
originmatch=action('Exact HTTPS origin check','text.match',text=text(origin),WFMatchTextPattern='^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::443)?$')
block('Invalid origin',originmatch,101,lambda:reject('Enter an exact HTTPS origin with no path, query, credentials, fragment or trailing slash. Nothing was uploaded.'))
action('Destination confirmation','alert',WFAlertActionTitle='Send this original image?',WFAlertActionMessage=text('Destination: ',origin,'\nOne original supplied PNG/JPEG, including metadata. Maximum 8 MiB / 16 million pixels is enforced by the server. An API receipt is not a dot reply. Cancel now to send nothing.'),WFAlertActionCancelButtonShown=True)
action('Preview original','previewdocument',WFInput=attachment(image))
code=action('Runtime upload-only code','ask',WFAskActionPrompt='Enter ONLY this inbox’s short-lived upload-only code. This input may be visible. It is not saved by this Shortcut. Never use owner/read/OpenAI/Tunnel credentials.',WFInputType='Text')
codecheck=action('Upload code format check','text.match',text=text(code),WFMatchTextPattern='^[A-Za-z0-9_-]{24,512}$')
block('Invalid code',codecheck,101,lambda:reject('The upload-only code format is invalid. Nothing was sent. Do not substitute a more privileged key.'))
url=action('Upload URL','url',WFURLActionURL=text(origin,'/api/upload'))
def dictionary(items):return {'Value':{'WFDictionaryFieldValueItems':[{'WFItemType':0,'WFKey':text(k),'WFValue':v if isinstance(v,dict) else text(v)} for k,v in items]},'WFSerializationType':'WFDictionaryFieldValue'}
response=action('Upload original file','downloadurl',WFURL=text(url),Advanced=True,ShowHeaders=True,WFHTTPMethod='POST',WFHTTPBodyType='File',WFRequestVariable=attachment(image),WFHTTPHeaders=dictionary([('Authorization',text('Bearer ',code)),('Origin',text(origin)),('Content-Type',text(mime)),('X-Share-ID',text(shareid))]))
fileid=action('Server receipt file ID','getvalueforkey',WFInput=attachment(response),WFDictionaryKey='file_id',WFGetDictionaryValueType='Value')
block('No receipt',fileid,101,lambda:reject('No confirmed server receipt. Check pairing/type/limits/network. A timeout is unknown; retry the SAME supplied image so its hash ID is reused. Do not repeatedly resend a different representation.'))
action('Receipt explanation','showresult',Text=text('Server received the image. Check the original dot conversation for the original attachment and reply. Callback acceptance alone is not proof of a reply.'))
workflow={'WFWorkflowName':'Send to dot v2','WFWorkflowActions':A,'WFWorkflowClientVersion':'4018.0.4','WFWorkflowMinimumClientVersion':900,'WFWorkflowMinimumClientVersionString':'900','WFWorkflowHasShortcutInputVariables':True,'WFWorkflowHasOutputFallback':False,'WFWorkflowInputContentItemClasses':['WFImageContentItem','WFGenericFileContentItem'],'WFWorkflowOutputContentItemClasses':[],'WFWorkflowTypes':['ActionExtension'],'WFQuickActionSurfaces':[],'WFWorkflowImportQuestions':[{'ActionIndex':origin_index,'Category':'Parameter','DefaultValue':'','ParameterKey':'WFTextActionText','Text':'Set your own nonsecret stable HTTPS origin once (for example https://inbox.example.com), no path or trailing slash. Do not enter any token. You can edit this Text action later if your address changes.'}],'WFWorkflowIcon':{'WFWorkflowIconGlyphNumber':59511,'WFWorkflowIconStartColor':4282601983}}
(ROOT/(args.output_stem+'.unsigned.shortcut')).write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_BINARY,sort_keys=False))
(ROOT/(args.output_stem+'.actions.json')).write_text(json.dumps(workflow,ensure_ascii=False,indent=2)+'\n')
print('Built unsigned no-secret candidate with',len(A),'actions; sign with the official Shortcuts CLI before import.')
