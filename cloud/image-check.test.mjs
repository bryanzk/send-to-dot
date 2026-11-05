import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {checkImage} from './image_check.mjs';import {makePng} from './test_support.mjs';
const py=process.env.DOT_INBOX_PYTHON??'python3',script=fileURLToPath(new URL('../validate_image.py',import.meta.url));
const pil=b=>{const r=spawnSync(py,[script],{input:b});return r.status===0?r.stdout.toString().trim():null;};
const js=b=>{try{return checkImage(b).mime;}catch{return null;}};
function jpeg(){const r=spawnSync(py,['-c',"import io,sys\nfrom PIL import Image\nb=io.BytesIO();Image.new('RGB',(40,30),(200,10,10)).save(b,'JPEG');sys.stdout.buffer.write(b.getvalue())"]);return r.status===0?r.stdout:null;}
test('accepts the same valid PNG/JPEG as the Python decoder and reports dimensions',()=>{
  const png=readFileSync(new URL('../web/sample.png',import.meta.url));assert.equal(js(png),'image/png');assert.equal(js(png),pil(png));
  const big=makePng(300,true);assert.deepEqual([checkImage(big).width,checkImage(big).height],[300,300]);assert.equal(pil(big),'image/png');
  const j=jpeg();if(j){assert.equal(js(j),'image/jpeg');assert.equal(pil(j),'image/jpeg');assert.deepEqual([checkImage(j).width,checkImage(j).height],[40,30]);}
});
test('rejects what the Python decoder rejects: corrupt, truncated, wrong type, oversize',()=>{
  const png=makePng(64);const bad=Buffer.from(png);bad[bad.length-20]^=0xff;
  const cases=[bad,png.subarray(0,png.length-12),Buffer.from('GIF89a........'),Buffer.alloc(0),Buffer.from('not an image at all')];
  const j=jpeg();if(j)cases.push(j.subarray(0,j.length-2));
  for(const c of cases){assert.equal(js(c),null);assert.equal(pil(c),null);}
  const huge=Buffer.from(makePng(8));huge.writeUInt32BE(5000,16);huge.writeUInt32BE(5000,20);assert.equal(js(huge),null);
});
test('multi-picture (MPF / Ultra HDR) JPEG is accepted by its primary image; reasons are reported',()=>{
  const j=jpeg();if(!j)return;
  const mpf=Buffer.concat([Buffer.from([0xff,0xe2,0x00,0x0c]),Buffer.from('MPF\0'),Buffer.alloc(6)]);
  const ultra=Buffer.concat([j.subarray(0,2),mpf,j.subarray(2),j]);
  assert.equal(checkImage(ultra).mime,'image/jpeg');
  try{checkImage(Buffer.from('GIF89a........'));assert.fail();}catch(e){assert.equal(e.reason,'format');}
  try{checkImage(j.subarray(0,j.length-2));assert.fail();}catch(e){assert.equal(e.reason,'jpeg_no_end');}
});
