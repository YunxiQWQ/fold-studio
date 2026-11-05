import {svgNamespace,svgTags,svgAttributes,definitionTags,presentationProperties,cssOnlyProperties,normalizeSvgValue,svgReference} from './svg-format.js';
import {validateSvgAsset} from './svg-asset.js';

const metadata = /^(?:xmlns(?::.*)?|data-.*|aria-.*|class|role|version|baseProfile|focusable)$/;
const nativeTags = new Set('mask pattern marker symbol use filter textPath image clipPath'.split(' '));
const nativeAttributes = new Set('mask mask-type filter marker-start marker-mid marker-end textLength rotate dominant-baseline alignment-baseline baseline-shift word-spacing writing-mode direction vector-effect fr'.split(' '));
const properties = new Set([...presentationProperties, ...cssOnlyProperties]);

function checkDeclarationNames(source) {
  const clean=source.replace(/\/\*[\s\S]*?\*\//g,'');
  for(const declaration of clean.split(';')){
    const separator=declaration.indexOf(':');
    if(separator<0){if(declaration.trim())throw Error('SVG 样式声明格式无效');continue;}
    const name=declaration.slice(0,separator).trim().toLowerCase();
    if(!properties.has(name)&&!['font','mask','mask-image'].includes(name)){
      throw Error(`暂不支持 SVG 样式 ${name}`);
    }
  }
}

function cssDeclarations(style, tag) {
  const declarations = [];
  const mask = style.getPropertyValue('mask');
  const maskImage = style.getPropertyValue('mask-image');
  for (const key of style) {
    if(key.startsWith('-webkit-mask-')&&mask) continue;
    if (key === 'mask-image' || (key.startsWith('mask-') && key !== 'mask-type' && mask)) continue;
    if (!properties.has(key)) throw Error(`暂不支持 SVG 样式 ${key}`);
    const raw=style.getPropertyValue(key);
    const value = normalizeSvgValue(tag, key, key==='letter-spacing'&&raw==='normal'?'0':raw);
    if (value === null) throw Error(`SVG 样式 ${key} 使用了不支持的值或外部资源`);
    declarations.push([key, value, style.getPropertyPriority(key)]);
  }
  if (mask || maskImage) {
    const value = normalizeSvgValue(tag, 'mask', maskImage || mask);
    if (value === null) throw Error('SVG 蒙版样式只支持单个文件内引用');
    declarations.push(['mask', value, style.getPropertyPriority('mask-image')]);
  }
  return declarations;
}

// Resolve static selectors with the browser cascade, using numeric tokens.
// The measurement tree never receives source CSS values or resource URLs.
function resolveStyles(root, elements, styles, inline) {
  if (!styles.length && !inline.size) return new Map();
  const tokens = [];
  const encode = declarations => declarations.map(([key, value, priority]) => {
    const index = tokens.push(value) - 1;
    return `--fold-svg-${key}:${index}${priority ? '!important' : ''}`;
  }).join(';');
  const rules = styles.map(rule => {
    const selector = rule.selectorText.replace(/:root\b/g, '[data-fold-svg-root]');
    return `${selector}{${encode(cssDeclarations(rule.style, 'g'))}}`;
  });
  const clone = root.cloneNode(true);
  const clones = [clone, ...clone.querySelectorAll('*')];
  clone.setAttribute('data-fold-svg-root', '');
  clones.forEach((element, index) => {
    for (const attr of [...element.attributes]) {
      if (attr.localName === 'href' || attr.name === 'style' || svgReference(attr.name, attr.value)) {
        element.removeAttributeNode(attr);
      }
    }
    const style = inline.get(elements[index]);
    if (style) element.setAttribute('style', encode(style));
  });
  const host = document.createElement('div');
  host.hidden = true;
  const shadow = host.attachShadow({mode:'closed'});
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`:where(*){${[...properties].map(key => `--fold-svg-${key}:initial`).join(';')}}${rules.join('\n')}`);
  shadow.adoptedStyleSheets = [sheet];
  shadow.appendChild(clone);
  document.body.appendChild(host);
  try {
    const result = new Map();
    clones.forEach((element, index) => {
      const style = getComputedStyle(element);
      const declared = [];
      for (const key of properties) {
        const token = style.getPropertyValue(`--fold-svg-${key}`).trim();
        if (token) declared.push([key, tokens[Number(token)]]);
      }
      if (declared.length) result.set(elements[index], declared);
    });
    return result;
  } finally {
    host.remove();
  }
}

function parseStyleSheet(source) {
  if (/@|\\|:host|::|:(?:hover|active|focus(?:-within|-visible)?|visited|target)\b/i.test(source)) {
    throw Error('SVG 样式仅支持静态选择器，不能包含 @ 规则、转义或交互状态');
  }
  for(const block of source.matchAll(/\{([^{}]*)\}/g))checkDeclarationNames(block[1]);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(source);
  if (sheet.cssRules.length > 500) throw Error('SVG 样式规则过多');
  return [...sheet.cssRules];
}

function readNode(element, css) {
  const attrs = Object.fromEntries([...element.attributes].filter(a => svgAttributes.has(a.name)).map(a => [a.name, a.value]));
  const children = [...element.childNodes].flatMap(child => {
    if (child.nodeType === 1) return [readNode(child, css)];
    if (child.nodeType === 3 || child.nodeType === 4) return [child.nodeValue];
    return [];
  });
  const style = css.get(element);
  const label=element.getAttribute('inkscape:label')||element.getAttribute('data-name');
  return {tag:element.localName, attrs, children, ...(label ? {name:label.slice(0,300)} : {}), ...(style ? {css:style} : {})};
}

function normalizeFixedStrokes(root, elements, css) {
  const fixed=elements.filter(element=>element.getAttribute('vector-effect')==='non-scaling-stroke');
  if(!fixed.length)return;
  const viewport=svgViewport({attrs:Object.fromEntries([...root.attributes].map(a=>[a.name,a.value]))});
  const clone=root.cloneNode(true),clones=[clone,...clone.querySelectorAll('*')];
  clone.setAttribute('width',viewport[2]);
  clone.setAttribute('height',viewport[3]);
  for(const [index,element]of elements.entries()){
    const styles=css.get(element);
    if(styles)clones[index].setAttribute('style',Object.entries(styles).map(([key,value])=>`${key}:${value}`).join(';'));
  }
  const host=document.createElement('div');
  host.style.cssText='all:initial;position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  host.attachShadow({mode:'closed'}).appendChild(clone);
  document.body.appendChild(host);
  try{
    for(const element of fixed){
      if(element.closest('defs,symbol,marker,pattern,mask,clipPath')){
        throw Error('暂不支持复用定义中的 non-scaling-stroke，请先展开复用图形');
      }
      const measured=clones[elements.indexOf(element)],matrix=measured.getScreenCTM();
      const sx=matrix&&Math.hypot(matrix.a,matrix.b),sy=matrix&&Math.hypot(matrix.c,matrix.d);
      const skew=matrix&&Math.abs(matrix.a*matrix.c+matrix.b*matrix.d);
      if(!sx||!sy||Math.abs(sx-sy)>Math.max(sx,sy)*1e-5||skew>sx*sy*1e-5){
        throw Error('暂不支持非等比或斜切变换的 non-scaling-stroke，请先扩展描边');
      }
      const style=getComputedStyle(measured);
      if([style.strokeWidth,style.strokeDasharray,style.strokeDashoffset].some(value=>value.includes('%'))){
        throw Error('固定描边的宽度和虚线请使用绝对长度');
      }
      element.setAttribute('stroke-width',String(parseFloat(style.strokeWidth)/sx));
      element.setAttribute('stroke-dashoffset',String(parseFloat(style.strokeDashoffset)/sx));
      if(style.strokeDasharray!=='none'){
        element.setAttribute('stroke-dasharray',style.strokeDasharray.split(/[,\s]+/).map(value=>parseFloat(value)/sx).join(' '));
      }
      element.removeAttribute('vector-effect');
    }
  }finally{host.remove();}
}

export function normalizeSvgDocument(root) {
  const styles = [...root.querySelectorAll('style')].flatMap(el => parseStyleSheet(el.textContent));
  root.querySelectorAll('style, metadata').forEach(el => el.remove());
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 6000 || styles.length > 500) throw Error('SVG 元素或样式规则过多，请拆分后导入');
  const inline = new Map();
  const css = new Map();
  let native = false;
  for (const element of elements) {
    const tag = element.localName;
    if (!svgTags.has(tag)) throw Error(`暂不支持 SVG 元素 <${tag}>`);
    if (nativeTags.has(tag) || element.prefix || (tag === 'svg' && element !== root)) native = true;
    for (const attr of [...element.attributes]) {
      const key = attr.name;
      if (/^on/i.test(key)) throw Error('SVG 包含脚本事件');
      if (key === 'style') {
        if (/\\|@/.test(attr.value)) throw Error('SVG 内联样式包含不支持的写法');
        checkDeclarationNames(attr.value);
        const style = document.createElementNS(svgNamespace, 'g').style;
        style.cssText = attr.value;
        inline.set(element, cssDeclarations(style, tag));
      } else if (cssOnlyProperties.has(key) && key !== 'transform') {
        const value = normalizeSvgValue(tag, key, key==='letter-spacing'&&attr.value==='normal'?'0':attr.value);
        if (value === null) throw Error(`SVG 属性 ${key} 无效`);
        css.set(element, {...css.get(element), [key]:value});
      } else if (svgAttributes.has(key)) {
        const value = normalizeSvgValue(tag, key, attr.value);
        if (value === null) throw Error(`SVG 属性 ${key} 使用了不支持的值或外部资源`);
        attr.value = value;
      } else if (!metadata.test(key) && !attr.prefix && key !== 'enable-background') {
        throw Error(`暂不支持 SVG 属性 ${key}`);
      } else if (key === 'xml:base' || attr.localName === 'href') {
        throw Error(`SVG 属性 ${key} 可能引用外部资源`);
      }
    }
  }
  const resolved = resolveStyles(root, elements, styles, inline);
  for (const element of elements) {
    element.removeAttribute('style');
    for (const [key, value] of resolved.get(element) ?? []) {
      if (cssOnlyProperties.has(key)) css.set(element, {...css.get(element), [key]:value});
      else element.setAttribute(key, value);
    }
    for (const attr of element.attributes) {
      if (nativeAttributes.has(attr.name) || ['currentColor','inherit','initial','unset','revert','revert-layer'].includes(attr.value) ||
          (['x','y','cx','cy','r','rx','ry','width','height','font-size'].includes(attr.name) && attr.value.endsWith('%') && element !== root)) native = true;
    }
    if (element.localName === 'g' && Number(element.getAttribute('opacity') ?? 1) !== 1) native = true;
    if (css.has(element)) native = true;
  }
  normalizeFixedStrokes(root,elements,css);
  const tree = readNode(root, css);
  validateSvgAsset({viewBox:[0,0,1,1],nodes:[tree]});
  return {root, tree, native};
}

const unitScale = {px:1, in:96, cm:96/2.54, mm:96/25.4, q:96/101.6, pt:96/72, pc:16};
function length(value) {
  if (value === undefined || value === 'auto' || value.endsWith('%')) return null;
  const match = value.match(/^([+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?)(px|in|cm|mm|q|pt|pc)?$/i);
  if (!match) throw Error('SVG 画布尺寸请使用数字、百分比或标准长度单位');
  return Number(match[1]) * unitScale[match[2]?.toLowerCase() ?? 'px'];
}

export function svgViewport(tree) {
  const box = tree.attrs.viewBox?.trim().split(/[\s,]+/).map(Number);
  if (box && (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0)) throw Error('SVG viewBox 无效');
  let width = length(tree.attrs.width);
  let height = length(tree.attrs.height);
  if (width === null) width = box ? (height === null ? box[2] : height * box[2]/box[3]) : 300;
  if (height === null) height = box ? width * box[3]/box[2] : 150;
  if (![width,height].every(n => Number.isFinite(n) && n > 0 && n <= 1e6)) throw Error('SVG 画布尺寸无效或过大');
  return [0,0,width,height];
}

export function svgArtworkParts(tree) {
  const ids = new Map(), references = new Set();
  let blend = false;
  function visit(node, defined=false) {
    if (typeof node === 'string') return;
    const definition = defined || definitionTags.has(node.tag);
    if (node.attrs.id) ids.set(node.attrs.id, definition);
    for (const [key,value] of Object.entries(node.attrs)) {
      const id = svgReference(key,value);
      if (id) references.add(id);
    }
    blend ||= Boolean(node.css?.['mix-blend-mode'] && node.css['mix-blend-mode'] !== 'normal');
    for (const child of node.children) visit(child, definition);
  }
  visit(tree);
  const atomic = node => ['mask','filter','clip-path'].some(key => node.attrs[key] && node.attrs[key] !== 'none') ||
    Number(node.attrs.opacity ?? 1) !== 1 || !!node.css;
  if (blend || atomic(tree) || [...references].some(id => !ids.get(id))) return [{node:tree, editable:false}];

  const parts = [];
  const plainText = node => {
    if(typeof node==='string')return true;
    if(!['text','tspan'].includes(node.tag))return false;
    if(Object.keys(node.css??{}).some(key=>!['white-space','white-space-collapse','text-wrap-mode','text-wrap-style','text-decoration-thickness'].includes(key)))return false;
    const complex = ['mask','filter','clip-path','textLength','rotate','word-spacing','writing-mode',
      'direction','dominant-baseline','baseline-shift','alignment-baseline','lengthAdjust'];
    if(complex.some(key=>node.attrs[key]!==undefined&&node.attrs[key]!=='none'))return false;
    if(['x','y','dx','dy'].some(key=>node.attrs[key]?.trim().split(/[\s,]+/).length>1))return false;
    return node.children.every(plainText);
  };
  function collect(node,relativeFont=false) {
    if (typeof node === 'string' || definitionTags.has(node.tag) || ['title','desc'].includes(node.tag) || node.attrs.display === 'none') return;
    relativeFont ||= /%|(?:em|ex|rem|ch)$/.test(node.attrs['font-size']??'');
    if (node.tag === 'g' && !atomic(node)) {
      for (const child of node.children) collect(child,relativeFont);
    } else {
      parts.push({node, editable:node.tag==='text'&&!relativeFont&&plainText(node)});
    }
  }
  for (const child of tree.children) collect(child,/%|(?:em|ex|rem|ch)$/.test(tree.attrs['font-size']??''));
  return parts;
}

// Keep definitions at their original positions so inherited paint and units
// remain available even when adjacent artwork becomes a separate layer.
export function selectSvgArtwork(tree, included, definitions=true) {
  function prune(node) {
    if (typeof node === 'string') return null;
    if (definitionTags.has(node.tag)) return definitions ? node : null;
    if (included.has(node)) return node;
    const children = node.children.map(prune).filter(Boolean);
    return children.length || node === tree ? {...node,children} : null;
  }
  const selected=prune(tree);
  if(!definitions)return selected;
  const byId=new Map(),needed=new Set(),queue=[];
  function scan(node,inDefinition=false){
    if(typeof node==='string')return;
    if(node.attrs.id)byId.set(node.attrs.id,node);
    const defined=inDefinition||definitionTags.has(node.tag);
    if(!defined||['defs','g'].includes(node.tag))for(const [key,value]of Object.entries(node.attrs)){
      const id=svgReference(key,value);
      if(id)queue.push(id);
    }
    for(const child of node.children)scan(child,defined);
  }
  scan(selected);
  function references(node){
    if(typeof node==='string')return;
    for(const [key,value]of Object.entries(node.attrs)){
      const id=svgReference(key,value);
      if(id)queue.push(id);
    }
    for(const child of node.children)references(child);
  }
  for(let index=0;index<queue.length;index++){
    const id=queue[index];
    if(needed.has(id))continue;
    needed.add(id);
    const target=byId.get(id);
    if(target)references(target);
  }
  function removeUnused(node,inDefinition=false){
    if(typeof node==='string')return node;
    if(needed.has(node.attrs.id))return node;
    const defined=inDefinition||definitionTags.has(node.tag);
    const children=node.children.map(child=>removeUnused(child,defined)).filter(child=>child!==null);
    if(defined&&!children.some(child=>typeof child!=='string'))return null;
    return {...node,children};
  }
  return removeUnused(selected);
}
