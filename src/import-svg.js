import {loadSVGFromString,Color,util} from 'fabric';
import {uid} from './project.js';
import {svgAssetFromMarkup} from './svg-asset.js';
import {compactSvgLayers} from './svg-merge.js';

const supported=new Set(['svg','g','defs','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','linearGradient','radialGradient','stop','clipPath','use','image','style','title','desc']);
function prepare(source){
  if(source.length>8e6)throw Error('SVG 请小于 8 MB');
  if(/<!ENTITY/i.test(source))throw Error('SVG 不支持实体声明');
  // Illustrator commonly includes an external SVG DTD. Remove the declaration
  // before XML parsing; internal subsets and custom entities remain unsupported.
  source=source.replace(/<!DOCTYPE\s+svg(?:\s+(?:PUBLIC|SYSTEM)\s+(?:"[^"]*"|'[^']*')(?:\s+(?:"[^"]*"|'[^']*'))?)?\s*>/gi,'');
  if(/<!DOCTYPE/i.test(source))throw Error('SVG 不支持内部文档类型声明');
  const doc=new DOMParser().parseFromString(source,'image/svg+xml'),root=doc.documentElement;
  if(root.localName!=='svg'||doc.querySelector('parsererror'))throw Error('SVG 文件格式无效');
  // Our exported sheet also contains paper, cut and crease paths; import its artwork.
  if(root.querySelector('metadata[data-fold-studio]')&&root.querySelector('#design')){
    const design=root.querySelector('#design');design.removeAttribute('clip-path');
    const defs=[...root.children].filter(el=>el.localName==='defs').map(el=>el.cloneNode(true));
    let content=design,parent=design.parentElement;
    while(parent&&parent!==root){const wrapper=parent.cloneNode(false),next=parent.parentElement;wrapper.appendChild(content);content=wrapper;parent=next;}
    root.replaceChildren(...defs,content);
  }
  root.querySelectorAll('metadata').forEach(el=>el.remove());
  root.querySelectorAll('*').forEach(el=>{if(el.namespaceURI&&el.namespaceURI!=='http://www.w3.org/2000/svg')el.remove();});
  let nodes=0;
  for(const el of [root,...root.querySelectorAll('*')]){
    if(++nodes>6000)throw Error('SVG 元素过多，请拆分后导入');
    if(!supported.has(el.localName))throw Error(`暂不支持 SVG 的 ${el.localName} 元素，请在原软件中展开该效果后导入`);
    for(const a of el.attributes){
      if(/^on/i.test(a.name))throw Error('SVG 包含脚本事件，无法导入');
      if(a.value.includes('\\'))throw Error('SVG 属性包含不支持的转义写法');
      if(a.localName==='href'&&!/^#[\w.:-]+$/.test(a.value)&&!(el.localName==='image'&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(a.value)))throw Error('SVG 不能引用外部资源，请先嵌入图片');
      const urls=[...a.value.matchAll(/url\s*\(([^)]*)\)/gi)];
      if(urls.some(m=>!/^['"]?#[\w.:-]+['"]?$/.test(m[1].trim())))throw Error('SVG 不能引用外部资源');
      if(a.name==='mask'||a.name==='filter')throw Error('请在原软件中展开 SVG 蒙版或滤镜后导入');
      if(a.name==='style'&&/(?:^|;)\s*(?:filter|mask)\s*:/i.test(a.value))throw Error('请在原软件中展开 SVG 蒙版或滤镜后导入');
      if(a.name==='style'&&/(?:image-set|cross-fade|image|paint)\s*\(/i.test(a.value))throw Error('SVG 样式不能引用外部资源');
      if(a.name==='letter-spacing'&&a.value==='normal')el.setAttribute(a.name,'0');
      if(a.name==='style')el.setAttribute(a.name,a.value.replace(/letter-spacing\s*:\s*normal/g,'letter-spacing:0'));
    }
    if(el.localName==='style'&&(/@|\\|expression\s*\(|(?:image-set|cross-fade|image|paint)\s*\(|(?:filter|mask)\s*:/i.test(el.textContent)||[...el.textContent.matchAll(/url\s*\(([^)]*)\)/gi)].some(m=>!/^['"]?#[\w.:-]+['"]?$/.test(m[1].trim()))))throw Error('SVG 样式不能引用外部资源或滤镜');
    if(el.localName==='style')el.textContent=el.textContent.replace(/letter-spacing\s*:\s*normal/g,'letter-spacing:0');
  }
  const ids=new Map([...root.querySelectorAll('[id]')].map(el=>[el.id,el]));
  const counts=new Map();
  function expanded(el,stack=new Set()){
    if(stack.has(el)||stack.size>40)throw Error('SVG 包含循环引用或过深的引用');
    if(counts.has(el))return counts.get(el);
    const next=new Set(stack);next.add(el);let count=1;
    if(el.localName==='use'){
      const href=[...el.attributes].find(a=>a.localName==='href')?.value,target=ids.get(href?.slice(1));
      if(!target)throw Error('SVG 包含缺失的图形引用');count+=expanded(target,next);
    }
    for(const child of el.children)count+=expanded(child,next);
    if(count>6000)throw Error('SVG 展开后的元素过多，请拆分后导入');counts.set(el,count);return count;
  }
  expanded(root);
  expandTextSpans(root);
  return new XMLSerializer().serializeToString(root);
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

// Parse off-document, then return a complete batch. The caller applies one undo step.
export async function importSvgLayers(source,{panel,side='outside',name='SVG',capacity=120,compact=true}={}){
  const input=prepare(source);await document.fonts.ready;
  const {objects,elements}=await loadSVGFromString(input);
  const list=objects.map((object,i)=>({object,element:elements[i]})).filter(x=>x.object&&x.object.visible!==false);
  try{
    if(!list.length)throw Error('SVG 中没有可导入的图文');
    const bounds=list.map(x=>x.object.getBoundingRect());
    const left=Math.min(...bounds.map(b=>b.left)),top=Math.min(...bounds.map(b=>b.top)),right=Math.max(...bounds.map(b=>b.left+b.width)),bottom=Math.max(...bounds.map(b=>b.top+b.height));
    const width=right-left,height=bottom-top;
    if(!Number.isFinite(width+height)||width<=0||height<=0)throw Error('SVG 图文尺寸无效');
    const fit=Math.min(panel.w*.8/width,panel.h*.8/height),cx=(left+right)/2,cy=(top+bottom)/2;
    let preservedText=0;
    const layers=list.map(({object:o,element:el},i)=>{
      const b=bounds[i],base={id:uid(),panel:panel.id,side,name:`${name} · ${el?.getAttribute('id')||i+1}`.slice(0,60),x:.5+((b.left+b.width/2)-cx)*fit/panel.w,y:.5+((b.top+b.height/2)-cy)*fit/panel.h,w:Math.max(.00001,b.width*fit/panel.w),h:Math.max(.00001,b.height*fit/panel.h),rotation:0,opacity:1,visible:true,color:hex(o.fill??o.stroke)};
      if(![b.left,b.top,b.width,b.height].every(Number.isFinite))throw Error('SVG 图文坐标无效');
      const d=util.qrDecompose(o.calcTransformMatrix());
      // Complex text paint, clipping and skew remain editable vector graphics.
      if(o.type==='text'&&o.text.length<=5000&&!o.clipPath&&!o.stroke&&typeof o.fill==='string'&&Math.abs(d.skewX)<.001&&Number.isFinite(o.charSpacing)&&o.charSpacing>=-100&&o.charSpacing<=1000){
        const nativeSize=o.fontSize*fit,size=Math.max(1,Math.min(100,nativeSize));
        const sx=Math.abs(d.scaleX)*nativeSize/size,sy=Math.abs(d.scaleY)*nativeSize/size;
        if(sx>=.05&&sx<=20&&sy>=.05&&sy<=20){
          const w=(o.width+.05)*size/o.fontSize*sx,h=o.height*size/o.fontSize*sy;
          return{...base,type:'text',text:o.text,name:o.text.slice(0,60),font:'custom',fontFamily:o.fontFamily,size,bold:Number(o.fontWeight)>=600||o.fontWeight==='bold',fontWeight:String(o.fontWeight),italic:o.fontStyle==='italic',underline:!!o.underline,textAlign:'left',lineHeight:o.lineHeight??1.16,charSpacing:o.charSpacing??0,textScaleX:sx,textScaleY:sy,x:.5+(d.translateX-cx)*fit/panel.w,y:.5+(d.translateY-cy)*fit/panel.h,w:w/panel.w,h:h/panel.h,rotation:d.angle,flipY:d.scaleY<0,opacity:o.opacity*new Color(o.fill).getAlpha()};
        }
      }
      if(o.type==='text')preservedText++;
      return{...base,type:'svg',svgOriginal:true,svg:svgAssetFromMarkup(o.toSVG(),[b.left,b.top,Math.max(.001,b.width),Math.max(.001,b.height)])};
    });
    const result=compact?compactSvgLayers(layers,{panels:[panel],minX:panel.x,maxX:panel.x+panel.w},undefined,{name:`${name} · 图形`.slice(0,60)}):layers;
    if(result.length>capacity)throw Error(`SVG 需要 ${result.length} 个图层，当前还可添加 ${capacity} 个；请使用精简图层或拆分后导入`);
    return{layers:result,preservedText,reduced:layers.length-result.length};
  }finally{objects.forEach(o=>o?.dispose());}
}
