// One catalog shared by the SVG inspector, legacy projects and validation.
export const BARCODE_FORMATS = [
  {id:'ean13',label:'EAN-13 · 商品零售',group:'商品零售',example:'400638133393',hint:'12 或 13 位数字；输入 12 位时自动补齐校验位。'},
  {id:'ean8',label:'EAN-8 · 小包装',group:'商品零售',example:'9638507',hint:'7 或 8 位数字；输入 7 位时自动补齐校验位。'},
  {id:'upca',label:'UPC-A · 北美零售',group:'商品零售',example:'03600029145',hint:'11 或 12 位数字；输入 11 位时自动补齐校验位。'},
  {id:'upce',label:'UPC-E · 压缩零售码',group:'商品零售',example:'425261',hint:'6 位主体数字，或含号码系统（0／1）及校验位的完整 8 位。'},
  {id:'code128',label:'Code 128 · 自动',group:'通用与物流',example:'FOLD-12345678',hint:'英文字母、数字与常用半角符号；自动选择紧凑的子集。'},
  {id:'code128a',label:'Code 128 A',group:'通用与物流',example:'FOLD-123',hint:'大写英文字母、数字与半角符号（ASCII 32–95）。'},
  {id:'code128b',label:'Code 128 B',group:'通用与物流',example:'Fold-123',hint:'大小写英文字母、数字与常用半角符号（ASCII 32–126）。'},
  {id:'code128c',label:'Code 128 C · 纯数字',group:'通用与物流',example:'123456789012',hint:'偶数位数字；保留开头的 0。'},
  {id:'code39',label:'Code 39',group:'通用与物流',example:'FOLD-123',hint:'大写英文字母、数字、空格及 - . $ / + %；不自动改写大小写。'},
  {id:'code93',label:'Code 93',group:'通用与物流',example:'FOLD-123',hint:'大写英文字母、数字、空格及 - . $ / + %。'},
  {id:'itf14',label:'ITF-14 · 外箱',group:'通用与物流',example:'1001234567890',hint:'13 或 14 位数字；自动补齐或校验末位，带承载边框。'},
  {id:'itf',label:'ITF · 交叉二五码',group:'通用与物流',example:'1234567890',hint:'偶数位数字；不额外添加校验位。'},
  {id:'gs1128',label:'GS1-128（EAN-128）',group:'通用与物流',example:'(01)09506000134352(17)271231(10)LOT42',hint:'括号表示 AI。支持 (00)、(01)、(10)、(11)、(15)、(17)、(21)；可变长字段自动分隔。'},
  {id:'codabar',label:'Codabar · 库德巴码',group:'其他',example:'A123456B',hint:'以 A／B／C／D 起止；中间为数字及 - $ : / . +，不自动添加校验位。'},
];
export const BARCODE_FORMAT_IDS=BARCODE_FORMATS.map(item=>item.id);
export const barcodeFormat=id=>BARCODE_FORMATS.find(item=>item.id===(id??'ean13'));
export function validateBarcodeOptions(layer){
  if(!barcodeFormat(layer.format))throw Error('工程条码格式无效');
  if(layer.showText!==undefined&&typeof layer.showText!=='boolean')throw Error('条码文字开关无效');
  if(layer.barcodeTextPosition!==undefined&&!['top','bottom'].includes(layer.barcodeTextPosition))throw Error('条码文字位置无效');
  if(layer.barcodeFont!==undefined&&!['monospace','ocrb','sans'].includes(layer.barcodeFont))throw Error('条码字体无效');
  if(layer.barcodeTextScale!==undefined&&(!Number.isFinite(layer.barcodeTextScale)||layer.barcodeTextScale<.6||layer.barcodeTextScale>1.6))throw Error('条码字号比例须为 60%–160%');
}
