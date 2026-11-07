import {cutSegments,creasePaths} from './geometry.js';
import {drawLayer,ImageCache} from './artwork.js';
import {printRegions,regionPath} from './artwork-space.js';
import {sideOf,surfaceOf,SIDES} from './project.js';
import {ArtworkText,textOptions} from './text-layout.js';
import {textGeometry} from './text-transform.js';
import {svgAssetMarkup} from './svg-asset.js';
import {proofColor} from './color.js';
import {escapeHtml} from './icons.js';
import {svgSceneLayers} from './svg-scene.js';
import {proofSvgSource} from './export-svg-color.js';

const xml=value=>escapeHtml(String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,''));
const number=value=>{
  if(!Number.isFinite(value))throw new Error('SVG 包含无效坐标');
  return String(Number(value.toFixed(7)));
};
const point=(x,y)=>`${number(x)} ${number(y)}`;
const matrix=m=>`matrix(${m.map(number).join(' ')})`;
const pathFor=regions=>regionPath(regions).map(command=>command.map(value=>typeof value==='number'?number(value):value).join(' ')).join(' ');
const multiply=(a,b)=>[
  a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
  a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
  a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5],
];
const styleKeys=['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','miterLimit','globalAlpha','globalCompositeOperation','font','textAlign','textBaseline'];

// Records our shared Canvas artwork primitives as native SVG geometry. No bitmap
// fallback: a new unsupported drawing operation must fail visibly during export.
export class SvgDrawingContext {
  constructor(defs=[],prefix='drawing',bounds={minX:-1e5,minY:-1e5,width:2e5,height:2e5}){
    Object.assign(this,{defs,prefix,bounds,nodes:[],stack:[],commands:[],current:false,serial:0,
      transformMatrix:[1,0,0,1,0,0],fillStyle:'#000000',strokeStyle:'#000000',lineWidth:1,
      lineCap:'butt',lineJoin:'miter',miterLimit:10,globalAlpha:1,globalCompositeOperation:'source-over',
      font:'10px sans-serif',textAlign:'start',textBaseline:'alphabetic'});
  }
  save(){this.stack.push({...Object.fromEntries(styleKeys.map(key=>[key,this[key]])),transformMatrix:[...this.transformMatrix]});}
  restore(){const state=this.stack.pop();if(!state)throw new Error('SVG 绘制状态不匹配');Object.assign(this,state);}
  translate(x,y){this.transformMatrix=multiply(this.transformMatrix,[1,0,0,1,x,y]);}
  scale(x,y){this.transformMatrix=multiply(this.transformMatrix,[x,0,0,y,0,0]);}
  rotate(angle){const c=Math.cos(angle),s=Math.sin(angle);this.transformMatrix=multiply(this.transformMatrix,[c,s,-s,c,0,0]);}
  beginPath(){this.commands=[];this.current=false;}
  moveTo(x,y){this.commands.push(`M ${point(x,y)}`);this.current=true;}
  lineTo(x,y){if(!this.current)this.moveTo(x,y);else this.commands.push(`L ${point(x,y)}`);}
  closePath(){this.commands.push('Z');}
  bezierCurveTo(a,b,c,d,x,y){this.commands.push(`C ${point(a,b)} ${point(c,d)} ${point(x,y)}`);}
  quadraticCurveTo(a,b,x,y){this.commands.push(`Q ${point(a,b)} ${point(x,y)}`);}
  rect(x,y,w,h){this.commands.push(`M ${point(x,y)} h ${number(w)} v ${number(h)} h ${number(-w)} Z`);this.current=true;}
  roundRect(x,y,w,h,radius=0){
    const r=Math.min(Number(radius),w/2,h/2);
    if(!r){this.rect(x,y,w,h);return;}
    this.commands.push(`M ${point(x+r,y)} H ${number(x+w-r)} A ${point(r,r)} 0 0 1 ${point(x+w,y+r)} V ${number(y+h-r)} A ${point(r,r)} 0 0 1 ${point(x+w-r,y+h)} H ${number(x+r)} A ${point(r,r)} 0 0 1 ${point(x,y+h-r)} V ${number(y+r)} A ${point(r,r)} 0 0 1 ${point(x+r,y)} Z`);
    this.current=true;
  }
  arc(x,y,r,start,end,anticlockwise=false){this.ellipse(x,y,r,r,0,start,end,anticlockwise);}
  ellipse(x,y,rx,ry,rotation,start,end,anticlockwise=false){
    const tau=Math.PI*2,raw=end-start;
    let delta;
    if(!anticlockwise&&raw>=tau)delta=tau;
    else if(anticlockwise&&raw<=-tau)delta=-tau;
    else{delta=raw%tau;if(!anticlockwise&&delta<0)delta+=tau;if(anticlockwise&&delta>0)delta-=tau;}
    const at=angle=>[x+rx*Math.cos(angle)*Math.cos(rotation)-ry*Math.sin(angle)*Math.sin(rotation),y+rx*Math.cos(angle)*Math.sin(rotation)+ry*Math.sin(angle)*Math.cos(rotation)];
    const first=at(start);this.lineTo(...first);
    const steps=Math.ceil(Math.abs(delta)/Math.PI);
    for(let i=1;i<=steps;i++)this.commands.push(`A ${point(rx,ry)} ${number(rotation*180/Math.PI)} 0 ${delta>0?1:0} ${point(...at(start+delta*i/steps))}`);
  }
  _emit(markup){
    if(this.globalCompositeOperation==='destination-out'){
      const id=`${this.prefix}-erase-${this.serial++}`,b=this.bounds;
      this.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="${number(b.minX)}" y="${number(b.minY)}" width="${number(b.width)}" height="${number(b.height)}"><rect x="${number(b.minX)}" y="${number(b.minY)}" width="${number(b.width)}" height="${number(b.height)}" fill="white"/>${markup}</mask>`);
      this.nodes=[`<g mask="url(#${id})">${this.nodes.join('')}</g>`];
    }else if(this.globalCompositeOperation==='source-over')this.nodes.push(markup);
    else throw new Error(`SVG 不支持绘制模式 ${this.globalCompositeOperation}`);
  }
  _paint(d,stroke=false){
    if(!d)return;
    const color=this.globalCompositeOperation==='destination-out'?'black':(stroke?this.strokeStyle:this.fillStyle);
    const attrs=stroke?`fill="none" stroke="${xml(color)}" stroke-width="${number(this.lineWidth)}" stroke-linecap="${xml(this.lineCap)}" stroke-linejoin="${xml(this.lineJoin)}" stroke-miterlimit="${number(this.miterLimit)}"`:`fill="${xml(color)}" stroke="none" fill-rule="nonzero"`;
    this._emit(`<path d="${xml(d)}" transform="${matrix(this.transformMatrix)}" ${attrs} opacity="${number(this.globalAlpha)}"/>`);
  }
  fill(path){if(path!==undefined)throw new Error('SVG 路径需提供原始矢量数据');this._paint(this.commands.join(' '));}
  stroke(){this._paint(this.commands.join(' '),true);}
  fillSvgPath(path){this._paint(path);}
  fillRect(x,y,w,h){this._paint(`M ${point(x,y)} h ${number(w)} v ${number(h)} h ${number(-w)} Z`);}
  strokeRect(x,y,w,h){this._paint(`M ${point(x,y)} h ${number(w)} v ${number(h)} h ${number(-w)} Z`,true);}
  fillText(text,x,y,maxWidth){
    const match=this.font.match(/^(.*?)\s*([\d.e+-]+)px\s+(.+)$/);
    if(!match)throw new Error('无法导出文字字体');
    const size=Number(match[2]),prefix=match[1],family=match[3];
    this.measureContext??=document.createElement('canvas').getContext('2d');this.measureContext.font=this.font;
    const metrics=this.measureContext.measureText(String(text));
    // Use an ordinary alphabetic baseline so vector editors need no browser-only
    // dominant-baseline interpretation to place code labels correctly.
    const ascent=metrics.fontBoundingBoxAscent??size*.8,descent=metrics.fontBoundingBoxDescent??size*.2;
    const baseline=y+(this.textBaseline==='middle'?(ascent-descent)/2:this.textBaseline==='top'?ascent:this.textBaseline==='bottom'?-descent:0);
    const anchor=['center'].includes(this.textAlign)?'middle':['right','end'].includes(this.textAlign)?'end':'start';
    const fit=maxWidth&&metrics.width>maxWidth?` textLength="${number(maxWidth)}" lengthAdjust="spacingAndGlyphs"`:'';
    this._emit(`<text x="${number(x)}" y="${number(baseline)}" transform="${matrix(this.transformMatrix)}" fill="${xml(this.fillStyle)}" opacity="${number(this.globalAlpha)}" font-family="${xml(family)}" font-size="${number(size)}" font-weight="${xml(prefix.match(/bold|[1-9]00/)?.[0]??'normal')}" font-style="${prefix.includes('italic')?'italic':'normal'}" text-anchor="${anchor}" xml:space="preserve"${fit}>${xml(text)}</text>`);
  }
  drawArtworkText(layer,w,h,color){
    const geometry=textGeometry(layer,w,h),transform=multiply(this.transformMatrix,[geometry.scaleX,0,0,geometry.scaleY,0,0]);
    const text=new ArtworkText(layer.text,{...textOptions(layer,w,h,color),left:0,top:0,objectCaching:false});
    try{
      // ArtworkText centers the actual multiline content inside its editable
      // height. Fabric's SVG engine uses height/2, so use that same content height.
      text.set({height:text.calcTextHeight()});
      this._emit(`<g transform="${matrix(transform)}" opacity="${number(this.globalAlpha)}">${text.toSVG()}</g>`);
    }finally{text.dispose();}
  }
  drawSvgLayer(layer,w,h,color,colorMode='rgb'){
    const prefix=`${this.prefix}-svg-${this.serial++}-`,viewBox=layer.svg.viewBox.map(number).join(' ');
    this._emit(`<g transform="${matrix(this.transformMatrix)}" opacity="${number(this.globalAlpha)}"><svg x="${number(-w/2)}" y="${number(-h/2)}" width="${number(w)}" height="${number(h)}" viewBox="${viewBox}" preserveAspectRatio="none">${svgAssetMarkup(layer.svg,{prefix,color,colorMode,proofNative:layer.proofNative})}</svg></g>`);
  }
  drawImage(image,sx,sy,sw,sh,dx,dy,dw,dh){
    const id=`${this.prefix}-image-crop-${this.serial++}`;
    this.defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="${number(dx)}" y="${number(dy)}" width="${number(dw)}" height="${number(dh)}"/></clipPath>`);
    const src=xml(image.src),width=image.naturalWidth*dw/sw,height=image.naturalHeight*dh/sh;
    this._emit(`<g transform="${matrix(this.transformMatrix)}" opacity="${number(this.globalAlpha)}"><g clip-path="url(#${id})"><image x="${number(dx-sx*dw/sw)}" y="${number(dy-sy*dh/sh)}" width="${number(width)}" height="${number(height)}" preserveAspectRatio="none" href="${src}"/></g></g>`);
  }
  toSVG(){return this.nodes.join('');}
}

export async function exportSVG(project,dieline,images,options={}){
  return proofSvgSource(await exportRGBSVG(project,dieline,images,options),{mode:options.colorMode??'rgb'});
}
export async function exportRGBSVG(project,dieline,images=new ImageCache(),{side='outside'}={}){
  const colorMode='rgb'; // Editable SVG always keeps source paints, never proof pixels.
  if(!Object.hasOwn(SIDES,side))throw new Error('无效的印刷面');
  await images.preload(project.layers);await document.fonts.ready;
  const defs=[],surface=surfaceOf(project,side),sheet=pathFor(printRegions(dieline,{},side));
  const margin=Math.max(dieline.width,dieline.height)*2;
  const bounds={minX:dieline.minX-margin,minY:dieline.minY-margin,width:dieline.width+2*margin,height:dieline.height+2*margin};
  defs.push(`<clipPath id="sheet-clip" clipPathUnits="userSpaceOnUse"><path d="${sheet}" clip-rule="nonzero"/></clipPath>`);
  const paper=dieline.panels.map((panel,index)=>{
    const d=pathFor(printRegions(dieline,{panel:panel.id,clipToPanel:true},side));
    defs.push(`<clipPath id="panel-clip-${index}" clipPathUnits="userSpaceOnUse"><path d="${d}" clip-rule="nonzero"/></clipPath>`);
    const fill=proofColor(panel.kind==='glue'?'#deddd0':surface.colors[panel.id]??surface.paper,colorMode);
    let hatch='';
    if(panel.kind==='glue'){
      const ctx=new SvgDrawingContext(defs,`glue-${index}`,bounds);ctx.strokeStyle=proofColor('#bdbcae',colorMode);ctx.lineWidth=.35;
      for(let y=panel.y-panel.w;y<panel.y+panel.h;y+=4){ctx.beginPath();ctx.moveTo(panel.x,y);ctx.lineTo(panel.x+panel.w,y+panel.w);ctx.stroke();}
      hatch=`<g clip-path="url(#panel-clip-${index})">${ctx.toSVG()}</g>`;
    }
    return `<g id="paper-${index}" data-panel-id="${xml(panel.id)}"><title>${xml(panel.label)}</title><path d="${d}" fill="${xml(fill)}" fill-rule="nonzero"/>${hatch}</g>`;
  }).join('');
  const layers=[...svgSceneLayers(project,dieline),...project.layers].map((layer,index)=>{
    if(!layer.visible||sideOf(layer)!==side)return '';
    const panelIndex=dieline.panels.findIndex(panel=>panel.id===layer.panel);if(panelIndex<0)return '';
    const ctx=new SvgDrawingContext(defs,`layer-${index}`,bounds);
    drawLayer(ctx,layer,dieline.panels[panelIndex],images,colorMode);
    const clip=layer.clipToPanel?` clip-path="url(#panel-clip-${panelIndex})"`:'';
    return `<g id="layer-${index}" data-layer-id="${xml(layer.id)}" data-type="${xml(layer.type)}"${clip}><title>${xml(layer.name??layer.type)}</title>${ctx.toSVG()}</g>`;
  }).join('');
  const cuts=cutSegments(dieline).map(([a,b])=>`<path d="M ${point(...a)} L ${point(...b)}"/>`).join('');
  const folds=creasePaths(dieline).map(p=>`<path data-crease="${xml(p.id)}" d="${xml(p.d)}"/>`).join('');
  const mirror=side==='inside'?` transform="translate(${number(dieline.minX+dieline.maxX)} 0) scale(-1 1)"`:'';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${number(dieline.width)}mm" height="${number(dieline.height)}mm" viewBox="${point(dieline.minX,dieline.minY)} ${point(dieline.width,dieline.height)}"><title>${xml(project.name)} · ${SIDES[side]}</title><metadata data-fold-studio="1" data-surface="${side}">${xml(JSON.stringify(project))}</metadata><defs>${defs.join('')}</defs><g id="artwork"${mirror}><g id="paper"><title>纸张与面板底色</title>${paper}</g><g id="design" clip-path="url(#sheet-clip)"><title>可编辑图文</title>${layers}</g></g><g id="dieline"${mirror}><g id="cut" fill="none" stroke="#d54a48" stroke-width="0.15"><title>刀线</title>${cuts}</g><g id="crease" fill="none" stroke="#368258" stroke-width="0.2" stroke-dasharray="2 1"><title>折线</title>${folds}</g></g></svg>`;
}
