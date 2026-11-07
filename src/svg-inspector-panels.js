import {MM_PER_PT,typographyTargets,typographyLeaves,sharedTextValue,computedValue,physicalTextValue,lineHeight,applyTypography,toggleTypography} from './svg-typography.js';
import {ALIGNMENTS,alignmentOptions,canAlign} from './svg-alignment.js';
import {appendFontPicker} from './svg-font-picker.js';

const safePhysical=(editor,node,key)=>{try{return physicalTextValue(editor,node,key);}catch{return NaN;}};
const create=(tag,props={},text)=>{const el=document.createElement(tag);Object.assign(el,props);if(text!==undefined)el.textContent=text;return el;};
function section(host,key,title){const s=create('section',{className:'svg-property-section'});s.dataset.propertySection=key;s.append(create('h4',{},title));const body=create('div',{className:'svg-property-fields'});s.append(body);host.append(s);return body;}
function field(host,label,input,short=false){const el=create('label',{className:short?'property-short':''},label);el.append(input);host.append(el);return input;}
function select(id,items,value){const el=create('select',{id});for(const [v,label]of items)el.append(new Option(label,v,v===value,v===value));return el;}
function report(editor,action,input){try{action();input?.removeAttribute('aria-invalid');editor.api.refreshProperties(true);}catch(error){input?.setAttribute('aria-invalid','true');editor.callbacks.notify(error.message);}}

export function appendTypographyPanel(host,editor){
  const targets=typographyTargets(editor);if(!targets.length)return;
  const range=editor.api.textRange,leaves=range?.nodes??typographyLeaves(targets),nodes=leaves.length?leaves:targets,body=section(host,'typography','字体与文字排版');
  if(range)body.append(create('p',{className:'svg-field-note',id:'typography-selection-note'},`已选中 ${[...range.text].length} 个字符；字体、字号和字形样式应用于选中文字，段落设置应用于整段。`));
  if(targets.length>1)body.append(create('p',{className:'svg-field-note'},`应用于 ${targets.length} 段文字；其他图形保持原样。`));
  const family=appendFontPicker(body,{value:sharedTextValue(nodes,'font-family'),onChange:(value,input)=>report(editor,()=>applyTypography(editor,'font-family',value),input)});
  const preview=create('p',{className:'svg-font-preview'},'Aa 字体预览');preview.style.fontFamily=family.value||'sans-serif';body.append(preview);
  const unit=editor.typographyUnit??'pt',factor=unit==='pt'?MM_PER_PT:1,sizes=nodes.map(n=>safePhysical(editor,n,'font-size')),mm=sizes.every(v=>Math.abs(v-sizes[0])<1e-6)?sizes[0]:NaN;
  const size=field(body,'字号',create('input',{id:'typography-size',type:'number',min:String(.1/factor),max:String(600/factor),step:'any',value:Number.isFinite(mm)?String(+((mm/factor).toFixed(3))):'',placeholder:'混合字号'}),true);size.dataset.typography='font-size';
  size.onchange=()=>report(editor,()=>{if(!size.value.trim())throw Error('请输入字号');applyTypography(editor,'font-size',Number(size.value)*factor);},size);
  size.disabled=sizes.some(v=>!Number.isFinite(v));
  const units=field(body,'字号单位',select('typography-unit',[['pt','pt（磅）'],['mm','mm（毫米）']],unit),true);units.dataset.editorPreference='true';units.onchange=()=>{editor.typographyUnit=units.value;editor.api.refreshProperties(true);};
  const weightValue=sharedTextValue(nodes,'font-weight'),weight=field(body,'字重',select('typography-weight',[['','混合字重'],['100','100 · 纤细'],['200','200 · 特细'],['300','300 · 细体'],['400','400 · 常规'],['500','500 · 中等'],['600','600 · 半粗'],['700','700 · 粗体'],['800','800 · 特粗'],['900','900 · 黑体']],weightValue));weight.dataset.typography='font-weight';weight.onchange=()=>{if(weight.value)report(editor,()=>applyTypography(editor,'font-weight',weight.value),weight);};
  const buttons=create('div',{className:'svg-type-buttons'});body.append(buttons);
  for(const [command,label,on]of [['bold','粗体',n=>Number(computedValue(n,'font-weight'))>=600],['italic','斜体',n=>computedValue(n,'font-style')!=='normal'],['underline','下划线',n=>computedValue(n,'text-decoration').includes('underline')],['line-through','删除线',n=>computedValue(n,'text-decoration').includes('line-through')]]){
    const button=create('button',{type:'button'},label);button.dataset.typographyAction=command;button.setAttribute('aria-pressed',String(nodes.every(on)));button.onclick=()=>report(editor,()=>toggleTypography(editor,command));buttons.append(button);
  }
  const anchor=field(body,'段落对齐',select('typography-anchor',[['','混合对齐'],['start','左对齐'],['middle','居中'],['end','右对齐']],sharedTextValue(nodes,'text-anchor')));anchor.dataset.typography='text-anchor';anchor.onchange=()=>{if(anchor.value)report(editor,()=>applyTypography(editor,'text-anchor',anchor.value),anchor);};
  for(const [key,label,min,max]of [['letter-spacing','字距（mm）',-100,300],['word-spacing','词距（mm）',-100,300],['line-height','行距倍数',.1,10]]){
    const values=key==='line-height'?targets.map(lineHeight):nodes.map(n=>safePhysical(editor,n,key)),same=values.every(v=>Math.abs(v-values[0])<1e-6),input=field(body,label,create('input',{id:'typography-'+key,type:'number',step:'any',min:String(min),max:String(max),value:same&&Number.isFinite(values[0])?String(+values[0].toFixed(4)):'',placeholder:'混合数值'}),key!=='line-height');input.dataset.typography=key;input.disabled=values.some(v=>!Number.isFinite(v));
    input.onchange=()=>report(editor,()=>{if(!input.value.trim())throw Error('请输入排版数值');applyTypography(editor,key,input.value);},input);
  }
  const writing=field(body,'文字方向',select('typography-writing-mode',[['','混合方向'],['horizontal-tb','横排'],['vertical-rl','竖排 · 从右向左'],['vertical-lr','竖排 · 从左向右']],sharedTextValue(nodes,'writing-mode')));writing.dataset.typography='writing-mode';writing.onchange=()=>{if(writing.value)report(editor,()=>applyTypography(editor,'writing-mode',writing.value),writing);};
  body.append(create('p',{className:'svg-field-note'},'字体由本机提供；工程保留字体名称。字号改变字形大小，行距用于多行文字。'));
}

export function appendAlignmentPanel(host,editor,state){
  if(!state.nodes.length)return;
  const options=alignmentOptions(editor),body=section(host,'align','对齐与分布');
  const reference=field(body,'对齐参照',select('alignment-target',[['auto',state.nodes.length===1?'自动 · 当前包装面板':'自动 · 所选对象'],['selection','所选对象边界'],['key','关键对象（最后选中）'],['panel','当前包装面板'],['sheet','整张刀版']],options.target));
  const distribution=field(body,'分布方式',select('alignment-distribution',[['centers','中心等分'],['gaps','间距相等']],options.distribution));
  const gap=field(body,'指定间距（mm）',create('input',{id:'alignment-gap',type:'number',min:'0',max:'1000',step:'any',value:String(options.gap),placeholder:'留空自动计算',disabled:options.distribution!=='gaps'}));
  for(const input of [reference,distribution,gap])input.dataset.editorPreference='true';
  const actions=create('div',{className:'svg-alignment-buttons'});body.append(actions);
  const editable=state.nodes.every(n=>!n.closest('[data-locked="true"],defs,mask,clipPath,pattern,marker,symbol,filter'));
  const sync=()=>{for(const button of actions.children)button.disabled=!editable||!canAlign(state.nodes.length,button.dataset.inspectorAction.slice(6),options);editor.updateToolbar?.();};
  for(const [id,label]of ALIGNMENTS){const button=create('button',{type:'button'},label);button.dataset.inspectorAction='align-'+id;button.onclick=()=>editor.run('align-'+id);actions.append(button);}
  reference.onchange=()=>{options.target=reference.value;sync();};distribution.onchange=()=>{options.distribution=distribution.value;gap.disabled=options.distribution!=='gaps';sync();};gap.oninput=()=>{options.gap=gap.value;sync();};sync();
  body.append(create('p',{className:'svg-field-note'},'关键对象保持不动；内面按当前阅读方向对齐。自动分布至少三个对象，指定间距可排列两个。'));
}
