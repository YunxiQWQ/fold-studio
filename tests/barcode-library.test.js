import test from 'node:test';
import assert from 'node:assert/strict';
import zxing from '@zxing/library';
import {barcodeStatus,drawBarcode,gs1Payload} from '../src/barcode.js';
import {BARCODE_FORMATS} from '../src/barcode-formats.js';
import {newProject,validateProject} from '../src/project.js';
import {SvgDrawingContext} from '../src/export-svg.js';
import {scanBarcodes} from './helpers/barcode-reader.mjs';
const {RGBLuminanceSource,HybridBinarizer,BinaryBitmap,MultiFormatReader,DecodeHintType,BarcodeFormat}=zxing;
const examples={ean13:['EAN_13','4006381333931'],ean8:['EAN_8','96385074'],upca:['UPC_A','036000291452'],upce:['UPC_E','04252614'],code128:['CODE_128','FOLD-12345678'],code128a:['CODE_128','FOLD-123'],code128b:['CODE_128','Fold-123'],code128c:['CODE_128','123456789012'],code39:['CODE_39','FOLD-123'],code93:['CODE_93','FOLD-123'],itf14:['ITF','10012345678902'],itf:['ITF','1234567890'],gs1128:['CODE_128',']C101095060001343521727123110LOT42'],codabar:['CODABAR','A123456B']};
function raster(layer){
  const status=barcodeStatus(layer);assert.ok(!status.error,status.error);
  const w=Math.max(38,(status.bits.length+24)*.34),h=26,scale=12,width=Math.ceil(w*scale),height=Math.ceil(h*scale),pixels=new Uint8ClampedArray(width*height).fill(255);
  const ctx={save(){},restore(){},fillStyle:'',fillText(){},fillRect(x,y,rw,rh){if(this.fillStyle!=='#000000')return;const left=Math.max(0,Math.round((x+w/2)*scale)),right=Math.min(width,Math.round((x+w/2+rw)*scale)),top=Math.max(0,Math.round((y+h/2)*scale)),bottom=Math.min(height,Math.round((y+h/2+rh)*scale));for(let row=top;row<bottom;row++)pixels.fill(0,row*width+left,row*width+right);}};
  drawBarcode(ctx,layer,w,h,'#000000');return {pixels,width,height};
}
async function decode(layer){
  const {pixels,width,height}=raster(layer);
  if(layer.format==='upce'){
    // The old JS decoder has an experimental/broken UPC-E reader; use ZXing-C++.
    const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<pixels.length;i++){data[i*4]=data[i*4+1]=data[i*4+2]=pixels[i];data[i*4+3]=255;}
    const found=await scanBarcodes({data,width,height},['UPC-E']);assert.equal(found.length,1);
    return JSON.parse(found[0].extra).UPCE;
  }
  const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat[examples[layer.format][0]]]],[DecodeHintType.ASSUME_GS1,true],[DecodeHintType.RETURN_CODABAR_START_END,true]]);
  return new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,width,height))),hints).getText();
}
for(const spec of BARCODE_FORMATS)test(`${spec.id}: independent reader scans actual draw commands with text above, below or hidden`,async()=>{
  for(const options of [{showText:false},{showText:true,barcodeTextPosition:'bottom'},{showText:true,barcodeTextPosition:'top',barcodeTextScale:1.6}])assert.equal(await decode({format:spec.id,code:spec.example,...options}),examples[spec.id][1]);
});
test('GTIN checksums, UPC-E systems, parity, alphabets and unsupported formats reject invalid data without rewriting input',async()=>{
  for(const [format,code]of [['ean8','96385075'],['upca','036000291453'],['itf14','10012345678903'],['upce','04252615'],['upce','24252614'],['upce','0425261'],['itf','123'],['code128c','123'],['code39','lowercase'],['code93','lowercase'],['code128a','lowercase'],['codabar','123456'],['code128','中文'],['ean13',' 4006381333931'],['unknown','123']])assert.ok(barcodeStatus({format,code}).error,`${format}: ${code}`);
  assert.equal(await decode({format:'code128c',code:'000012345678'}),'000012345678');
  assert.equal(await decode({format:'code128',code:'A'.repeat(120)}),'A'.repeat(120));
  assert.equal(await decode({format:'upce',code:'14252611'}),'14252611');
});
test('GS1 adds FNC1 separators between variable fields, validates identifiers, dates and GTINs, and preserves human readable brackets',async()=>{
  const raw='(01)09506000134352(10)LOT42(21)SER1';
  assert.equal(gs1Payload(raw),'010950600013435210LOT42\xCF21SER1');
  assert.equal(await decode({format:'gs1128',code:raw}),']C1010950600013435210LOT42\x1d21SER1');
  assert.equal(barcodeStatus({format:'gs1128',code:raw}).text,raw);
  for(const code of ['0109506000134352','(01)09506000134353','(99)123','(10)LOT','(01)09506000134352(17)270231','(01)09506000134352(10)LOT(10)LOT','(01)09506000134352(10)has space'])assert.ok(barcodeStatus({format:'gs1128',code}).error,code);
  assert.ok(!barcodeStatus({format:'gs1128',code:'(01)09506000134352(17)270200'}).error,'00 represents the last day of the month');
});
test('new and legacy project/generator metadata round trips without changing payloads or accepting unsafe style values',()=>{
  for(const spec of BARCODE_FORMATS){
    const project=newProject('carton'),layer={id:'barcode-new',type:'barcode',name:'条码',panel:'front',side:'outside',x:.5,y:.5,w:.7,h:.25,rotation:0,opacity:1,visible:true,color:'#000000',code:spec.example,format:spec.id,bgColor:'transparent',showText:true,barcodeFont:'ocrb',barcodeTextPosition:'top',barcodeTextScale:1.2};
    project.layers.push(layer);const saved=validateProject(JSON.parse(JSON.stringify(project)));assert.deepEqual(saved.layers.at(-1),layer);
    project.svgGenerators={[layer.id]:layer};assert.deepEqual(validateProject(project).svgGenerators,project.svgGenerators);
    for(const patch of [{barcodeFont:'bad'},{barcodeTextScale:0},{barcodeTextScale:NaN},{barcodeTextPosition:'left'},{showText:'yes'}]){project.svgGenerators={[layer.id]:{...layer,...patch}};assert.throws(()=>validateProject(project));}
  }
  assert.ok(!barcodeStatus({code:'400638133393'}).error,'legacy format remains EAN-13');
});
test('every format exports real vector bars without image fallbacks',()=>{
  for(const spec of BARCODE_FORMATS){const ctx=new SvgDrawingContext();drawBarcode(ctx,{format:spec.id,code:spec.example,showText:false},80,26,'#000000');const svg=ctx.toSVG();assert.match(svg,/<path\b/);assert.doesNotMatch(svg,/<image\b|data:image/);}
});
