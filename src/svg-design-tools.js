import {svgReference} from './svg-format.js';
import {validateProject} from './project.js';

const resources='defs,linearGradient,radialGradient,clipPath,mask,pattern,marker,symbol,filter';
const drawable='path,rect,circle,ellipse,line,polygon,polyline,text,image,use';
const matrix=m=>{if(!m)throw Error('无法读取对象坐标');return new DOMMatrix([m.a,m.b,m.c,m.d,m.e,m.f]);};
const inverse=m=>{if(Math.abs(m.a*m.d-m.b*m.c)<1e-12)throw Error('对象或所在组合的缩放为零，无法排版');return m.inverse();};
const matrixText=m=>`matrix(${[m.a,m.b,m.c,m.d,m.e,m.f].map(value=>Math.abs(value)<1e-12?0:value).join(' ')})`;
const topNodes=nodes=>[...new Set(nodes)].filter(node=>!nodes.some(other=>node!==other&&other.contains(node)));
const visible=node=>{for(let p=node;p?.namespaceURI==='http://www.w3.org/2000/svg';p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0)return false;}return true;};
const editable=(node,root)=>root.contains(node)&&node!==root&&!node.closest(`[data-locked="true"],${resources}`)&&visible(node);

export function editableSvgSelection(editor){
  const root=editor.api.wrapper,nodes=topNodes(editor.api.canvas.getSelectedElements().filter(Boolean).map(node=>node.closest('tspan,textPath')?.closest('text')??node));
  if(!nodes.length)throw Error('请先选择要排版的图文');
  if(!nodes.every(node=>editable(node,root)))throw Error('请先解锁并显示选中的图文');
  return nodes;
}

const selection=editableSvgSelection;
export function svgSelectionBounds(editor,nodes=selection(editor)){
  const inv=inverse(matrix(editor.api.wrapper.getScreenCTM())),points=[];
  for(const node of nodes){
    const box=node.getBBox(),transform=inv.multiply(matrix(node.getScreenCTM()));
    for(const [x,y]of [[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]])points.push(new DOMPoint(x,y).matrixTransform(transform));
  }
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  const width=Math.max(...points.map(p=>p.x))-x,height=Math.max(...points.map(p=>p.y))-y;
  if(![x,y,width,height].every(Number.isFinite)||width<1e-8&&height<1e-8)throw Error('请选择具有尺寸的图文');
  return {x,y,width,height};
}

// Apply a sheet-space change without flattening paths, text, CSS or nested SVGs.
export function transformSvgNode(node,sheet,delta){
  const parent=inverse(matrix(node.parentElement.getScreenCTM())),world=matrix(node.getScreenCTM());
  const old={transform:node.getAttribute('transform'),style:node.getAttribute('style')};
  try{
    node.removeAttribute('transform');for(const key of ['transform','transform-origin','transform-box'])node.style.removeProperty(key);
    const intrinsic=parent.multiply(matrix(node.getScreenCTM()));
    const result=parent.multiply(sheet).multiply(delta).multiply(inverse(sheet)).multiply(world).multiply(inverse(intrinsic));
    if(!['a','b','c','d','e','f'].every(key=>Number.isFinite(result[key])))throw Error('排版坐标无效');
    node.setAttribute('transform',matrixText(result));if(!node.getAttribute('style'))node.removeAttribute('style');
  }catch(error){for(const [key,value]of Object.entries(old))value===null?node.removeAttribute(key):node.setAttribute(key,value);throw error;}
  return old;
}
const transformNode=transformSvgNode;

function remapClones(clones,canvas){
  const ids=new Map(),groups=new Map();
  for(const clone of clones)for(const node of [clone,...clone.querySelectorAll('*')]){
    if(node.id)ids.set(node.id,canvas.getNextId());
    const group=node.getAttribute('data-fold-group');if(group&&!groups.has(group))groups.set(group,'array-'+crypto.randomUUID());
  }
  const rewritten=(key,value)=>{
    const id=svgReference(key,value);if(!ids.has(id))return value;
    return key==='href'||key==='xlink:href'?'#'+ids.get(id):value.replace(/^url\([^)]*\)/i,`url(#${ids.get(id)})`);
  };
  for(const clone of clones)for(const node of [clone,...clone.querySelectorAll('*')]){
    for(const attr of [...node.attributes]){
      if(attr.name==='id')node.setAttribute('id',ids.get(attr.value));
      else if(attr.name==='data-fold-group')node.setAttribute(attr.name,groups.get(attr.value));
      else if(attr.name!=='style')node.setAttributeNS(attr.namespaceURI,attr.name,rewritten(attr.name,attr.value));
    }
    for(const key of [...node.style])node.style.setProperty(key,rewritten(key,node.style.getPropertyValue(key)),node.style.getPropertyPriority(key));
  }
  return ids;
}

export function arraySvgSelection(editor,{rows,columns,gapX,gapY}){
  rows=Number(rows);columns=Number(columns);gapX=Number(gapX);gapY=Number(gapY);
  if(!Number.isInteger(rows)||!Number.isInteger(columns)||rows<1||columns<1||rows>20||columns>20||rows*columns<2||rows*columns>100)throw Error('行列须为 1–20 的整数，总数为 2–100（含原图）');
  if(![gapX,gapY].every(value=>Number.isFinite(value)&&value>=0&&value<=1000))throw Error('间距须为 0–1000 mm');
  editor.up();const nodes=selection(editor),count=nodes.reduce((sum,node)=>sum+1+node.querySelectorAll('*').length,0);
  if(editor.api.wrapper.querySelectorAll('*').length+count*(rows*columns-1)>5900)throw Error('阵列后 SVG 元素过多，请减少行列数或简化所选图文');
  const originals=editor.project.svgGenerators,nextGenerators={...originals};
  try{
    return editor.api.transaction('阵列复制',batch=>{
      const bounds=svgSelectionBounds(editor,nodes),sheet=matrix(editor.api.wrapper.getScreenCTM()),inserted=[];
      const ordered=[...nodes].sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
      const last=new Map(ordered.map(node=>[node.parentElement,node]));
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
        if(!row&&!col)continue;
        const clones=ordered.map(node=>node.cloneNode(true)),ids=remapClones(clones,editor.api.canvas);
        for(let index=0;index<clones.length;index++){
          const clone=clones[index],source=ordered[index],parent=source.parentElement;
          last.get(parent).after(clone);last.set(parent,clone);inserted.push(clone);
          // Record insertion before measuring so a later failure rolls it back.
          batch.addSubCommand(new editor.api.canvas.history.InsertElementCommand(clone,'阵列副本'));
          transformNode(clone,sheet,new DOMMatrix().translate(col*(bounds.width+gapX),row*(bounds.height+gapY)));
        }
        for(const [oldId,newId]of ids)if(originals?.[oldId])nextGenerators[newId]={...structuredClone(originals[oldId]),id:newId};
      }
      validateProject({...editor.project,svgGenerators:nextGenerators});
      if(Object.keys(nextGenerators).length)editor.project.svgGenerators=nextGenerators;
      return {selection:[...nodes,...inserted],copies:rows*columns-1};
    });
  }catch(error){if(originals===undefined)delete editor.project.svgGenerators;else editor.project.svgGenerators=originals;throw error;}
}

export function placeSvgSelection(editor,{fit=false,margin=3}={}){
  margin=Number(margin);if(!Number.isFinite(margin)||margin<0||margin>1000)throw Error('留边须为 0–1000 mm');
  editor.up();const nodes=selection(editor),panel=editor.dieline.panels.find(p=>p.id===editor.panelId);
  if(!panel)throw Error('请先选择一个包装面板');
  const x=editor.side==='inside'?editor.dieline.minX+editor.dieline.maxX-panel.x-panel.w:panel.x;
  if(fit&&(panel.w<=2*margin||panel.h<=2*margin))throw Error('留边超过当前面板尺寸');
  return editor.api.transaction(fit?'等比适配面板':'居中到面板',batch=>{
    const bounds=svgSelectionBounds(editor,nodes),sheet=matrix(editor.api.wrapper.getScreenCTM());
    const scale=fit?Math.min((panel.w-2*margin)/bounds.width,(panel.h-2*margin)/bounds.height):1;
    const delta=new DOMMatrix().translate(x+panel.w/2,panel.y+panel.h/2).scale(scale).translate(-bounds.x-bounds.width/2,-bounds.y-bounds.height/2);
    for(const node of nodes){const old=transformNode(node,sheet,delta);batch.addSubCommand(new editor.api.canvas.history.ChangeElementCommand(node,old));}
    return {selection:nodes};
  });
}

export function selectSvgSimilar(editor,criterion){
  if(!['type','fill'].includes(criterion))throw Error('请选择填色或对象类型');
  editor.up();const root=editor.api.wrapper,node=editor.api.selected;
  if(!node||!editable(node,root))throw Error('请先选择一个可编辑对象作为参照');
  const reference=node.closest('tspan,textPath')?.closest('text')??node;
  if(criterion==='fill'&&!reference.matches(drawable.replace(',image','')))throw Error('同填色选择请以文字、路径或图形为参照');
  return editor.api.sourceStyles(()=>{
    const fill=getComputedStyle(reference).fill;
    const matches=[...root.querySelectorAll(criterion==='type'?reference.localName:drawable.replace(',image',''))].filter(candidate=>editable(candidate,root)&&(criterion==='type'||getComputedStyle(candidate).fill===fill));
    const nodes=topNodes(matches);
    if(!nodes.length)throw Error('没有找到相同对象');
    editor.api.canvas.setContext(root);editor.api.canvas.selectOnly(nodes,true);return nodes.length;
  });
}
