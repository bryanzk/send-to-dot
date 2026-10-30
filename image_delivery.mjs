import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function makeViewingPreview(bytes){
 const r=spawnSync(process.env.DOT_INBOX_PYTHON??'python3',[fileURLToPath(new URL('./preview_image.py',import.meta.url))],{input:bytes,timeout:10000,maxBuffer:1100000});
 if(r.status!==0||!r.stdout.length||r.stdout.length>1048576)throw Error('Viewing preview unavailable');return r.stdout;
}
export function imageDelivery(image,token,cache,{inlineLimit=4*1024*1024,preview=makeViewingPreview}={}){
 const originalHash=sha(image.bytes);if(originalHash!==image.submission.image_sha256)throw Error('Original image integrity failed');
 if(image.bytes.length<=inlineLimit)return [{type:'image',data:image.bytes.toString('base64'),mimeType:image.mime}];
 if(!cache||!image.source)throw Error('Original image delivery unavailable');
 const viewed=preview(image.bytes);let receipt;
 try{receipt=cache.stage(image.bytes,{...image.source,grant_hash:sha(Buffer.from(token))});}catch{throw Error('Original image delivery unavailable');}
 const descriptor={type:'send-to-dot.image-delivery',version:1,file_id:image.source.file_id,eventId:image.source.event_id,
  representation:'preview',preview_sha256:sha(viewed),preview_mime:'image/jpeg',original_sha256:originalHash,
  original_bytes:image.bytes.length,original_mime:image.mime,expires_at:image.source.expires_at,read_receipt_max_ttl_ms:300000,read_receipt:receipt};
 return [{type:'image',data:viewed.toString('base64'),mimeType:'image/jpeg'},{type:'text',text:JSON.stringify(descriptor)}];
}
