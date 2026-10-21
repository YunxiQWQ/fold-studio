import { sideOf, surfaceOf } from './project.js';
import { drawBarcode } from './barcode.js';
import { drawQRCode } from './qrcode.js';
import { drawSymbol } from './symbols.js';
import { proofColor } from './color.js';
import {renderText} from './text-layout.js';
import {printRegions,inPrintRegions} from './artwork-space.js';
export {fontFamily} from './text-layout.js';


export function polygonPath(ctx, points,holes=[]) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  const area=pts=>pts.reduce((sum,[x,y],i)=>{const q=pts[(i+1)%pts.length];return sum+x*q[1]-q[0]*y;},0);
  for(const hole of holes){const ordered=area(hole)*area(points)>0?[...hole].reverse():hole;ordered.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}
}

export class ImageCache {
  constructor(onLoad = () => {}) { this.items = new Map(); this.onLoad = onLoad; }
  get(src) {
    if (!this.items.has(src)) {
      const img = new Image();
      this.items.set(src, img);
      img.onload = () => this.onLoad(src);
      img.onerror = () => { img.dataset.failed = 'true'; this.onLoad(src); };
      img.src = src;
    }
    const image = this.items.get(src);
    return image.complete && image.naturalWidth ? image : null;
  }
  async preload(layers) {
    await Promise.all(layers.filter(l => l.type === 'image').map(l => new Promise((resolve, reject) => {
      const img = this.get(l.src) ?? this.items.get(l.src);
      if (img.complete) return img.naturalWidth ? resolve() : reject(new Error('图片无法解码'));
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', () => reject(new Error('图片无法解码')), { once: true });
    })));
  }
  retain(layers) {
    const used = new Set(layers.filter(l => l.type === 'image').map(l => l.src));
    for (const src of this.items.keys()) if (!used.has(src)) this.items.delete(src);
  }
}

function botanical(ctx, w, h, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.min(w, h) * 0.018;
  ctx.beginPath(); ctx.moveTo(-w * 0.04, h * 0.43); ctx.bezierCurveTo(w * 0.05, 0, -w * 0.15, -h * 0.15, w * 0.08, -h * 0.46); ctx.stroke();
  for (const [x, y, angle, scale] of [[-.07, .19, -.7, .85], [.01, .08, .8, 1], [-.06, -.08, -.8, 1], [.03, -.22, .65, .8], [.07, -.37, -.35, .6]]) {
    ctx.save(); ctx.translate(x * w, y * h); ctx.rotate(angle); ctx.scale(scale, scale);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(w * .05, -h * .26, w * .36, -h * .30, w * .36, -h * .08); ctx.bezierCurveTo(w * .30, h * .04, w * .07, h * .07, 0, 0); ctx.fill();
    ctx.globalAlpha *= .35; ctx.strokeStyle = '#f3f0df'; ctx.lineWidth *= .55; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(w * .16, -h * .08, w * .31, -h * .12); ctx.stroke(); ctx.restore();
  }
  ctx.fillStyle = color;
  for (const [x, y, r] of [[.29,.34,.025],[-.33,-.34,.02],[-.25,.36,.014],[.34,-.32,.015]]) {
    ctx.beginPath(); ctx.arc(x*w,y*h,r*w,0,Math.PI*2); ctx.fill();
  }
}

export function layerBounds(layer, panel, side = sideOf(layer)) {
  return { x: panel.x + (side === 'inside' ? 1-layer.x : layer.x) * panel.w, y: panel.y + layer.y * panel.h, w: layer.w * panel.w, h: layer.h * panel.h };
}

export function drawLayer(ctx, layer, panel, images, colorMode = 'rgb') {
  if (!layer.visible) return;
  const { x, y, w, h } = layerBounds(layer, panel);
  ctx.save(); ctx.translate(x, y); if(sideOf(layer)==='inside')ctx.scale(-1,1); ctx.rotate(layer.rotation * Math.PI / 180);ctx.scale(layer.flipX?-1:1,layer.flipY?-1:1); ctx.globalAlpha = layer.opacity;
  const color = proofColor(layer.color ?? '#39563c', colorMode);
  ctx.fillStyle = color;
  if (layer.type === 'text') {
    renderText(ctx,layer,w,h,color);
  } else if (layer.type === 'image') {
    const img = images.get(layer.src);
    if (img){const c=layer.crop??{x:0,y:0,w:1,h:1};ctx.drawImage(img,c.x*img.naturalWidth,c.y*img.naturalHeight,c.w*img.naturalWidth,c.h*img.naturalHeight,-w/2,-h/2,w,h);}
  } else if (layer.type === 'barcode') {
    const proofedLayer = colorMode === 'cmyk' ? { ...layer, bgColor: proofColor(layer.bgColor, colorMode) } : layer;
    drawBarcode(ctx, proofedLayer, w, h, color);
  } else if (layer.type === 'qrcode') {
    const proofedLayer = colorMode === 'cmyk' ? { ...layer, bgColor: proofColor(layer.bgColor, colorMode) } : layer;
    drawQRCode(ctx, proofedLayer, w, h, color);
  } else if (layer.type === 'symbol') {
    drawSymbol(ctx, layer.symbol ?? 'recycle', w, h, color);
  } else if (layer.shape === 'botanical') botanical(ctx, w, h, color);
  else {
    ctx.beginPath();
    if(layer.shape==='ellipse')ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
    else if(layer.shape==='triangle'){ctx.moveTo(0,-h/2);ctx.lineTo(w/2,h/2);ctx.lineTo(-w/2,h/2);ctx.closePath();}
    else if(layer.shape==='line'){ctx.moveTo(-w/2,0);ctx.lineTo(w/2,0);}
    else if(layer.shape==='arrow'){ctx.moveTo(-w/2,-h*.16);ctx.lineTo(w*.15,-h*.16);ctx.lineTo(w*.15,-h/2);ctx.lineTo(w/2,0);ctx.lineTo(w*.15,h/2);ctx.lineTo(w*.15,h*.16);ctx.lineTo(-w/2,h*.16);ctx.closePath();}
    else ctx.roundRect(-w/2,-h/2,w,h,Math.min(layer.radius??0,w/2,h/2));
    if(layer.shape!=='line')ctx.fill();
    if(layer.strokeWidth||layer.shape==='line'){ctx.strokeStyle=proofColor(layer.stroke??layer.color,colorMode);ctx.lineWidth=layer.strokeWidth||.5;ctx.lineJoin='round';ctx.stroke();}
  }
  ctx.restore();
}

export function paintArtwork(ctx, project, dieline, images, side = 'outside', colorMode = 'rgb') {
  const surface=surfaceOf(project,side);
  for (const panel of dieline.panels) {
    ctx.save(); polygonPath(ctx, panel.points,panel.holes); ctx.clip();
    ctx.fillStyle = proofColor(surface.colors[panel.id] ?? surface.paper, colorMode); ctx.fill();
    if (panel.kind === 'glue') {
      ctx.fillStyle = proofColor('#deddd0', colorMode); ctx.fill();
      ctx.strokeStyle = proofColor('#bdbcae', colorMode); ctx.lineWidth = .35;
      for (let y = panel.y - panel.w; y < panel.y + panel.h; y += 4) { ctx.beginPath(); ctx.moveTo(panel.x, y); ctx.lineTo(panel.x + panel.w, y + panel.w); ctx.stroke(); }
    }
    ctx.restore();
  }
  // Fill the paper first, then composite each layer once in sheet coordinates.
  ctx.save();ctx.beginPath();
  for(const points of printRegions(dieline,{},side)){
    const area=points.reduce((n,[x,y],i)=>{const q=points[(i+1)%points.length];return n+x*q[1]-q[0]*y;},0),ordered=(area<0)!==!!points.hole?[...points].reverse():points;
    ordered.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
  }
  ctx.clip();
  for(const layer of project.layers){
    if(sideOf(layer)!==side||!layer.visible)continue;
    const anchor=dieline.panels.find(p=>p.id===layer.panel);if(!anchor)continue;
    if(layer.clipToPanel){ctx.save();polygonPath(ctx,anchor.points,anchor.holes);ctx.clip();}
    drawLayer(ctx,layer,anchor,images,colorMode);
    if(layer.clipToPanel)ctx.restore();
  }
  ctx.restore();
}

export function hitLayer(project, dieline, x, y, side = 'outside', panelId = null) {
  for (const layer of [...project.layers].reverse()) {
    if (!layer.visible || layer.locked || sideOf(layer) !== side || (layer.clipToPanel&&panelId&&layer.panel!==panelId)) continue;
    const panel = dieline.panels.find(p => p.id === layer.panel);
    if (!panel) continue;
    if(!inPrintRegions(printRegions(dieline,layer,side),x,y))continue;
    const b = layerBounds(layer, panel), a = -layer.rotation * Math.PI/180;
    const dx=(x-b.x)*(side==='inside'?-1:1),dy=y-b.y;
    const lx = dx*Math.cos(a) - dy*Math.sin(a), ly=dx*Math.sin(a)+dy*Math.cos(a);
    if (Math.abs(lx) <= b.w/2 && Math.abs(ly) <= b.h/2) return layer;
  }
  return null;
}

