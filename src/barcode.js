// Shared vector/Canvas barcode renderer. Encoders never depend on a barcode font.
import {drawCodeError} from './code-feedback.js';
import JsBarcode from 'jsbarcode';
import {barcodeFormat,validateBarcodeOptions} from './barcode-formats.js';

// EAN-13 parity encoding tables
const EAN_L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011'
];
const EAN_G = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111'
];
const EAN_R = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100'
];
const EAN_PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
];

export function computeEAN13CheckDigit(digits12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits12[i], 10) || 0;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function encodeEAN13(raw) {
  let digits = String(raw??'');
  if(!/^\d{12,13}$/.test(digits))throw new Error('EAN-13 请输入 12 或 13 位数字');
  if (digits.length === 12) {
    digits += computeEAN13CheckDigit(digits);
  } else if (digits.length === 13) {
    const expected = computeEAN13CheckDigit(digits.slice(0, 12));
    if (parseInt(digits[12], 10) !== expected)throw new Error(`校验位应为 ${expected}；输入前 12 位可自动补齐`);
  }

  const first = parseInt(digits[0], 10);
  const parity = EAN_PARITY[first];
  const bits = []; // { bit: 0|1, isGuard: boolean }

  // Start guard 101
  bits.push({ bit: 1, isGuard: true }, { bit: 0, isGuard: true }, { bit: 1, isGuard: true });

  // Left 6 digits
  for (let i = 0; i < 6; i++) {
    const d = parseInt(digits[i + 1], 10);
    const pattern = parity[i] === 'L' ? EAN_L[d] : EAN_G[d];
    for (const ch of pattern) bits.push({ bit: ch === '1' ? 1 : 0, isGuard: false });
  }

  // Center guard 01010
  bits.push(
    { bit: 0, isGuard: true },
    { bit: 1, isGuard: true },
    { bit: 0, isGuard: true },
    { bit: 1, isGuard: true },
    { bit: 0, isGuard: true }
  );

  // Right 6 digits (R code)
  for (let i = 0; i < 6; i++) {
    const d = parseInt(digits[i + 7], 10);
    const pattern = EAN_R[d];
    for (const ch of pattern) bits.push({ bit: ch === '1' ? 1 : 0, isGuard: false });
  }

  // Stop guard 101
  bits.push({ bit: 1, isGuard: true }, { bit: 0, isGuard: true }, { bit: 1, isGuard: true });

  return { digits, bits, firstDigit: first };
}

// Code 128 subset B patterns (characters 32 to 127)
const C128_PATTERNS = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100',
  '10011001000', '10011000100', '10001100100', '11001001000', '11001000100', '11000100100',
  '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110',
  '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110',
  '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110',
  '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010',
  '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110',
  '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110',
  '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000',
  '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000',
  '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010',
  '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100',
  '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000',
  '10111100010', '11110101000', '11110100010', '10111011110', '10111101110', '11101011110',
  '11110101110', '11010000100', '11010010000', '11010011100', '1100011101011'
];
const C128_START_B = 104;
const C128_STOP = 106;

export function encodeCode128(raw) {
  const text = String(raw??'');
  if(!text||text.length>120||/[^\x20-\x7e]/.test(text))throw new Error('Code 128 请输入 1–120 位英文字母、数字或常用半角符号');
  const values = [C128_START_B];
  for (let i = 0; i < text.length; i++) {
    values.push(text.charCodeAt(i) - 32);
  }

  let checksum = values[0];
  for (let i = 1; i < values.length; i++) {
    checksum = (checksum + values[i] * i) % 103;
  }
  values.push(checksum);
  values.push(C128_STOP);

  const bits = [];
  for (const val of values) {
    const pattern = C128_PATTERNS[val] || C128_PATTERNS[0];
    for (const ch of pattern) bits.push({ bit: ch === '1' ? 1 : 0, isGuard: false });
  }

  return { text, bits };
}

export function computeGTINCheckDigit(body){
  let sum=0;for(let i=body.length-1,weight=3;i>=0;i--,weight=4-weight)sum+=Number(body[i])*weight;
  return String((10-sum%10)%10);
}
function checkedDigits(raw,length,label){
  if(!new RegExp(`^\\d{${length-1},${length}}$`).test(raw))throw Error(`${label} 请输入 ${length-1} 或 ${length} 位数字`);
  const body=raw.slice(0,length-1),check=computeGTINCheckDigit(body);
  if(raw.length===length&&raw.at(-1)!==check)throw Error(`校验位应为 ${check}；输入前 ${length-1} 位可自动补齐`);
  return body+check;
}
export function gs1Payload(raw){
  const matches=[...raw.matchAll(/\((\d{2,4})\)([^()]*)/g)];
  if(!matches.length||matches.map(m=>m[0]).join('')!==raw)throw Error('请按 (01)商品编码(10)批次 的格式填写，括号仅用于分隔 AI');
  const seen=new Set(),fields=[];
  for(const [,ai,value]of matches){
    if(seen.has(ai))throw Error(`AI (${ai}) 不能重复`);seen.add(ai);
    if(!['00','01','10','11','15','17','21'].includes(ai))throw Error(`暂不支持 AI (${ai})；支持 00、01、10、11、15、17、21`);
    if(['00','01'].includes(ai)){
      const length=ai==='00'?18:14;
      if(!new RegExp(`^\\d{${length}}$`).test(value))throw Error(`AI (${ai}) 需要含校验位的 ${length} 位数字`);
      checkedDigits(value,length,`AI (${ai})`);
    }else if(['11','15','17'].includes(ai)){
      if(!/^\d{2}(0[1-9]|1[0-2])([0-2]\d|3[01])$/.test(value))throw Error(`AI (${ai}) 日期须为 YYMMDD`);
      const days=new Date(Date.UTC(2000+Number(value.slice(0,2)),Number(value.slice(2,4)),0)).getUTCDate();
      if(Number(value.slice(4))>days)throw Error(`AI (${ai}) 日期不存在`);
    }else if(!/^[!%-?A-Z_a-z"]{1,20}$/.test(value))throw Error(`AI (${ai}) 需要 1–20 位 GS1 半角字符（不含空格）`);
    fields.push({ai,value,variable:['10','21'].includes(ai)});
  }
  if(seen.has('00')&&fields.length!==1)throw Error('当前 SSCC 支持单独的 (00) 字段；商品批次请以 (01) 开始');
  if(!['00','01'].includes(fields[0].ai))throw Error('请先填写 (01) 商品编码或单独的 (00) SSCC');
  const payload=fields.map((f,i)=>f.ai+f.value+(f.variable&&i<fields.length-1?'\xCF':'')).join('');
  if(payload.replaceAll('\xCF','').length>48)throw Error('GS1-128 内容超过 48 个数据字符，请拆分字段');
  return payload;
}
function libraryEncoding(text,format,options={}){
  const result={};JsBarcode(result,text,{format,flat:true,displayValue:false,...options});
  const encoded=result.encodings[0];return {text:encoded.text,bits:[...encoded.data].map(bit=>({bit:Number(bit),isGuard:false}))};
}
export function encodeBarcode(raw,format='ean13'){
  const spec=barcodeFormat(format),text=String(raw??'');
  if(!spec)throw Error('不支持这个条码制式');
  if(!text||text.length>120)throw Error('条码内容需要 1–120 个字符');
  if(format==='ean13')return encodeEAN13(text);
  let value=text,encoder,options={},digits;
  if(['ean8','upca','itf14'].includes(format)){
    const length={ean8:8,upca:12,itf14:14}[format];digits=value=checkedDigits(text,length,spec.label.split(' · ')[0]);
    encoder={ean8:'EAN8',upca:'UPC',itf14:'ITF14'}[format];
  }else if(format==='upce'){
    if(!/^(\d{6}|[01]\d{7})$/.test(text))throw Error('UPC-E 请输入 6 位主体数字，或以 0／1 开始的完整 8 位');
    encoder='UPCE';
  }else if(format==='gs1128'){value=gs1Payload(text);encoder='CODE128';options.ean128=true;options.text=text;
  }else if(['code128','code128a','code128b'].includes(format)){
    if((format==='code128a'?/[^\x20-\x5f]/:/[^\x20-\x7e]/).test(text))throw Error(spec.hint);
    encoder={code128:'CODE128',code128a:'CODE128A',code128b:'CODE128B'}[format];
  }else if(['code128c','itf'].includes(format)){
    if(!/^(\d{2})+$/.test(text))throw Error('请输入偶数位数字，不会自动补零或删除内容');
    encoder=format==='itf'?'ITF':'CODE128C';
  }else if(['code39','code93'].includes(format)){
    if(!/^[0-9A-Z .$/+%\-]+$/.test(text))throw Error(spec.hint);
    encoder=format==='code39'?'CODE39':'CODE93';
  }else if(format==='codabar'){
    if(!/^[A-D][0-9\-$:/+.]+[A-D]$/.test(text))throw Error(spec.hint);
    encoder='codabar';options.text=text;
  }
  let result;
  try{result=libraryEncoding(value,encoder,options);}catch{throw Error(format==='upce'?'UPC-E 校验位不匹配；输入 6 位主体数字可自动补齐':spec.hint);}
  if(format==='upce')digits=result.text;
  if(digits)result.digits=digits;
  const guards={ean8:[[0,3],[31,36],[64,67]],upca:[[0,3],[45,50],[92,95]],upce:[[0,3],[45,51]]}[format];
  for(const [start,end]of guards??[])for(let i=start;i<end;i++)result.bits[i].isGuard=true;
  return result;
}
export function barcodeStatus(layer){
  try{validateBarcodeOptions(layer);return encodeBarcode(layer.code,layer.format??'ean13');}
  catch(error){return {error:error.message};}
}
export function drawBarcode(ctx,layer,w,h,color){
  const data=barcodeStatus(layer);
  if(data.error){drawCodeError(ctx,w,h,'条码内容无效');return;}
  const format=layer.format??'ean13',ean=format==='ean13',showText=layer.showText!==false,above=layer.barcodeTextPosition==='top';
  const [quietLeft,quietRight]={ean13:[11,7],ean8:[7,7],upca:[9,9],upce:[9,9]}[format]??[10,10],module=w/(data.bits.length+quietLeft+quietRight);
  const startX=-w/2+quietLeft*module,textHeight=showText?h*.2*(layer.barcodeTextScale??1):0;
  const top=-h*.46+(above?textHeight:0),barHeight=h*.9-textHeight,guardExtra=showText&&!above?textHeight*.3:0;
  ctx.save();
  if((layer.bgColor??'#ffffff')!=='transparent'){ctx.fillStyle=layer.bgColor??'#ffffff';ctx.fillRect(-w/2,-h/2,w,h);}
  ctx.fillStyle=color;
  for(let i=0;i<data.bits.length;i++)if(data.bits[i].bit){const start=i,guard=data.bits[i].isGuard;while(i+1<data.bits.length&&data.bits[i+1].bit&&data.bits[i+1].isGuard===guard)i++;ctx.fillRect(startX+start*module,top,(i-start+1)*module,barHeight+(guard?guardExtra:0));}
  if(format==='itf14'){const bearer=Math.min(module*2,barHeight*.1);ctx.fillRect(startX,top,data.bits.length*module,bearer);ctx.fillRect(startX,top+barHeight-bearer,data.bits.length*module,bearer);}
  if(showText){
    const font={monospace:'"Courier New",monospace',ocrb:'"OCRB10N","OCR B Std","OCRB",monospace',sans:'Arial,sans-serif'}[layer.barcodeFont??'monospace'];
    ctx.font=`${textHeight*.9}px ${font}`;ctx.textAlign='center';ctx.textBaseline=above?'top':'bottom';
    const y=above?-h*.47:h*.47;
    if(ean&&!above){ctx.fillText(String(data.firstDigit),startX-6*module,y,8*module);ctx.fillText(data.digits.slice(1,7),startX+24*module,y,40*module);ctx.fillText(data.digits.slice(7),startX+71*module,y,40*module);}
    else if(format==='ean8'&&!above){ctx.fillText(data.digits.slice(0,4),startX+17*module,y,27*module);ctx.fillText(data.digits.slice(4),startX+50*module,y,27*module);}
    else if(format==='upca'&&!above){ctx.fillText(data.digits[0],startX-5*module,y,7*module);ctx.fillText(data.digits.slice(1,6),startX+27*module,y,34*module);ctx.fillText(data.digits.slice(6,11),startX+67*module,y,34*module);ctx.fillText(data.digits[11],startX+100*module,y,7*module);}
    else if(format==='upce'&&!above){ctx.fillText(data.digits[0],startX-5*module,y,7*module);ctx.fillText(data.digits.slice(1,7),startX+24*module,y,41*module);ctx.fillText(data.digits[7],startX+56*module,y,7*module);}
    else ctx.fillText(data.digits??data.text,0,y,w*.9);
  }
  ctx.restore();
}
