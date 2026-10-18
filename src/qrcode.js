import QRCode from 'qrcode/lib/core/qrcode.js';
import {drawCodeError} from './code-feedback.js';

const cache=new Map();
export function qrStatus(text,level='M'){
  text=String(text??'');const key=JSON.stringify([text,level]);if(cache.has(key))return cache.get(key);
  let result;
  try{
    if(!text)throw new Error('请输入二维码内容');
    const qr=QRCode.create(text,{errorCorrectionLevel:level});
    result={size:qr.modules.size,version:qr.version,modules:Array.from({length:qr.modules.size},(_,r)=>Array.from({length:qr.modules.size},(_,c)=>!!qr.modules.get(r,c)))};
  }catch{result={error:text?'内容超过当前纠错等级的容量，请缩短内容或降低纠错等级':'请输入二维码内容'};}
  if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
}
export function encodeQRCode(text,level='M'){
  const qr=qrStatus(text,level);if(qr.error)throw new Error(qr.error);return qr;
}
export function drawQRCode(ctx,layer,w,h,color){
  const qr=qrStatus(layer.text,layer.errorCorrectionLevel??'M');
  if(qr.error){drawCodeError(ctx,w,h,'二维码内容无效');return;}
  const quiet=4,total=qr.size+quiet*2,cell=Math.min(w,h)/total;
  const startX=-total*cell/2,startY=-total*cell/2;
  ctx.save();
  if((layer.bgColor??'#ffffff')!=='transparent'){ctx.fillStyle=layer.bgColor??'#ffffff';ctx.fillRect(-w/2,-h/2,w,h);}
  ctx.fillStyle=color;ctx.beginPath();
  // One compound fill joins touching modules without antialias seams or rounding millimetres.
  for(let r=0;r<qr.size;r++)for(let c=0;c<qr.size;c++)if(qr.modules[r][c]){
    const start=c;while(c+1<qr.size&&qr.modules[r][c+1])c++;
    ctx.rect(startX+(start+quiet)*cell,startY+(r+quiet)*cell,(c-start+1)*cell,cell);
  }
  ctx.fill();
  ctx.restore();
}
