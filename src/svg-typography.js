import {normalizeSvgValue} from './svg-format.js';

const resource='defs,mask,clipPath,pattern,marker,symbol,filter';
const ns='http://www.w3.org/2000/svg';
export const MM_PER_PT=25.4/72;
export const FONT_FAMILIES=[['微软雅黑','"Microsoft YaHei", sans-serif'],['宋体','SimSun, serif'],['黑体','SimHei, sans-serif'],['楷体','KaiTi, serif'],['仿宋','FangSong, serif'],['思源黑体','"Source Han Sans SC", "Noto Sans CJK SC", sans-serif'],['思源宋体','"Source Han Serif SC", "Noto Serif CJK SC", serif'],['Arial','Arial, sans-serif'],['Helvetica','Helvetica, Arial, sans-serif'],['Times New Roman','"Times New Roman", serif'],['Georgia','Georgia, serif'],['等宽字体','Consolas, monospace']];
export function typographyTargets(editor){
  const nodes=editor.api.canvas.getSelectedElements().filter(Boolean),active=editor.api.selected;
  const candidates=nodes.length===1&&['tspan','textPath'].includes(active?.localName)?[active]:nodes.flatMap(node=>['text','tspan','textPath'].includes(node.localName)?[node]:[...node.querySelectorAll('text')]);
  return [...new Set(candidates)].filter(node=>!node.closest(`[data-locked="true"],${resource}`)&&!candidates.some(p=>p!==node&&p.contains(node)));
}
export const computedValue=(node,key)=>getComputedStyle(node).getPropertyValue(key).trim();
export function typographyLeaves(nodes){return nodes.flatMap(root=>[root,...root.querySelectorAll('tspan,textPath')].filter(n=>[...n.childNodes].some(c=>c.nodeType===3&&c.nodeValue.trim())));}
export function sharedTextValue(nodes,key){const values=nodes.map(n=>computedValue(n,key));return values.every(v=>v===values[0])?values[0]:'';}
export function textPhysicalScale(editor,node,key='font-size'){
  const root=editor.api.wrapper.getScreenCTM(),screen=node.getScreenCTM();if(!root||!screen)throw Error('无法读取文字坐标');
  const m=new DOMMatrix([root.a,root.b,root.c,root.d,root.e,root.f]).inverse().multiply(new DOMMatrix([screen.a,screen.b,screen.c,screen.d,screen.e,screen.f]));
  const scale=key==='font-size'?Math.hypot(m.c,m.d):Math.hypot(m.a,m.b);if(!Number.isFinite(scale)||scale<1e-9)throw Error('文字缩放为零，无法设置字号或字距');return scale;
}
export function physicalTextValue(editor,node,key){const value=computedValue(node,key);return (value==='normal'?0:parseFloat(value))*textPhysicalScale(editor,node,key);}
export function textLines(node){
  const spans=[...node.querySelectorAll('tspan')].filter(p=>!p.closest('textPath'));
  const vertical=computedValue(node,'writing-mode').startsWith('vertical'),axis=vertical?'x':'y',offset=vertical?'dx':'dy',lines=[];let last;
  for(const span of spans){
    const value=span.getAttribute(axis),delta=parseFloat(span.getAttribute(offset));
    if(!lines.length||value!==null&&value!==last||Number.isFinite(delta)&&delta!==0){lines.push(span);if(value!==null)last=value;}
  }
  return lines;
}
export function lineHeight(node){
  const explicit=node.style.lineHeight,size=parseFloat(computedValue(textLines(node)[0]??node,'font-size'))||6;
  if(explicit&&explicit!=='normal'){const n=parseFloat(explicit);if(Number.isFinite(n))return /[a-z%]/i.test(explicit)?parseFloat(computedValue(node,'line-height'))/size:n;}
  const lines=textLines(node),axis=computedValue(node,'writing-mode').startsWith('vertical')?'x':'y',a=parseFloat(lines[0]?.getAttribute(axis)),b=parseFloat(lines[1]?.getAttribute(axis));
  return Number.isFinite(a)&&Number.isFinite(b)&&a!==b?Math.abs(b-a)/size:1.4;
}
export function readSvgText(node){
  if(!node.querySelector('tspan'))return node.textContent;
  const starts=new Set(textLines(node).slice(1));let value='';
  const visit=n=>{if(n.nodeType===3){value+=n.nodeValue;return;}if(['title','desc'].includes(n.localName))return;if(starts.has(n))value+='\n';for(const c of n.childNodes)visit(c);};visit(node);return value;
}
export function writeSvgText(node,value){
  const previous=readSvgText(node);if(previous===value)return;
  let start=0,tail=0;
  while(start<previous.length&&start<value.length&&previous[start]===value[start])start++;
  while(tail<previous.length-start&&tail<value.length-start&&previous.at(-tail-1)===value.at(-tail-1))tail++;
  const inserted=value.slice(start,value.length-tail),removed=previous.slice(start,previous.length-tail);
  // Ordinary typing should preserve every unaffected tspan, paint and font.
  // Keep edits within a line in the existing DOM instead of rebuilding it.
  if(!inserted.includes('\n')&&!removed.includes('\n')){
    const starts=new Set(textLines(node).slice(1)),runs=[];let offset=0;
    const visit=current=>{if(current.nodeType===3){runs.push({node:current,start:offset,end:offset+current.length});offset+=current.length;return;}if(['title','desc'].includes(current.localName))return;if(starts.has(current))offset++;for(const child of current.childNodes)visit(child);};visit(node);
    const anchor=runs.find(run=>run.start<=start&&run.end>=start);
    if(anchor){
      const stop=previous.length-tail,at=start-anchor.start;
      for(const run of runs){const a=Math.max(start,run.start)-run.start,b=Math.min(stop,run.end)-run.start;if(b>a)run.node.deleteData(a,b-a);}
      anchor.node.insertData(at,inserted);return;
    }
  }
  const path=node.querySelector('textPath');if(path){path.textContent=value;return;}
  const first=node.querySelector('tspan');if(!first&&!value.includes('\n')){node.textContent=value;return;}
  const x=first?.getAttribute('x')??node.getAttribute('x')??'0',y=parseFloat(first?.getAttribute('y')??node.getAttribute('y')??'0'),size=parseFloat(computedValue(node,'font-size'))||6,leading=lineHeight(node);
  node.replaceChildren(...value.split('\n').map((text,index)=>{const span=first?.cloneNode(false)??document.createElementNS(ns,'tspan');if(index)span.removeAttribute('id');span.removeAttribute('dy');span.setAttribute('x',x);span.setAttribute('y',String(y+index*size*leading));span.textContent=text;return span;}));
  reflow(node,size,leading,[...node.children]);
}
export function replaceSvgText(editor,node,value){
  if(value.length>5000)throw Error('文字内容最多 5000 字');editor.up();
  return editor.api.transaction('编辑文字内容',batch=>{
    const clone=node.cloneNode(true);node.after(clone);writeSvgText(clone,value);
    batch.addSubCommand(new editor.api.canvas.history.RemoveElementCommand(node,node.nextSibling,node.parentNode));node.remove();
    batch.addSubCommand(new editor.api.canvas.history.InsertElementCommand(clone));return {selection:[clone]};
  });
}
const attributes=node=>Object.fromEntries([...node.attributes].map(a=>[a.name,a.value]));
function changedAttributes(node,before){const after=attributes(node);return Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>before[k]!==after[k]).map(k=>[k,before[k]??null]));}
function inline(node,key,value){node.setAttribute(key,value);node.style.setProperty(key,['font-size','letter-spacing','word-spacing'].includes(key)?value+'px':value);}
function reflow(node,size,ratio,lines=textLines(node),directionChange=false){
  const first=lines[0];if(lines.length<2)return;
  const mode=computedValue(node,'writing-mode'),vertical=mode.startsWith('vertical'),axis=vertical?'x':'y',offset=vertical?'dx':'dy',origin=parseFloat(first.getAttribute(axis)??node.getAttribute(axis)??'0'),other=vertical?'y':'x',baseline=first.getAttribute(other)??node.getAttribute(other)??'0';
  lines.forEach((span,i)=>{if(span.closest('[data-locked="true"]'))return;if(span.hasAttribute(axis)||directionChange){span.setAttribute(axis,String(origin+i*size*ratio*(mode==='vertical-rl'?-1:1)));span.removeAttribute(offset);}else if(i)span.setAttribute(offset,String(size*ratio));if(directionChange)span.setAttribute(other,baseline);});
}
function anchorText(node,value){
  if(node.localName!=='text'||node.querySelector('textPath')||computedValue(node,'writing-mode')!=='horizontal-tb')return null;
  const box=node.getBBox(),x=box.x+box.width*({start:0,middle:.5,end:1}[value]);
  node.setAttribute('x',String(x));for(const span of textLines(node))span.setAttribute('x',String(x));
  return box.x;
}
export function applyTypography(editor,key,value){
  const allowed=['font-family','font-size','font-weight','font-style','text-decoration','text-anchor','letter-spacing','word-spacing','writing-mode','line-height'];
  if(!allowed.includes(key))throw Error('不支持的文字属性');
  const numeric=['font-size','letter-spacing','word-spacing','line-height'].includes(key);
  if(numeric){value=Number(value);const [min,max]=key==='font-size'?[.1,600]:key==='line-height'?[.1,10]:[-100,300];if(!Number.isFinite(value)||value<min||value>max)throw Error(`数值须为 ${min}–${max}`);value=String(value);}
  if(!value||String(value).length>500||normalizeSvgValue('text',key,String(value))===null)throw Error('请输入有效的文字属性（最多 500 字符）');
  if(!numeric&&!CSS.supports(key,value))throw Error('浏览器不支持此文字属性值');
  editor.up();const targets=typographyTargets(editor),selected=editor.api.canvas.getSelectedElements().filter(Boolean),active=editor.api.selected;if(!targets.length)throw Error('请先选中可编辑文字');
  const physical=['font-size','letter-spacing','word-spacing'].includes(key),values=new Map();
  if(physical)for(const root of targets)for(const node of [root,...root.querySelectorAll('tspan,textPath')])values.set(node,String(Number(value)/textPhysicalScale(editor,node,key)));
  return editor.api.transaction('文字排版',batch=>{
    for(const root of targets){
      const nodes=[root,...root.querySelectorAll('tspan,textPath')].filter(n=>!n.closest('[data-locked="true"]')),before=new Map(nodes.map(n=>[n,attributes(n)])),lines=textLines(root),ratio=key==='line-height'?Number(value):lineHeight(root),size=key==='font-size'?Number(values.get(root)):parseFloat(computedValue(lines[0]??root,'font-size'))||6;
      const anchorBefore=key==='text-anchor'?anchorText(root,value):null;
      for(const node of nodes){if(key==='line-height')node.style.setProperty(key,value);else inline(node,key,values.get(node)??value);}
      if(anchorBefore!==null){const delta=anchorBefore-root.getBBox().x;for(const node of [root,...textLines(root)])if(node.hasAttribute('x'))node.setAttribute('x',String(parseFloat(node.getAttribute('x'))+delta));}
      if(['font-size','line-height','writing-mode'].includes(key))reflow(root,size,ratio,lines,key==='writing-mode');
      for(const node of nodes){const old=changedAttributes(node,before.get(node));if(Object.keys(old).length)batch.addSubCommand(new editor.api.canvas.history.ChangeElementCommand(node,old));}
    }
    return {selection:selected,active};
  });
}
export function toggleTypography(editor,command){
  const nodes=typographyTargets(editor);if(!nodes.length)return;
  const key={bold:'font-weight',italic:'font-style',underline:'text-decoration','line-through':'text-decoration'}[command];
  const on=node=>command==='bold'?Number(computedValue(node,key))>=600:command==='italic'?computedValue(node,key)!=='normal':computedValue(node,key).includes(command);
  const leaves=typographyLeaves(nodes),all=(leaves.length?leaves:nodes).every(on),value=command==='bold'?(all?'400':'700'):command==='italic'?(all?'normal':'italic'):null;
  if(value)return applyTypography(editor,key,value);
  // Decoration flags are independent; underline does not erase strikethrough.
  editor.up();const selected=editor.api.canvas.getSelectedElements().filter(Boolean),active=editor.api.selected;return editor.api.transaction('文字装饰',batch=>{
    for(const root of nodes)for(const node of [root,...root.querySelectorAll('tspan,textPath')]){
      if(node.closest('[data-locked="true"]'))continue;const old=attributes(node),flags=new Set(computedValue(node,key).split(/\s+/).filter(v=>['underline','overline','line-through'].includes(v)));all?flags.delete(command):flags.add(command);inline(node,key,[...flags].join(' ')||'none');batch.addSubCommand(new editor.api.canvas.history.ChangeElementCommand(node,changedAttributes(node,old)));
    }
    return {selection:selected,active};
  });
}
