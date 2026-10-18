import test from 'node:test';
import assert from 'node:assert/strict';
import zxing from '@zxing/library';
import {encodeQRCode,qrStatus} from '../src/qrcode.js';
import {encodeEAN13,encodeCode128,barcodeStatus,drawBarcode} from '../src/barcode.js';
const {RGBLuminanceSource,HybridBinarizer,BinaryBitmap,QRCodeReader,MultiFormatReader,DecodeHintType,BarcodeFormat}=zxing;
function bitmap(data,w,h){return new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(data,w,h)));}
test('QR payload independently decodes UTF-8, URLs, long content, all ECC levels, and full capacity without truncation',()=>{
  for(const level of ['L','M','Q','H'])for(const text of ['https://example.org/pack?id=42','中文包装测试 😀','多行\n第二行','内容'.repeat(100),'x'.repeat(level==='H'?1000:1500)]){
    const qr=encodeQRCode(text,level),scale=5,w=(qr.size+8)*scale,pixels=new Uint8ClampedArray(w*w).fill(255);
    for(let y=0;y<w;y++)for(let x=0;x<w;x++)if(qr.modules[Math.floor(y/scale)-4]?.[Math.floor(x/scale)-4])pixels[y*w+x]=0;
    const hints=new Map([[DecodeHintType.PURE_BARCODE,true]]);
    assert.equal(new QRCodeReader().decode(bitmap(pixels,w,w),hints).getText(),text,`${level}, ${text.length} characters`);
  }
  assert.match(qrStatus('中'.repeat(2000),'H').error,/容量/);assert.match(qrStatus('').error,/输入/);
});
test('barcode preserves exact contents and rejects incorrect check digits and unsupported characters',()=>{
  assert.equal(encodeEAN13('400638133393').digits,'4006381333931');
  for(const text of ['4006381333932','123','abc','400638133393100'])assert.throws(()=>encodeEAN13(text));
  assert.equal(encodeCode128('A'.repeat(120)).text.length,120);assert.throws(()=>encodeCode128('中文'));assert.throws(()=>encodeCode128(''));
  assert.match(barcodeStatus({format:'ean13',code:'4006381333932'}).error,/校验/);
});
test('barcode drawing at millimetre dimensions independently scans without merged bars or altered payload',()=>{
  for(const [format,code,w,h]of [['ean13','4006381333931',38,24],['code128','pack-42+ABC/789',60,24],['code128','A'.repeat(65),150,30]]){
    const scale=12,width=Math.ceil(w*scale),height=Math.ceil(h*scale),pixels=new Uint8ClampedArray(width*height).fill(255);
    const ctx={save(){},restore(){},fillStyle:'',fillText(){},fillRect(x,y,rw,rh){if(this.fillStyle!=='#000000')return;const left=Math.max(0,Math.round((x+w/2)*scale)),right=Math.min(width,Math.round((x+w/2+rw)*scale)),top=Math.max(0,Math.round((y+h/2)*scale)),bottom=Math.min(height,Math.round((y+h/2+rh)*scale));for(let r=top;r<bottom;r++)pixels.fill(0,r*width+left,r*width+right);}};
    drawBarcode(ctx,{format,code,showText:false},w,h,'#000000');const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,[format==='ean13'?BarcodeFormat.EAN_13:BarcodeFormat.CODE_128]]]);
    assert.equal(new MultiFormatReader().decode(bitmap(pixels,width,height),hints).getText(),code);
  }
});
