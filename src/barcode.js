// Standard packaging barcode generator (EAN-13 and Code 128)
import {drawCodeError} from './code-feedback.js';

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

export function barcodeStatus(layer){
  try{return (layer.format??'ean13')==='code128'?encodeCode128(layer.code):encodeEAN13(layer.code);}
  catch(error){return {error:error.message};}
}
export function drawBarcode(ctx,layer,w,h,color){
  const data=barcodeStatus(layer);
  if(data.error){drawCodeError(ctx,w,h,'条码内容无效');return;}
  const ean=(layer.format??'ean13')==='ean13',showText=layer.showText!==false;
  const quietLeft=ean?11:10,quietRight=ean?7:10,module=w/(data.bits.length+quietLeft+quietRight);
  const startX=-w/2+quietLeft*module,top=-h*.46,textHeight=showText?h*.2:0,barHeight=h*.9-textHeight,guardExtra=showText?textHeight*.3:0;
  ctx.save();
  if((layer.bgColor??'#ffffff')!=='transparent'){ctx.fillStyle=layer.bgColor??'#ffffff';ctx.fillRect(-w/2,-h/2,w,h);}
  ctx.fillStyle=color;
  for(let i=0;i<data.bits.length;i++)if(data.bits[i].bit){const start=i,guard=data.bits[i].isGuard;while(i+1<data.bits.length&&data.bits[i+1].bit&&data.bits[i+1].isGuard===guard)i++;ctx.fillRect(startX+start*module,top,(i-start+1)*module,barHeight+(guard?guardExtra:0));}
  if(showText){
    ctx.font=`${textHeight*.9}px "Courier New",monospace`;ctx.textAlign='center';ctx.textBaseline='bottom';
    const y=h*.47;
    if(ean){ctx.fillText(String(data.firstDigit),startX-6*module,y,8*module);ctx.fillText(data.digits.slice(1,7),startX+24*module,y,40*module);ctx.fillText(data.digits.slice(7),startX+71*module,y,40*module);}
    else ctx.fillText(data.text,0,y,w*.9);
  }
  ctx.restore();
}
