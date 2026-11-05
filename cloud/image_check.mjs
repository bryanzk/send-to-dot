// Structural PNG/JPEG check for platforms without the Python decoder: same formats and limits
// as validate_image.py (PNG or JPEG, <=8 MiB, <=16 MP), except that multi-picture (MPF/Ultra HDR)
// JPEGs are accepted by their primary image. It verifies
// container structure and checksums; it does not decode pixels.
const MAX_BYTES=8*1024*1024,MAX_PIXELS=16_000_000;
const fail=(reason='invalid')=>{const e=Error('Invalid image');e.reason=reason;throw e;};
let table;
function crc32(b,start,end){if(!table){table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}}
  let c=~0;for(let i=start;i<end;i++)c=table[(c^b[i])&255]^(c>>>8);return ~c>>>0;}
function png(b){
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);let p=8,w=0,h=0,idat=false,end=false,first=true;
  while(p+12<=b.length){
    const len=dv.getUint32(p),type=String.fromCharCode(b[p+4],b[p+5],b[p+6],b[p+7]);
    if(len>b.length-p-12)fail('png_truncated');
    if(crc32(b,p+4,p+8+len)!==dv.getUint32(p+8+len))fail('png_crc');
    if(first){if(type!=='IHDR'||len!==13)fail();w=dv.getUint32(p+8);h=dv.getUint32(p+12);first=false;}
    else if(type==='IHDR')fail();
    if(type==='acTL'&&len>=4&&dv.getUint32(p+8)>1)fail('png_animated');
    if(type==='IDAT')idat=true;
    p+=12+len;if(type==='IEND'){end=true;break;}
  }
  if(first||!idat||!end||!w||!h)fail('png_structure');return {mime:'image/png',width:w,height:h};
}
function jpeg(b){
  let p=2,w=0,h=0,frames=0;
  while(p<b.length){
    if(b[p]!==0xff)fail('jpeg_marker');while(b[p]===0xff)p++;const m=b[p++];if(p>b.length)fail('jpeg_truncated');
    if(m===0xd8||m===0xd9)fail('jpeg_structure');
    if((m>=0xd0&&m<=0xd7)||m===0x01)continue;
    if(p+2>b.length)fail('jpeg_truncated');const len=(b[p]<<8)|b[p+1];if(len<2||p+len>b.length)fail('jpeg_segment');
    // MPF (APP2 "MPF\0"): Ultra HDR / multi-picture JPEGs from current phone cameras append a
    // second image (gain map, depth) after the primary. Only the primary is checked; the whole
    // file is still delivered byte-for-byte.
    if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc){if(len<8)fail('jpeg_frame');frames++;h=(b[p+3]<<8)|b[p+4];w=(b[p+5]<<8)|b[p+6];}
    if(m===0xda){
      if(frames!==1||!w||!h)fail('jpeg_frames');
      for(let i=p+len;i+1<b.length;i++)if(b[i]===0xff&&b[i+1]===0xd9)return {mime:'image/jpeg',width:w,height:h};
      fail('jpeg_no_end');
    }
    p+=len;
  }
  fail('jpeg_no_scan');
}
export function checkImage(bytes){
  const b=bytes instanceof Uint8Array?bytes:fail('type');
  if(!b.length||b.length>MAX_BYTES)fail('size');
  let r;
  if(b.length>8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47&&b[4]===0x0d&&b[5]===0x0a&&b[6]===0x1a&&b[7]===0x0a)r=png(b);
  else if(b.length>4&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)r=jpeg(b);
  else fail('format');
  if(r.width*r.height>MAX_PIXELS)fail('pixels');
  return r;
}
export const validateImage=bytes=>checkImage(bytes).mime;
