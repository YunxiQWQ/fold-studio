import {icon} from './icons.js';
import {svgCommandState} from './svg-editor-ui-state.js';

const expanded=new Map();
const geometry=new Set('x y width height cx cy r rx ry x1 y1 x2 y2 points'.split(' '));
const typography=new Set('font-size font-family font-weight font-style text-decoration text-anchor letter-spacing'.split(' '));
const appearance=new Set(['fill','stroke','stroke-width','opacity']);
const short=new Set([...geometry,'font-size','font-weight','font-style','text-anchor','letter-spacing','stroke-width','opacity']);

function section(host,key,title,advanced=false){
  const node=document.createElement(advanced?'details':'section');node.className='svg-property-section';node.dataset.propertySection=key;
  const heading=document.createElement(advanced?'summary':'h4');heading.textContent=title;node.append(heading);
  const body=document.createElement('div');body.className='svg-property-fields';node.append(body);host.append(node);
  if(advanced){node.open=expanded.get(key)??false;node.addEventListener('toggle',()=>{if(node.isConnected)expanded.set(key,node.open);});}
  return body;
}

function action(host,command,title,glyph,run,disabled=false){
  const button=document.createElement('button');button.type='button';button.dataset.inspectorAction=command;button.disabled=disabled;
  button.innerHTML=icon(glyph);button.append(document.createTextNode(title));button.title=title;button.onclick=()=>run(command);host.append(button);
}

function paintPreview(input){
  const wrap=document.createElement('div');wrap.className='svg-paint-value';input.before(wrap);wrap.append(input);
  const chip=document.createElement('span');chip.className='svg-paint-chip';chip.setAttribute('aria-hidden','true');wrap.prepend(chip);
  const sync=()=>{
    const value=input.value||input.placeholder;
    const solid=CSS.supports('color',value)&&value!=='none';
    chip.style.backgroundColor=solid?value:'';
    chip.textContent=value==='none'?'∅':solid?'':'◈';
  };
  input.addEventListener('input',sync);sync();
}

export function arrangeSvgInspector(host,node,editor){
  const state=svgCommandState(editor.api?.canvas,node,editor.api?.wrapper);
  if(state.nodes.length>1){
    host.replaceChildren();
    const heading=document.createElement('h3');heading.textContent=`已选中 ${state.nodes.length} 个对象`;host.append(heading);
    const note=document.createElement('p');note.textContent='拖动控制框整体变换；按住 Shift 等比例缩放。';host.append(note);
    const actions=section(host,'selection','组合与图层');
    for(const [command,title,glyph]of [['group','组合','group'],['ungroup','解组','ungroup'],['front','置于顶层','up'],['back','置于底层','down'],['duplicate','创建副本','copy'],['delete','删除','trash']])action(actions,command,title,glyph,c=>editor.run(c),!state.can(command));
    const align=section(host,'align','对齐与分布');
    for(const [command,title]of [['align-l','左对齐'],['align-c','水平居中'],['align-r','右对齐'],['align-t','上对齐'],['align-m','垂直居中'],['align-b','下对齐'],['align-dh','水平分布'],['align-dv','垂直分布']])action(align,command,title,'shape',c=>editor.run(c),!state.can(command));
    document.querySelector('#selected-type').textContent=`多选 · ${state.nodes.length} 项`;
    return;
  }
  if(!node){host.classList.add('is-empty');return;}
  host.classList.remove('is-empty');
  if(node.closest('[data-locked="true"]'))return;
  const children=[...host.children],heading=children.find(child=>child.tagName==='H3');
  host.replaceChildren();if(heading)host.append(heading);
  const fields=new Map();
  const take=(key,title,advanced=false)=>{if(!fields.has(key))fields.set(key,section(host,key,title,advanced));return fields.get(key);};
  const name=children.find(child=>child.querySelector('#node-name'));if(name)host.append(name);
  const content=children.filter(child=>child!==heading&&child!==name&&!child.querySelector('[data-attribute]'));
  for(const child of content)take('content',child.querySelector('#native-code')?'编码内容':node.localName==='image'?'图片':'内容').append(child);
  // Keep every original control and its handler, including SVG-specific fields.
  // Only their presentation changes; advanced attributes remain fully editable.
  for(const [key,title,set]of [['geometry','位置与尺寸',geometry],['type','文字样式',typography],['paint','外观',appearance],['advanced','高级 SVG 属性',null]]){
    const labels=children.filter(child=>{const attribute=child.querySelector('[data-attribute]')?.dataset.attribute;return attribute&&(set?set.has(attribute):!geometry.has(attribute)&&!typography.has(attribute)&&!appearance.has(attribute));});
    if(!labels.length)continue;
    const body=take(key,title,key==='advanced');
    for(const label of labels){
      const input=label.querySelector('[data-attribute]'),attribute=input.dataset.attribute;
      if(short.has(attribute))label.classList.add('property-short');
      if(!input.value&&['fill','stroke','opacity',...typography].includes(attribute))input.placeholder=getComputedStyle(node).getPropertyValue(attribute);
      input.setAttribute('autocomplete','off');input.spellcheck=false;
      if(short.has(attribute))input.inputMode='decimal';
      if(['fill','stroke'].includes(attribute))paintPreview(input);
      if(attribute==='transform'||attribute==='points')input.title=input.value;
      body.append(label);
    }
  }
}
