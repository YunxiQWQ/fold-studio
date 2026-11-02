import {proofColor} from './color.js';
// A small, JSON-only SVG vocabulary. Projects never contain executable markup.
const tags=new Set(['g','path','rect','circle','ellipse','line','polygon','polyline','defs','linearGradient','radialGradient','stop','clipPath','text','tspan','image']);
const attributes=new Set(('id transform d x y x1 y1 x2 y2 cx cy r rx ry width height points fill fill-rule fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity clip-path clip-rule clipPathUnits gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity fx fy fr font-family font-size font-weight font-style text-anchor text-decoration letter-spacing dx dy xml:space paint-order vector-effect href xlink:href preserveAspectRatio').split(' '));
const inlineImage=/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=\s]+$/;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

function validAttribute(tag,key,value){
  if(!attributes.has(key)||typeof value!=='string'||value.length>8e6||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))return false;
  if(key==='href'||key==='xlink:href')return tag==='image'&&inlineImage.test(value);
  if(/url\s*\(/i.test(value)&&!/^url\(#[a-zA-Z0-9_.:-]+\)$/.test(value))return false;
  if(key==='id'&&!/^[a-zA-Z0-9_.:-]+$/.test(value))return false;
  return true;
}
export function validateSvgAsset(asset){
  if(!asset||!Array.isArray(asset.viewBox)||asset.viewBox.length!==4||asset.viewBox.some(n=>!Number.isFinite(n)||Math.abs(n)>1e8)||asset.viewBox[2]<=0||asset.viewBox[3]<=0||!Array.isArray(asset.nodes))throw Error('SVG 图形范围无效');
  let count=0,chars=0;const ids=new Set(),refs=[];
  function visit(node,depth=0){
    if(typeof node==='string'){chars+=node.length;return;}
    if(!node||!tags.has(node.tag)||!node.attrs||typeof node.attrs!=='object'||Array.isArray(node.attrs)||!Array.isArray(node.children)||++count>24000||depth>64)throw Error('SVG 图形结构无效或过于复杂');
    if(node.recolor!==undefined&&!/^#[a-f0-9]{6}$/i.test(node.recolor))throw Error('SVG 合并图形颜色无效');
    for(const [key,value]of Object.entries(node.attrs)){
      if(!validAttribute(node.tag,key,value))throw Error('SVG 图形包含不支持的属性');chars+=value.length;
      if(key==='id'){if(ids.has(value))throw Error('SVG 图形编号重复');ids.add(value);}
      const ref=value.match(/^url\(#([^)]*)\)$/);if(ref)refs.push(ref[1]);
    }
    for(const child of node.children)visit(child,depth+1);
  }
  asset.nodes.forEach(n=>visit(n));if(!count||chars>8e6||refs.some(id=>!ids.has(id)))throw Error('SVG 图形过大或引用不完整');
  return asset;
}
export function svgAssetFromMarkup(markup,viewBox){
  const root=new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${markup}</svg>`,'image/svg+xml');
  if(root.querySelector('parsererror'))throw Error('SVG 图形解析失败');
  function read(el){
    if(el.nodeType===3)return el.textContent;
    if(el.nodeType!==1)return null;
    if(!tags.has(el.localName))throw Error(`SVG 不支持 ${el.localName} 元素`);
    const attrs={};
    for(const a of el.attributes){
      if(a.name==='style'){
        for(const part of a.value.split(';')){const i=part.indexOf(':');if(i<0)continue;const k=part.slice(0,i).trim(),v=part.slice(i+1).trim();if(attributes.has(k))attrs[k]=v;}
      }else if(attributes.has(a.name))attrs[a.name]=a.value;
    }
    return{tag:el.localName,attrs,children:[...el.childNodes].map(read).filter(n=>n!==null)};
  }
  return validateSvgAsset({viewBox,nodes:[...root.documentElement.childNodes].map(read).filter(n=>n!==null)});
}
export function copySvgNodes(asset,{prefix='asset-',color=null}={}){
  const rewritten=value=>value.replace(/url\(#([^)]*)\)/g,(_,id)=>`url(#${prefix}${id})`);
  function write(n,inDefs=false){
    if(typeof n==='string')return n;
    const defs=inDefs||['defs','clipPath'].includes(n.tag),attrs={...n.attrs};
    if(attrs.id)attrs.id=prefix+attrs.id;
    if(color&&!defs){for(const key of ['fill','stroke'])if(attrs[key]&&attrs[key]!=='none'&&attrs[key]!=='transparent')attrs[key]=color;}
    return{tag:n.tag,attrs:Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,rewritten(v)])),children:n.children.map(c=>write(c,defs)),...(n.recolor?{recolor:n.recolor}:{})};
  }
  return asset.nodes.map(n=>write(n));
}
export function svgAssetMarkup(asset,{colorMode='rgb',...options}={}){
  function write(n,inherited=null,inDefs=false){
    if(typeof n==='string')return escape(n);
    const defs=inDefs||['defs','clipPath'].includes(n.tag),paint=options.color??inherited??(n.recolor?proofColor(n.recolor,colorMode):null),attrs={...n.attrs};
    if(paint&&!defs)for(const key of ['fill','stroke'])if(attrs[key]&&attrs[key]!=='none'&&attrs[key]!=='transparent')attrs[key]=paint;
    return `<${n.tag}${Object.entries(attrs).map(([k,v])=>` ${k}="${escape(v)}"`).join('')}>${n.children.map(c=>write(c,paint,defs)).join('')}</${n.tag}>`;
  }
  return copySvgNodes(asset,options).map(n=>write(n)).join('');
}
const sourceCache=new WeakMap();
export function svgLayerSource(layer,color=null,colorMode='rgb'){
  const paint=color??(layer.svgOriginal!==false?null:proofColor(layer.color,colorMode)),key=`${colorMode}:${paint??'original'}`;let entries=sourceCache.get(layer.svg);
  if(!entries){entries=new Map();sourceCache.set(layer.svg,entries);}
  if(!entries.has(key)){
    const [x,y,w,h]=layer.svg.viewBox,markup=svgAssetMarkup(layer.svg,{color:paint,colorMode});
    entries.set(key,`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.min(4096,Math.max(1,w))}" height="${Math.min(4096,Math.max(1,h))}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="none">${markup}</svg>`)}`);
    if(entries.size>4)entries.delete(entries.keys().next().value);
  }
  return entries.get(key);
}
