// Upload-route operational metadata only. Never inspect request headers/body/IP.
import {randomUUID} from 'node:crypto';
const methods=new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);
export function uploadCategory(status){
 if(status===201)return 'accepted';
 return ({0:'connection_closed',400:'invalid_upload',401:'authentication_rejected',403:'request_boundary_rejected',404:'method_or_route_rejected',408:'request_timeout',413:'payload_too_large',429:'rate_limited',500:'server_unavailable',503:'server_unavailable'})[status]??'unexpected_status';
}
export function observeUpload(req,res,log,{now=()=>new Date(),id=randomUUID}={}){
 let path;try{path=new URL(req.url,'http://127.0.0.1').pathname;}catch{return;}
 if(path!=='/api/upload')return;
 const requestId=id(),time=now().toISOString(),method=methods.has(req.method)?req.method:'OTHER';
 // The caller cannot supply the correlation value through headers or query.
 res.setHeader('X-Inbox-Request-ID',requestId);
 let recorded=false;
 function record(status){
  if(recorded)return;recorded=true;
  const safeStatus=Number.isInteger(status)&&status>=100&&status<=599?status:0;
  const entry={event:'upload.request',time,requestId,method,status:safeStatus,errorCategory:uploadCategory(safeStatus)};
  try{log(entry);}catch{/* Operational logging must not change request processing. */}
 }
 res.once('finish',()=>record(res.statusCode));
 res.once('close',()=>record(0));
}
