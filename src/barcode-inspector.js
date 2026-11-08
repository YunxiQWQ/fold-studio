import {barcodeStatus} from './barcode.js';
import {BARCODE_FORMATS,barcodeFormat} from './barcode-formats.js';

export function appendBarcodeInspector(host,node,generator,editor){
  const section=document.createElement('section');section.className='barcode-settings';
  const field=(name,control,id)=>{const label=document.createElement('label');label.textContent=name;control.id=id;label.append(control);section.append(label);return control;};
  const select=(name,id,values,current)=>{const control=document.createElement('select');for(const [value,title]of values)control.append(new Option(title,value,value===current,value===current));return field(name,control,id);};
  const format=field('条码制式',document.createElement('select'),'native-barcode-format'),groups=new Map();
  for(const item of BARCODE_FORMATS){if(!groups.has(item.group)){const group=document.createElement('optgroup');group.label=item.group;groups.set(item.group,group);format.append(group);}groups.get(item.group).append(new Option(item.label,item.id));}
  format.value=generator.format??'ean13';
  const input=field('条码内容',document.createElement('textarea'),'native-code');input.value=generator.code;input.maxLength=120;input.rows=3;input.spellcheck=false;input.setAttribute('aria-describedby','native-barcode-hint native-code-status');
  const hint=document.createElement('p');hint.id='native-barcode-hint';hint.className='svg-field-note';section.append(hint);
  const example=document.createElement('button');example.id='native-barcode-example';example.type='button';example.className='wide-button';example.textContent='填入当前制式的示例';section.append(example);
  const show=field('显示识别文字',document.createElement('input'),'native-barcode-text');show.type='checkbox';show.checked=generator.showText!==false;show.parentElement.classList.add('barcode-checkbox');
  Object.assign(show.parentElement.style,{display:'flex',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:'12px'});Object.assign(show.style,{width:'16px',height:'16px',margin:'0',padding:'0'});
  const position=select('文字位置','native-barcode-text-position',[['bottom','条码下方'],['top','条码上方']],generator.barcodeTextPosition??'bottom');
  const font=select('识别文字字体','native-barcode-font',[['monospace','等宽字体'],['ocrb','OCR-B（需本机安装）'],['sans','无衬线字体']],generator.barcodeFont??'monospace');
  const size=field('识别文字大小（%）',document.createElement('input'),'native-barcode-text-scale');size.type='number';size.min='60';size.max='160';size.step='1';size.value=String(Math.round((generator.barcodeTextScale??1)*100));
  const color=field('条码颜色',document.createElement('input'),'native-barcode-color');color.type='color';color.dataset.nativeBarcodeColor='true';color.value=generator.color??'#000000';color.setAttribute('aria-label','条码颜色');
  const bg=select('底色','native-barcode-bg',[['#ffffff','白底'],['transparent','透明'],...(generator.bgColor&&!['#ffffff','transparent'].includes(generator.bgColor)?[[generator.bgColor,'保留工程底色']]:[])],generator.bgColor??'#ffffff');
  const note=document.createElement('p');note.id='native-code-status';note.className='svg-field-note';note.setAttribute('aria-live','polite');section.append(note);
  const dimensions=document.createElement('p');dimensions.className='svg-field-note';dimensions.textContent='宽高在“位置与尺寸”中调整，左右保留制式所需静区。条码可继续解组编辑；需要多个条码时，可使用“排列与变换”中的阵列复制。';section.append(dimensions);
  const candidate=()=>({...generator,code:input.value,format:format.value,showText:show.checked,barcodeTextPosition:position.value,barcodeFont:font.value,barcodeTextScale:Number(size.value)/100,color:color.value,bgColor:bg.value});
  const check=()=>{
    const status=barcodeStatus(candidate());input.setAttribute('aria-invalid',String(!!status.error));size.setAttribute('aria-invalid',String(!size.value||!size.checkValidity()));note.classList.toggle('code-error',!!status.error);
    note.textContent=status.error?`${status.error}。画布保留上次有效条码。`:`有效编码：${status.digits??status.text}`;
    hint.textContent=barcodeFormat(format.value).hint;
    for(const control of [position,font,size])control.disabled=!show.checked;
    return status;
  };
  const apply=()=>{if(!check().error)editor.regenerate(node,candidate());};
  input.oninput=size.oninput=check;input.onchange=apply;
  for(const control of [format,show,position,font,size,color,bg])control.onchange=apply;
  example.onclick=()=>{input.value=barcodeFormat(format.value).example;apply();};
  host.prepend(section);check();
}
