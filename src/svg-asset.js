import {proofColor} from './color.js';
import {svgTags as tags,svgAttributes as attributes,cssOnlyProperties,definitionTags,normalizeSvgValue,svgReference} from './svg-format.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

export function validateSvgAsset(asset){
  if(!asset||!Array.isArray(asset.viewBox)||asset.viewBox.length!==4||asset.viewBox.some(n=>!Number.isFinite(n)||Math.abs(n)>1e8)||asset.viewBox[2]<=0||asset.viewBox[3]<=0||!Array.isArray(asset.nodes))throw Error('SVG 图形范围无效');
  let count=0,chars=0;const ids=new Map(),refs=new Map();
  function visit(node,depth=0){
    if(typeof node==='string'){chars+=node.length;return;}
    if(!node||!tags.has(node.tag)||!node.attrs||typeof node.attrs!=='object'||Array.isArray(node.attrs)||!Array.isArray(node.children)||++count>24000||depth>64)throw Error('SVG 图形结构无效或过于复杂');
    if(node.recolor!==undefined&&!/^#[a-f0-9]{6}$/i.test(node.recolor))throw Error('SVG 合并图形颜色无效');
    if(node.name!==undefined&&(typeof node.name!=='string'||node.name.length>300))throw Error('SVG 图层名称无效');
    const links=[];
    for(const [key,value]of Object.entries(node.attrs)){
      if(!attributes.has(key)||normalizeSvgValue(node.tag,key,value)===null)throw Error(`SVG 图形属性无效：${key}`);
      chars+=value.length;
      if(key==='id'){if(ids.has(value))throw Error('SVG 图形编号重复');ids.set(value,node);}
      const ref=svgReference(key,value);if(ref)links.push(ref);
    }
    if(node.css!==undefined){
      if(!node.css||typeof node.css!=='object'||Array.isArray(node.css))throw Error('SVG 样式无效');
      for(const [key,value]of Object.entries(node.css)){
        if(!cssOnlyProperties.has(key)||normalizeSvgValue(node.tag,key,value)===null)throw Error(`SVG 样式无效：${key}`);
        chars+=value.length;
      }
    }
    if(node.tag==='filter'&&node.children.length>64)throw Error('SVG 单个滤镜最多支持 64 个步骤');
    if(node.tag==='feTurbulence'&&Number(node.attrs.numOctaves)>8)throw Error('SVG 湍流滤镜最多支持 8 层细节');
    refs.set(node,links);
    for(const child of node.children)visit(child,depth+1);
  }
  asset.nodes.forEach(n=>visit(n));
  if(!count||chars>8e6)throw Error('SVG 图形过大或没有内容');
  const pending=new Set(),sizes=new Map();
  function expandedSize(node){
    if(typeof node==='string')return 0;
    if(pending.has(node)||pending.size>64)throw Error('SVG 包含循环引用或过深的引用');
    if(sizes.has(node))return sizes.get(node);
    pending.add(node);
    let size=1;
    for(const id of refs.get(node)){
      if(!ids.has(id))throw Error(`SVG 缺少引用 #${id}`);
      size+=expandedSize(ids.get(id));
    }
    for(const child of node.children)size+=expandedSize(child);
    pending.delete(node);
    if(size>100000)throw Error('SVG 引用展开后过于复杂');
    sizes.set(node,size);
    return size;
  }
  if(asset.nodes.reduce((sum,node)=>sum+expandedSize(node),0)>100000)throw Error('SVG 引用展开后过于复杂');
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
  function rewritten(key,value){
    const id=svgReference(key,value);
    if(!id)return value;
    if(key==='href'||key==='xlink:href')return `#${prefix}${id}`;
    return value.replace(/^url\([^)]*\)/i,`url(#${prefix}${id})`);
  }
  function write(n,inDefs=false){
    if(typeof n==='string')return n;
    const defs=inDefs||definitionTags.has(n.tag),attrs={...n.attrs};
    if(attrs.id)attrs.id=prefix+attrs.id;
    if(attrs['data-fold-group'])attrs['data-fold-group']=prefix+attrs['data-fold-group'];
    if(color&&!defs){for(const key of ['fill','stroke'])if(attrs[key]&&attrs[key]!=='none'&&attrs[key]!=='transparent')attrs[key]=color;}
    return{tag:n.tag,attrs:Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,rewritten(k,v)])),children:n.children.map(c=>write(c,defs)),...(n.name?{name:n.name}:{}),...(n.css?{css:{...n.css}}:{}),...(n.recolor?{recolor:n.recolor}:{})};
  }
  return asset.nodes.map(n=>write(n));
}
export function svgAssetMarkup(asset,{colorMode='rgb',...options}={}){
  function write(n,inherited=null,inDefs=false){
    if(typeof n==='string')return escape(n);
    const defs=inDefs||definitionTags.has(n.tag),paint=options.color??inherited??(n.recolor?proofColor(n.recolor,colorMode):null),attrs={...n.attrs};
    if(paint&&!defs)for(const key of ['fill','stroke'])if(attrs[key]&&attrs[key]!=='none'&&attrs[key]!=='transparent')attrs[key]=paint;
    if(options.proofNative&&colorMode==='cmyk'&&!inDefs&&!['defs','mask','clipPath','filter'].includes(n.tag)){
      for(const key of ['fill','stroke','color','stop-color'])if(/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(attrs[key]??''))attrs[key]=proofColor(attrs[key],colorMode);
    }
    if(n.css)attrs.style=Object.entries(n.css).map(([key,value])=>`${key}:${value}`).join(';');
    if(n.name)attrs['data-name']=n.name;
    const title=n.name&&n.tag==='g'&&!n.children.some(child=>typeof child==='object'&&child.tag==='title')?`<title>${escape(n.name)}</title>`:'';
    return `<${n.tag}${Object.entries(attrs).map(([k,v])=>` ${k}="${escape(v)}"`).join('')}>${title}${n.children.map(c=>write(c,paint,defs)).join('')}</${n.tag}>`;
  }
  return copySvgNodes(asset,options).map(n=>write(n)).join('');
}
const sourceCache=new WeakMap();
export function svgLayerSource(layer,color=null,colorMode='rgb'){
  const paint=color??(layer.svgOriginal!==false?null:proofColor(layer.color,colorMode)),key=`${colorMode}:${paint??'original'}`;let entries=sourceCache.get(layer.svg);
  if(!entries){entries=new Map();sourceCache.set(layer.svg,entries);}
  if(!entries.has(key)){
    const [x,y,w,h]=layer.svg.viewBox,markup=svgAssetMarkup(layer.svg,{color:paint,colorMode,proofNative:layer.proofNative});
    entries.set(key,`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.min(4096,Math.max(1,w))}" height="${Math.min(4096,Math.max(1,h))}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="none">${markup}</svg>`)}`);
    if(entries.size>4)entries.delete(entries.keys().next().value);
  }
  return entries.get(key);
}
