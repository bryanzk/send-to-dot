// Run only inside an authorized agent's orchestration, with current documented
// native tools supplied as callbacks. This module never loads credentials/APIs.
// `local` must use bounded stdin, never shell-interpolate JSON/caption values.
export async function prepareImageFirst({fileId,eventId,local,readOriginalReceipt,saveLibrary,applyLibraryMetadata,retainNativeContext=()=>{},clock=()=>performance.now()}){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(fileId)||!/^evt_[A-Za-z0-9_-]{8,100}$/.test(eventId))throw Error('Invalid trusted event identity');
 for(const f of [local,readOriginalReceipt,saveLibrary,applyLibraryMetadata,retainNativeContext])if(typeof f!=='function')throw Error('Authorized native capabilities required');
 const timings={},started=clock();let mark=started;
 const measured=async(name,f)=>{const value=await f();timings[name]=Math.round((clock()-mark)*100)/100;mark=clock();return value;};
 const begin=await measured('claim_ms',()=>local('start',{fileId,eventId}));
 if(begin.decision!=='read_source')return {...begin,timings};
 const claimId=begin.claim_id;
 const native=await measured('authorized_read_ms',()=>readOriginalReceipt(fileId));
 // Keep actual native result in the agent context only; no caption in metrics/map.
 retainNativeContext(native);
 if(native?.isError||!Array.isArray(native?.content))return {decision:'hold',reason:'authorized_native_read_failed',timings};
 let compact;
 try{if(native.content.length!==1||native.content[0].type!=='text'||native.content[0].text.length>16384)throw Error();compact=JSON.parse(native.content[0].text);}catch{return {decision:'hold',reason:'compact_source_tool_required',timings};}
 if(compact.type!=='send-to-dot.attachment-source')return {decision:'hold',reason:'compact_source_tool_required',timings};
 const staged=await measured('verify_stage_ms',()=>local('prepare',{fileId,eventId,claim_id:claimId,content:native.content}));
 if(staged.decision!=='save_original_once')return {...staged,timings};
 let saved;
 try{saved=await measured('native_library_ms',()=>saveLibrary(staged.staged_path));}
 catch{await local('uncertain',{fileId,eventId,phase:'image'});return {decision:'hold',reason:'native_library_outcome_uncertain',timings};}
 // The callback normalizes a *real successful* Library tool receipt, never an
 // inferred filename or a receipt invented by this module.
 if(!saved||!/^libfile_[A-Za-z0-9_-]+$/.test(saved.library_file_id??'')||!/^file_[A-Za-z0-9_-]+$/.test(saved.file_id??'')||!Number.isSafeInteger(saved.version)||saved.version<0){
  await local('uncertain',{fileId,eventId,phase:'image'});return {decision:'hold',reason:'native_library_receipt_unconfirmed',timings};
 }
 let metadataWarning=false;
 try{await measured('library_metadata_ms',()=>applyLibraryMetadata(staged.staged_path,saved));}catch{metadataWarning=true;}
 let ready;
 try{ready=await measured('atomic_reserve_ms',()=>local('saved-reserve',{fileId,eventId,claim_id:claimId,library_receipt:{library_file_id:saved.library_file_id,file_id:saved.file_id,version:saved.version}}));}
 catch{return {decision:'hold',reason:'library_saved_local_commit_unconfirmed',confirmed_library_file_id:saved.library_file_id,timings};}
 if(ready.decision!=='send_image_once')return {decision:'hold',reason:'image_reservation_not_confirmed',confirmed_library_file_id:saved.library_file_id,timings};
 let cleanupWarning=false;
 try{await measured('staging_cleanup_ms',()=>local('cleanup-staged',{fileId,eventId,claim_id:claimId}));}catch{cleanupWarning=true;}
 timings.total_prepare_ms=Math.round((clock()-started)*100)/100;
 return {...ready,source_file_id:fileId,event_id:eventId,metadata_warning:metadataWarning,cleanup_warning:cleanupWarning,timings,
  next:'Original-dot agent sends this attachment once now, without waiting for analysis. Record its actual receipt before the separate answer phase.',user_visible_confirmed:false};
}
