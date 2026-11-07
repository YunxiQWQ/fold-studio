import {encodeCmykScan} from './vendor/jpeg-cmyk-encoder.js';
import {validateIcc} from './color-settings.js';
import {canvasCmykPixels} from './export-cmyk.js';

export async function encodeCmykJpeg(pixels,width,height,profile,{quality=92,dpi=150,onProgress}={}){
  validateIcc(profile);
  if(!(pixels instanceof Uint8Array)||pixels.length!==width*height*4||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16000||height>16000||width*height>40000000)throw Error('CMYK JPG 像素数据无效或过大');
  if(!Number.isFinite(quality)||quality<1||quality>100||!Number.isFinite(dpi)||dpi<=0||dpi>9600)throw Error('JPG 质量或 DPI 无效');
  const scan=await encodeCmykScan(pixels,width,height,quality,onProgress),chunks=[];
  const segment=(marker,data)=>{const out=new Uint8Array(data.length+4);out.set([255,marker,(data.length+2)>>8,(data.length+2)&255]);out.set(data,4);chunks.push(out);};
  const count=Math.ceil(profile.length/65519),header=new TextEncoder().encode('ICC_PROFILE\0');
  for(let i=0;i<count;i++){const part=profile.subarray(i*65519,(i+1)*65519),bytes=new Uint8Array(part.length+14);bytes.set(header);bytes[12]=i+1;bytes[13]=count;bytes.set(part,14);segment(0xe2,bytes);}
  const exif=new Uint8Array(72),v=new DataView(exif.buffer);exif.set([69,120,105,102,0,0,73,73,42,0]);v.setUint32(10,8,true);v.setUint16(14,3,true);
  for(const [i,tag]of [282,283,296].entries()){const at=16+i*12;v.setUint16(at,tag,true);v.setUint16(at+2,tag===296?3:5,true);v.setUint32(at+4,1,true);v.setUint32(at+8,tag===296?2:50+i*8,true);}
  for(let i=0;i<2;i++){v.setUint32(56+i*8,Math.round(dpi*1000),true);v.setUint32(60+i*8,1000,true);}segment(0xe1,exif);
  const length=chunks.reduce((n,b)=>n+b.length,0),out=new Uint8Array(scan.length+length);out.set(scan.subarray(0,2));let at=2;for(const chunk of chunks){out.set(chunk,at);at+=chunk.length;}out.set(scan.subarray(2),at);return out;
}
export function opaqueCanvas(canvas){const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const ctx=out.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(canvas,0,0);return out;}
export async function exportJpeg(canvas,{mode='rgb',transform,quality=92,dpi=150,onProgress=()=>{}}={}){
  if(mode==='rgb'){
    const blob=await new Promise(resolve=>opaqueCanvas(canvas).toBlob(resolve,'image/jpeg',quality/100));if(!blob)throw Error('RGB JPG 编码失败');return blob;
  }
  if(mode!=='cmyk'||!transform)throw Error('请选择有效的 JPG 色彩模式');
  const pixels=await canvasCmykPixels(canvas,transform,{onProgress:p=>onProgress(p*.45)});
  const bytes=await encodeCmykJpeg(pixels,canvas.width,canvas.height,transform.profile,{quality,dpi,onProgress:p=>onProgress(.45+p*.55)});return new Blob([bytes],{type:'image/jpeg'});
}
