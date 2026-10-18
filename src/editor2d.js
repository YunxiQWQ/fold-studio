import {Canvas,FabricObject,Path,ActiveSelection,util} from 'fabric';
import {polygonPath,paintArtwork,drawLayer} from './artwork.js';
import {ArtworkText,textOptions} from './text-layout.js';
import {foldSegments,panelAt} from './geometry.js';
import {printRegions,inPrintRegions,regionPath} from './artwork-space.js';
import {sideOf} from './project.js';
import {proofColor} from './color.js';
import {displayPanel,expandGroups} from './editor-commands.js';

const COLORS={light:['#aeb69f','#8da273','#526a44','#f8faf4','#8e9984'],warm:['#b9ad98','#a48c62','#7d6342','#fbf9f4','#948570'],gray:['#7d8795','#52b788','#60a5fa','#292d34','#a5b0be'],dark:['#687588','#4ade80','#38bdf8','#171b22','#94a3b8'],slate:['#617a99','#38bdf8','#7dd3fc','#192230','#94a9c4']};
const sameIds=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id));
function makeClip(regions){const points=regions.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return new Path(regionPath(regions),{left:(Math.min(...xs)+Math.max(...xs))/2,top:(Math.min(...ys)+Math.max(...ys))/2,originX:'center',originY:'center',fill:'#000',strokeWidth:0});}
class ArtworkObject extends FabricObject {
  _render(ctx){drawLayer(ctx,{...this.layer,x:.5,y:.5,w:1,h:1,rotation:0,opacity:1,side:'outside',flipX:false,flipY:false},{x:-this.width/2,y:-this.height/2,w:this.width,h:this.height},this.editor.images,this.editor.colorMode);}
}
class DielineCanvas extends Canvas {
  _checkTarget(object,point){
    if(object.printPanelRegions&&!inPrintRegions(object.printPanelRegions,point.x,point.y))return false;
    return super._checkTarget(object,point);
  }
}
export class Editor2D {
  constructor(host,images,callbacks){
    Object.assign(this,{host,images,callbacks,view:{scale:1,x:0,y:0},guides:true,rulers:true,snap:true,theme:'light',colorMode:'rgb',objects:new Map(),keys:new Map(),selectionIds:[],_tool:'select'});
    const lower=document.createElement('canvas');host.appendChild(lower);
    this.fabric=new DielineCanvas(lower,{enablePointerEvents:true,preserveObjectStacking:true,renderOnAddRemove:false,selection:true,selectionKey:['shiftKey','ctrlKey','metaKey'],uniformScaling:true,uniScaleKey:'shiftKey',stopContextMenu:true,fireRightClick:true,selectionColor:'#60a5fa22',selectionBorderColor:'#60a5fa'});
    this.canvas=this.fabric.upperCanvasEl;this.canvas.dataset.testid='editor-canvas';this.canvas.setAttribute('aria-label','刀版平面编辑器，拖动框选，Shift 多选，双击编辑文字');this.canvas.tabIndex=0;this.fabric.wrapperEl.classList.add('fold-fabric-canvas');
    this.fabric.on('before:render',()=>this.background());this.fabric.on('after:render',()=>this.overlay());
    for(const event of ['selection:created','selection:updated','selection:cleared'])this.fabric.on(event,()=>this.selectionChanged());
    this.fabric.on('before:transform',()=>{this.transforming=true;this.drag={type:'transform'};this.baselines=new Map(this.project.layers.map(l=>[l.id,{size:l.size,h:l.h}]));this.callbacks.begin();});
    for(const event of ['object:moving','object:scaling','object:resizing','object:rotating'])this.fabric.on(event,e=>{if(event==='object:moving')this.snapObject(e.target);this.writeTransforms();this.callbacks.change();});
    this.fabric.on('object:modified',()=>{if(this.finishing||!this.transforming)return;this.writeTransforms();this.callbacks.commit();});
    this.fabric.on('text:changed',e=>{const l=this.project.layers.find(l=>l.id===e.target.layerId);if(l){l.text=e.target.text.slice(0,5000);this.callbacks.change();}});
    this.fabric.on('text:editing:exited',()=>{this.keys.clear();this.callbacks.commit();this.update(this.project,this.dieline,this.selected,this.panelId,this.side,this.selectionIds);});
    this.fabric.on('mouse:down',e=>{if(this.guard||this.drag?.type==='pan'||e.target||!this.dieline)return;const p=this.point(e.e),panel=panelAt(this.dieline,p.x,p.y);if(panel)this.callbacks.select(null,panel.id,[]);});
    this.fabric.on('mouse:up',()=>{queueMicrotask(()=>{if(this.transforming)this.finishTransform();this.snapLines=[];this.invalidate();});});
    this.fabric.on('mouse:wheel',e=>{e.e.preventDefault();const r=this.canvas.getBoundingClientRect();this.zoom(Math.exp(-e.e.deltaY*.0012),e.e.clientX-r.left,e.e.clientY-r.top);});
    for(const [event,method]of [['pointerdown','panDown'],['pointermove','panMove'],['pointerup','panUp'],['pointercancel','panUp']])this.canvas.addEventListener(event,e=>this[method](e),true);
    this.canvas.addEventListener('contextmenu',e=>{e.preventDefault();const {target}=this.fabric.findTarget(e);if(target&&!this.fabric.getActiveObjects().includes(target))this.fabric.setActiveObject(target);callbacks.context?.(e);});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
  }
  get tool(){return this._tool;}
  set tool(v){this._tool=v;this.fabric.skipTargetFind=v==='pan';this.fabric.selection=v!=='pan';this.fabric.defaultCursor=v==='pan'?'grab':'default';}
  get isEditing(){return this.fabric.getActiveObject()?.isEditing;}
  resize(){const ow=this.width,oh=this.height;this.width=this.host.clientWidth;this.height=this.host.clientHeight;if(!this.width||!this.height)return;this.fabric.setDimensions({width:this.width,height:this.height});if(this.dieline&&(!ow||this.width/ow<.8||this.width/ow>1.3))this.fit();else if(ow){this.view.x+=(this.width-ow)/2;this.view.y+=(this.height-oh)/2;this.applyView();}this.invalidate();}
  update(project,dieline,selected,panelId,side='outside',ids=selected?[selected]:[]){
    const reset=this.project!==project||this.side!==side||this.dieline?.type!==dieline.type;if(reset)this.up();
    Object.assign(this,{project,dieline,selected,panelId,side,selectionIds:ids});
    if(this.transforming||this.isEditing){this.invalidate();return;}
    this.guard=true;const wanted=project.layers.filter(l=>sideOf(l)===side),idSet=new Set(wanted.map(l=>l.id));
    const geometryKey=JSON.stringify([dieline.panels.map(p=>p.points),side]);if(geometryKey!==this.geometryKey){this.geometryKey=geometryKey;this.keys.clear();this.fabric.clipPath?.dispose();this.fabric.clipPath=makeClip(printRegions(dieline,{},side,true));}
    if(reset||!sameIds(this.fabric.getActiveObjects().map(o=>o.layerId),ids)||this.fabric.getActiveObject() instanceof ActiveSelection)this.fabric.discardActiveObject();
    for(const [id,obj]of this.objects)if(!idSet.has(id)){this.fabric.remove(obj);obj.dispose();this.objects.delete(id);this.keys.delete(id);}
    wanted.forEach((l,index)=>{
      let obj=this.objects.get(l.id);const panel=dieline.panels.find(p=>p.id===l.panel),p=displayPanel(dieline,panel,side),w=l.w*p.w,h=l.h*p.h,key=JSON.stringify([l,panel.points,side,this.colorMode]);
      if(!obj){obj=l.type==='text'?new ArtworkText(l.text,textOptions(l,w,h)):new ArtworkObject({width:w,height:h});obj.layerId=l.id;obj.editor=this;this.objects.set(l.id,obj);this.fabric.add(obj);}
      if(reset||key!==this.keys.get(l.id)){
        const regions=printRegions(dieline,l,side,true);
        obj.printPanelRegions=regions;
        obj.clipPath?.dispose();const clip=l.clipToPanel?makeClip(regions):undefined;if(clip)clip.absolutePositioned=true;
        obj.layer=l;obj.set('dirty',true);if(l.type==='text'){obj.set(textOptions(l,w,h,proofColor(l.color,this.colorMode)));obj.initDimensions();}
        obj.set({left:p.x+l.x*p.w,top:p.y+l.y*p.h,width:w,height:h,angle:l.rotation,scaleX:1,scaleY:1,skewX:0,skewY:0,flipX:!!l.flipX,flipY:!!l.flipY,opacity:l.opacity,visible:l.visible,selectable:!l.locked,evented:!l.locked,lockMovementX:!!l.locked,lockMovementY:!!l.locked,lockScalingX:!!l.locked,lockScalingY:!!l.locked,lockRotation:!!l.locked,lockScalingFlip:true,clipPath:clip,strokeWidth:l.type==='text'?(l.strokeWidth??0):0,cornerColor:'#fff',cornerStrokeColor:COLORS[this.theme][2],borderColor:COLORS[this.theme][2],transparentCorners:false,cornerSize:8,touchCornerSize:24,snapAngle:15,snapThreshold:3,originX:'center',originY:'center'});obj.setCoords();this.keys.set(l.id,key);
      }this.fabric.moveObjectTo(obj,index);
    });this.setActive(ids);this.guard=false;this.invalidate();
  }
  setActive(ids){if(sameIds(this.fabric.getActiveObjects().map(o=>o.layerId),ids))return;this.fabric.discardActiveObject();const list=ids.map(id=>this.objects.get(id)).filter(o=>o?.visible),locked=list.some(o=>o.layer.locked);if(list.length===1)this.fabric.setActiveObject(list[0]);else if(list.length>1)this.fabric.setActiveObject(new ActiveSelection(list,{canvas:this.fabric,lockMovementX:locked,lockMovementY:locked,lockScalingX:locked,lockScalingY:locked,lockRotation:locked,lockScalingFlip:true,cornerSize:8,transparentCorners:false,borderColor:COLORS[this.theme][2]}));}
  selectionChanged(){if(this.guard||!this.project)return;const raw=this.fabric.getActiveObjects().map(o=>o.layerId),ids=expandGroups(this.project,raw);if(!sameIds(ids,raw)){this.guard=true;this.setActive(ids);this.guard=false;}const last=this.project.layers.find(l=>l.id===ids.at(-1));this.selectionIds=ids;this.callbacks.select(last?.id??null,last?.panel??this.panelId,ids);}
  writeTransforms(){for(const obj of this.fabric.getActiveObjects()){
    const l=this.project.layers.find(l=>l.id===obj.layerId);if(!l||l.locked)continue;const panel=this.dieline.panels.find(p=>p.id===l.panel),p=displayPanel(this.dieline,panel,this.side),d=util.qrDecompose(obj.calcTransformMatrix()),fx=obj.flipX,base=this.baselines?.get(l.id);
    l.x=Math.max(-1000,Math.min(1000,(d.translateX-p.x)/p.w));l.y=Math.max(-1000,Math.min(1000,(d.translateY-p.y)/p.h));l.w=Math.max(.005,Math.min(1000,obj.width*Math.abs(d.scaleX)/p.w));l.h=Math.max(.005,Math.min(1000,obj.height*Math.abs(d.scaleY)/p.h));l.rotation=((d.angle-(fx?180:0)+540)%360)-180;l.flipX=!!fx;l.flipY=(d.scaleY<0)!==!!fx;if(l.type==='text'&&base?.size&&Math.abs(d.scaleY)!==1)l.size=Math.max(1,Math.min(100,base.size*l.h/base.h));
  }}
  finishTransform(){if(this.finishing)return;this.transforming=false;this.drag=null;this.snapLines=[];if(this.isEditing)return;this.finishing=true;this.guard=true;this.fabric.discardActiveObject();this.guard=false;this.keys.clear();this.update(this.project,this.dieline,this.selected,this.panelId,this.side,this.selectionIds);this.finishing=false;}
  snapObject(target){
    this.snapLines=[];if(!this.snap)return;const ids=new Set(this.fabric.getActiveObjects().map(o=>o.layerId)),panel=this.dieline.panels.find(p=>p.id===this.panelId),p=displayPanel(this.dieline,panel,this.side),xs=[p.x,p.x+p.w/2,p.x+p.w],ys=[p.y,p.y+p.h/2,p.y+p.h];
    for(const o of this.fabric.getObjects())if(o.visible&&!ids.has(o.layerId)){const b=o.getBoundingRect();xs.push(b.left,b.left+b.width/2,b.left+b.width);ys.push(b.top,b.top+b.height/2,b.top+b.height);}
    const b=target.getBoundingRect(),threshold=5/this.view.scale,best=(anchors,values)=>{let delta=threshold+1,line;for(const a of anchors)for(const v of values)if(Math.abs(v-a)<Math.abs(delta)){delta=v-a;line=v;}return Math.abs(delta)<=threshold?{delta,line}:null;};
    const x=best([b.left,b.left+b.width/2,b.left+b.width],xs),y=best([b.top,b.top+b.height/2,b.top+b.height],ys);if(x){target.left+=x.delta;this.snapLines.push({axis:'x',value:x.line});}if(y){target.top+=y.delta;this.snapLines.push({axis:'y',value:y.line});}target.setCoords();
  }
  setColorMode(v){this.colorMode=v;this.resync();}
  setTheme(v){this.theme=v;this.resync();}
  resync(){this.keys.clear();if(this.project)this.update(this.project,this.dieline,this.selected,this.panelId,this.side,this.selectionIds);}
  fit(){if(!this.dieline||!this.width||!this.height)return;this.view.scale=Math.max(.03,Math.min((this.width-65)/this.dieline.width,(this.height-85)/this.dieline.height));this.view.x=(this.width-this.dieline.width*this.view.scale)/2-this.dieline.minX*this.view.scale;this.view.y=(this.height-this.dieline.height*this.view.scale)/2-this.dieline.minY*this.view.scale;this.applyView();}
  zoom(factor,cx=this.width/2,cy=this.height/2){const old=this.view.scale,next=Math.max(.03,Math.min(20,old*factor));this.view.x=cx-(cx-this.view.x)*next/old;this.view.y=cy-(cy-this.view.y)*next/old;this.view.scale=next;this.applyView();}
  applyView(){const {scale:s,x,y}=this.view;this.fabric.setViewportTransform([s,0,0,s,x,y]);this.callbacks.zoom(s);this.invalidate();}
  point(e){const r=this.canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;let x=(sx-this.view.x)/this.view.scale;if(this.side==='inside')x=this.dieline.minX+this.dieline.maxX-x;return{x,y:(sy-this.view.y)/this.view.scale,sx,sy};}
  panDown(e){if(e.button===1||this.space||this.tool==='pan'){e.preventDefault();e.stopImmediatePropagation();this.canvas.setPointerCapture(e.pointerId);this.drag={type:'pan',x:this.view.x,y:this.view.y,sx:e.clientX,sy:e.clientY};this.canvas.style.cursor='grabbing';}}
  panMove(e){if(this.drag?.type!=='pan')return;e.stopImmediatePropagation();this.view.x=this.drag.x+e.clientX-this.drag.sx;this.view.y=this.drag.y+e.clientY-this.drag.sy;this.applyView();}
  panUp(e){if(this.drag?.type!=='pan')return;e.stopImmediatePropagation();this.drag=null;this.canvas.style.cursor=this.tool==='pan'?'grab':'default';}
  up(){if(this.isEditing)this.fabric.getActiveObject().exitEditing();if(this.transforming){this.writeTransforms();this.finishTransform();this.callbacks.commit();}if(this.drag?.type==='pan')this.drag=null;}
  invalidate(){for(const obj of this.objects.values())if(obj.layer?.type!=='text')obj.dirty=true;this.fabric.requestRenderAll();}
  background(){
    if(!this.project)return;const ctx=this.fabric.contextContainer,s=this.view.scale,dpr=this.fabric.getRetinaScaling(),inside=this.side==='inside',[cut,crease,active]=COLORS[this.theme];ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.translate(this.view.x+(inside?(this.dieline.minX+this.dieline.maxX)*s:0),this.view.y);ctx.scale(inside?-s:s,s);paintArtwork(ctx,{...this.project,layers:[]},this.dieline,this.images,this.side,this.colorMode);
    for(const p of this.dieline.panels){polygonPath(ctx,p.points);ctx.strokeStyle=p.id===this.panelId?active:cut;ctx.lineWidth=(p.id===this.panelId?1.5:.8)/s;ctx.stroke();if(this.guides){const seg=foldSegments(p);if(seg){ctx.beginPath();ctx.moveTo(...seg[0]);ctx.lineTo(...seg[1]);ctx.strokeStyle=crease;ctx.lineWidth=1/s;ctx.setLineDash([4/s,3/s]);ctx.stroke();ctx.setLineDash([]);}if(!this.project.layers.some(l=>l.panel===p.id&&l.visible&&sideOf(l)===this.side)){ctx.save();ctx.translate(p.x+p.w/2,p.y+p.h/2);if(inside)ctx.scale(-1,1);ctx.font=`${9/s}px sans-serif`;ctx.textAlign='center';ctx.fillStyle=cut;ctx.fillText(p.label,0,0);ctx.restore();}}}ctx.restore();
  }
  overlay(){
    if(!this.dieline)return;const ctx=this.fabric.contextContainer,dpr=this.fabric.getRetinaScaling(),s=this.view.scale,[,,,bg,fg]=COLORS[this.theme];ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
    if(this.snapLines?.length){ctx.strokeStyle='#c084fc';ctx.lineWidth=1;ctx.setLineDash([4,3]);for(const l of this.snapLines){ctx.beginPath();if(l.axis==='x'){const x=this.view.x+l.value*s;ctx.moveTo(x,18);ctx.lineTo(x,this.height);}else{const y=this.view.y+l.value*s;ctx.moveTo(18,y);ctx.lineTo(this.width,y);}ctx.stroke();}ctx.setLineDash([]);}
    if(this.rulers){ctx.fillStyle=bg;ctx.fillRect(0,0,this.width,18);ctx.fillRect(0,0,18,this.height);ctx.fillStyle=fg;ctx.strokeStyle=fg;ctx.font='8px sans-serif';const step=[1,2,5,10,20,50,100,200,500].find(v=>v*s>=42)??1000;
      for(const horizontal of [true,false]){const offset=horizontal?this.view.x:this.view.y,max=horizontal?this.width:this.height,start=Math.floor(-offset/s/step)*step;for(let v=start;v*s+offset<max;v+=step){const pos=v*s+offset;if(pos<18)continue;ctx.beginPath();if(horizontal){ctx.moveTo(pos,13);ctx.lineTo(pos,18);ctx.fillText(String(v),pos+2,10);}else{ctx.moveTo(13,pos);ctx.lineTo(18,pos);ctx.save();ctx.translate(10,pos-2);ctx.rotate(-Math.PI/2);ctx.fillText(String(v),0,0);ctx.restore();}ctx.stroke();}}ctx.fillStyle=bg;ctx.fillRect(0,0,18,18);ctx.fillStyle=fg;ctx.fillText('mm',2,11);
    }ctx.restore();this.callbacks.draw?.();
  }
  dispose(){this.observer.disconnect();this.fabric.dispose();}
}
