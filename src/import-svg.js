import {loadSVGFromString,Color,util} from 'fabric';
import {uid} from './project.js';
import {svgAssetFromMarkup,svgAssetMarkup,validateSvgAsset} from './svg-asset.js';
import {compactSvgLayers} from './svg-merge.js';

import {normalizeSvgDocument,svgViewport,svgArtworkParts,selectSvgArtwork} from './svg-document.js';
import {svgNamespace} from './svg-format.js';

function prepare(source,{complete=false}={}){
  if(source.length>8e6)throw Error('SVG 请小于 8 MB');
  if(/<!ENTITY/i.test(source))throw Error('SVG 不支持实体声明');
  // Remove an external DTD declaration without resolving it.
  source=source.replace(/<!DOCTYPE\s+svg(?:\s+(?:PUBLIC|SYSTEM)\s+(?:"[^"]*"|'[^']*')(?:\s+(?:"[^"]*"|'[^']*'))?)?\s*>/gi,'');
  if(/<!DOCTYPE/i.test(source))throw Error('SVG 不支持内部文档类型声明');
  const parser=new DOMParser();
  let doc=parser.parseFromString(source,'image/svg+xml'),root=doc.documentElement;
  if(root.localName!=='svg'||doc.querySelector('parsererror'))throw Error('SVG 文件格式无效');
  if(!root.namespaceURI){
    doc=parser.parseFromString(root.outerHTML.replace(/^<svg\b/,`<svg xmlns="${svgNamespace}"`),'image/svg+xml');
    root=doc.documentElement;
  }
  if(root.namespaceURI!==svgNamespace)throw Error('SVG 命名空间无效');
  // An exported Fold sheet also contains paper and dieline paths.
  if(!complete&&root.querySelector('metadata[data-fold-studio]')&&root.querySelector('#design')){
    const design=root.querySelector('#design');design.removeAttribute('clip-path');
    const defs=[...root.children].filter(el=>el.localName==='defs').map(el=>el.cloneNode(true));
    let content=design,parent=design.parentElement;
    while(parent&&parent!==root){
      const wrapper=parent.cloneNode(false),next=parent.parentElement;
      wrapper.appendChild(content);content=wrapper;parent=next;
    }
    root.replaceChildren(...defs,content);
  }
  root.querySelectorAll('*').forEach(el=>{if(el.namespaceURI&&el.namespaceURI!==svgNamespace)el.remove();});
  return normalizeSvgDocument(root);
}

export function parseSvgDocument(source){
  const {tree}=prepare(source,{complete:true});
  const viewBox=svgViewport(tree);
  // Every original group, object and definition remains in this document.
  return validateSvgAsset({viewBox,nodes:[tree]});
}

export function importSvgDocument(source,{panel,side='outside',name='SVG'}={}){
  const svg=parseSvgDocument(source);
  const [, , width,height]=svg.viewBox;
  const fit=Math.min(panel.w*.8/width,panel.h*.8/height);
  return {id:uid(),type:'svg',name:name.slice(0,60),panel:panel.id,side,
    x:.5,y:.5,w:width*fit/panel.w,h:height*fit/panel.h,
    rotation:0,opacity:1,visible:true,color:'#39563c',svgOriginal:true,svg};
}

export function svgDocumentSource(svg,options={}){
  validateSvgAsset(svg);
  let markup=svgAssetMarkup(svg,{prefix:'',...options});
  if(svg.nodes.length!==1||svg.nodes[0].tag!=='svg'){
    const [x,y,width,height]=svg.viewBox;
    markup=`<svg width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">${markup}</svg>`;
  }
  return markup.replace(/^<svg\b/, `<svg xmlns="${svgNamespace}" xmlns:xlink="http://www.w3.org/1999/xlink"`);
}
// Fabric reads textContent but ignores tspan positions. Resolve the browser's
// text layout first and turn each ordinary line/style run into its own text.
function expandTextSpans(root){
  if(!root.querySelector('text tspan'))return;
  const host=document.createElement('div');host.style.cssText='all:initial;position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;width:1000px;height:1000px;contain:strict';
  const shadow=host.attachShadow({mode:'closed'}),svg=root.cloneNode(true);shadow.appendChild(svg);document.body.appendChild(host);
  const props=['font-family','font-size','font-weight','font-style','letter-spacing','text-decoration','fill','fill-opacity','stroke','stroke-width','stroke-opacity'];
  try{
    const originals=[...root.querySelectorAll('text')],measured=[...svg.querySelectorAll('text')];
    originals.forEach((text,index)=>{
      if(!text.querySelector('tspan'))return;
      const display=measured[index],walker=document.createTreeWalker(display,NodeFilter.SHOW_TEXT),runs=[];let node;
      if(!display.getNumberOfChars()){text.remove();return;}
      const pieces=[];while((node=walker.nextNode()))if(node.textContent.trim())pieces.push(node);
      // Measure each text node directly, including text after a nested tspan.
      // Presentation inheritance prevents source selectors styling these helpers.
      for(const piece of pieces){const helper=document.createElementNS('http://www.w3.org/2000/svg','tspan');helper.setAttribute('style',props.map(p=>`${p}:inherit!important`).join(';')+';opacity:1!important;display:inline!important;visibility:inherit!important;transform:none!important');piece.replaceWith(helper);helper.appendChild(piece);}
      for(const piece of pieces){
        const content=piece.textContent,span=piece.parentElement,style=getComputedStyle(span);
        if(span.closest('[rotate],[textLength]'))throw Error('请将逐字旋转或定长排版文字转为轮廓后导入');
        const run=text.cloneNode(false);run.removeAttribute('id');run.removeAttribute('dx');run.removeAttribute('dy');run.removeAttribute('style');run.removeAttribute('class');
        const leading=/^\s/.test(content)&&span.getNumberOfChars()>content.trim().length?1:0;
        const pos=span.getStartPositionOfChar(leading);run.setAttribute('x',pos.x);run.setAttribute('y',pos.y);run.setAttribute('text-anchor','start');
        for(const prop of props){const value=style.getPropertyValue(prop);if(value)run.setAttribute(prop,prop==='letter-spacing'&&value==='normal'?'0':value);}
        // Opacity on a tspan is not inherited by its containing text.
        let opacity=Number(getComputedStyle(display).opacity);for(let el=span;el!==display;el=el.parentElement)opacity*=Number(getComputedStyle(el).opacity);
        run.setAttribute('opacity',String(opacity));run.textContent=content;runs.push(run);
      }
      text.replaceWith(...runs);
    });
  }finally{host.remove();}
}
const hex=value=>typeof value==='string'?`#${new Color(value).toHex().toLowerCase()}`:'#39563c';

function textLayer(object, base, fit, panel, cx, cy) {
  if(object.type!=='text'||object.text.length>5000||object.clipPath||object.stroke||
      typeof object.fill!=='string'||!Number.isFinite(object.charSpacing)||
      object.charSpacing< -100||object.charSpacing>1000) return null;
  const color=new Color(object.fill);
  if(color.isUnrecognised||!/^(?:normal|bold|[1-9]00)$/.test(String(object.fontWeight))) return null;
  const transform=util.qrDecompose(object.calcTransformMatrix());
  if(Math.abs(transform.skewX)>=.001) return null;
  const nativeSize=object.fontSize*fit;
  const size=Math.max(1,Math.min(100,nativeSize));
  const sx=Math.abs(transform.scaleX)*nativeSize/size;
  const sy=Math.abs(transform.scaleY)*nativeSize/size;
  if(sx<.05||sx>20||sy<.05||sy>20) return null;
  return {
    ...base,type:'text',text:object.text,name:object.text.slice(0,60),
    font:'custom',fontFamily:object.fontFamily,size,
    bold:Number(object.fontWeight)>=600||object.fontWeight==='bold',
    fontWeight:String(object.fontWeight),italic:object.fontStyle==='italic',underline:!!object.underline,
    textAlign:'left',lineHeight:object.lineHeight??1.16,charSpacing:object.charSpacing,
    textScaleX:sx,textScaleY:sy,
    x:.5+(transform.translateX-cx)*fit/panel.w,y:.5+(transform.translateY-cy)*fit/panel.h,
    w:(object.width+.05)*size/object.fontSize*sx/panel.w,
    h:object.height*size/object.fontSize*sy/panel.h,
    rotation:transform.angle,flipY:transform.scaleY<0,opacity:object.opacity*color.getAlpha(),
    color:`#${color.toHex().toLowerCase()}`,
  };
}

async function importNativeArtwork(tree,{panel,side,name,capacity,compact}) {
  const viewBox=svgViewport(tree);
  const [, , width,height]=viewBox;
  const fit=Math.min(panel.w*.8/width,panel.h*.8/height);
  const base={panel:panel.id,side,x:.5,y:.5,w:width*fit/panel.w,h:height*fit/panel.h,
    rotation:0,opacity:1,visible:true,color:'#39563c'};
  const parts=svgArtworkParts(tree);
  const candidates=parts.filter(part=>part.editable);
  const viewport=node=>({...node,attrs:{...node.attrs,x:'0',y:'0',width:String(width),height:String(height)}});
  const promoted=new Map();
  if(candidates.length){
    const selection=selectSvgArtwork(tree,new Set(candidates.map(part=>part.node)),false);
    const markup=svgAssetMarkup({nodes:[viewport(selection)]});
    const doc=new DOMParser().parseFromString(markup.replace(/^<svg\b/,`<svg xmlns="${svgNamespace}"`),'image/svg+xml');
    [...doc.querySelectorAll('text')].forEach((element,index)=>element.setAttribute('data-fold-import-text',index));
    expandTextSpans(doc.documentElement);
    const {objects,elements}=await loadSVGFromString(new XMLSerializer().serializeToString(doc.documentElement));
    const rejected=new Set();
    try{
      for(const [index,object] of objects.entries()){
        const id=elements[index]?.getAttribute('data-fold-import-text');
        const part=id===null||id===undefined ? null : candidates[Number(id)];
        if(!part)continue;
        object?.setCoords();
        const b=object?.getBoundingRect();
        const inside=b&&b.left>=0&&b.top>=0&&b.left+b.width<=width&&b.top+b.height<=height;
        const layer=inside&&object.visible&&textLayer(object,{...base,id:uid()},fit,panel,width/2,height/2);
        if(!layer){rejected.add(part);continue;}
        if(!promoted.has(part))promoted.set(part,[]);
        promoted.get(part).push(layer);
      }
    }finally{objects.forEach(object=>object?.dispose());}
    for(const part of rejected)promoted.delete(part);
  }
  const batches=[];
  for(const part of parts){
    const text=promoted.get(part);
    if(text){batches.push(...text);continue;}
    const last=batches.at(-1);
    if(compact&&Array.isArray(last))last.push(part.node);
    else batches.push([part.node]);
  }
  if(!batches.length)throw Error('SVG 中没有可导入的图文');
  if(batches.length>capacity)throw Error(`SVG 需要 ${batches.length} 个图层，当前还可添加 ${capacity} 个；请使用精简图层或拆分后导入`);
  let totalBytes=0;
  const layers=batches.map((batch,index)=>{
    if(!Array.isArray(batch))return batch;
    const selection=viewport(selectSvgArtwork(tree,new Set(batch)));
    selection.css={...selection.css,isolation:'isolate'};
    selection.attrs.overflow='hidden';
    const svg=validateSvgAsset({viewBox,nodes:[selection]});
    totalBytes+=JSON.stringify(svg).length;
    if(totalBytes>16e6)throw Error('SVG 图层引用占用过大，请使用精简图层或拆分后导入');
    return {...base,id:uid(),name:`${name} · ${batch[0].attrs.id||`图形 ${index+1}`}`.slice(0,60),
      type:'svg',svgOriginal:true,svg};
  });
  return {layers,preservedText:0,reduced:Math.max(0,parts.length-layers.length),native:true};
}

// Parse off-document, then return a complete batch. The caller applies one undo step.
export async function importSvgLayers(source,{panel,side='outside',name='SVG',capacity=120,compact=true}={}){
  const {root,tree,native}=prepare(source);
  await document.fonts.ready;
  if(native)return importNativeArtwork(tree,{panel,side,name,capacity,compact});
  expandTextSpans(root);
  const input=new XMLSerializer().serializeToString(root);
  const {objects,elements}=await loadSVGFromString(input);
  const list=objects.map((object,i)=>({object,element:elements[i]})).filter(x=>x.object&&x.object.visible!==false);
  try{
    if(!list.length)throw Error('SVG 中没有可导入的图文');
    const bounds=list.map(x=>{x.object.setCoords();return x.object.getBoundingRect();});
    const left=Math.min(...bounds.map(b=>b.left)),top=Math.min(...bounds.map(b=>b.top)),right=Math.max(...bounds.map(b=>b.left+b.width)),bottom=Math.max(...bounds.map(b=>b.top+b.height));
    const width=right-left,height=bottom-top;
    if(!Number.isFinite(width+height)||width<=0||height<=0)throw Error('SVG 图文尺寸无效');
    const fit=Math.min(panel.w*.8/width,panel.h*.8/height),cx=(left+right)/2,cy=(top+bottom)/2;
    let preservedText=0;
    const layers=list.map(({object:o,element:el},i)=>{
      const b=bounds[i],base={id:uid(),panel:panel.id,side,name:`${name} · ${el?.getAttribute('id')||i+1}`.slice(0,60),x:.5+((b.left+b.width/2)-cx)*fit/panel.w,y:.5+((b.top+b.height/2)-cy)*fit/panel.h,w:Math.max(.00001,b.width*fit/panel.w),h:Math.max(.00001,b.height*fit/panel.h),rotation:0,opacity:1,visible:true,color:hex(o.fill??o.stroke)};
      if(![b.left,b.top,b.width,b.height].every(Number.isFinite))throw Error('SVG 图文坐标无效');
      const text=textLayer(o,base,fit,panel,cx,cy);
      if(text)return text;
      if(o.type==='text')preservedText++;
      return{...base,type:'svg',svgOriginal:true,svg:svgAssetFromMarkup(o.toSVG(),[b.left,b.top,Math.max(.001,b.width),Math.max(.001,b.height)])};
    });
    const result=compact?compactSvgLayers(layers,{panels:[panel],minX:panel.x,maxX:panel.x+panel.w},undefined,{name:`${name} · 图形`.slice(0,60)}):layers;
    if(result.length>capacity)throw Error(`SVG 需要 ${result.length} 个图层，当前还可添加 ${capacity} 个；请使用精简图层或拆分后导入`);
    return{layers:result,preservedText,reduced:layers.length-result.length};
  }finally{objects.forEach(o=>o?.dispose());}
}
