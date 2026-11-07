import {selectableSvgNode} from './svg-selection.js';
import {solveSvgSnap,offsetSnapBox} from './svg-snap-math.js';

const preference='fold-studio-smart-snapping',ns='http://www.w3.org/2000/svg';
const union=boxes=>boxes.length?{left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))}:null;
function transformedBox(box,matrix){
  const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
  if(!points.every(p=>Number.isFinite(p.x+p.y)))return null;
  return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
}
function nodeBounds(node){try{return transformedBox(node.getBBox(),node.getScreenCTM());}catch{return null;}}
function referenceBounds(node,root){
  if(!selectableSvgNode(node,root))return null;
  if(['g','svg'].includes(node.localName))return union([...node.children].map(child=>referenceBounds(child,root)).filter(Boolean));
  const style=getComputedStyle(node),picture=['image','use'].includes(node.localName);
  if(!picture&&(style.fill==='none'||Number(style.fillOpacity)===0)&&(style.stroke==='none'||Number(style.strokeOpacity)===0||parseFloat(style.strokeWidth)===0))return null;
  return nodeBounds(node);
}

export function createSvgSnapping(canvas,container,{root,geometry,changed}){
  let enabled=true,session=null,overlay=null;
  try{enabled=localStorage.getItem(preference)!=='0';}catch{/* Preferences are optional in private/offline browsers. */}
  const hide=()=>{overlay?.remove();overlay=null;};
  const end=()=>{hide();session=null;};
  function begin(items){
    end();if(!enabled||!root())return;
    const moving=items.map(item=>item.node),boxes=items.map(item=>transformedBox(item.box??item.node.getBBox(),item.world)).filter(Boolean),bounds=union(boxes);if(!bounds)return;
    const references=[],holder=root(),project=geometry?.(),matrix=holder.getScreenCTM();let index=0;
    const visit=node=>{
      if(moving.some(selected=>selected===node||selected.contains(node)))return;
      if(moving.some(selected=>node.contains(selected))){for(const child of node.children)visit(child);return;}
      if(!selectableSvgNode(node,holder))return;
      // An imported SVG's viewport can be much bigger than its visible art.
      const box=referenceBounds(node,holder);
      if(box&&box.right-box.left+box.bottom-box.top>1e-8)references.push({id:'object-'+index++,kind:'object',bounds:box});
    };
    for(const node of holder.children)visit(node);
    if(project?.dieline&&matrix){
      const d=project.dieline;
      for(const panel of d.panels){
        const x=project.side==='inside'?d.minX+d.maxX-panel.x-panel.w:panel.x;
        const box=transformedBox({x,y:panel.y,width:panel.w,height:panel.h},matrix);
        if(box)references.push({id:'panel-'+panel.id,kind:'panel',bounds:box,active:panel.id===project.panelId});
      }
      const box=transformedBox({x:d.minX,y:d.minY,width:d.width,height:d.height},matrix);if(box)references.push({id:'sheet',kind:'sheet',bounds:box});
    }
    session={items,holder,bounds,references,previous:{},scale:{x:Math.hypot(matrix?.a??1,matrix?.b??0),y:Math.hypot(matrix?.c??0,matrix?.d??1)}};
  }
  function references(box){return session.references.filter(ref=>ref.kind!=='panel'||ref.active||ref.bounds.left<=box.right+12&&ref.bounds.right>=box.left-12&&ref.bounds.top<=box.bottom+12&&ref.bounds.bottom>=box.top-12);}
  function element(tag,attributes){const node=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node;}
  function draw(guides,box){
    hide();if(!guides.length)return;
    const area=container.getBoundingClientRect();if(!area.width||!area.height)return;
    overlay=element('svg',{id:'fold-snap-guides',class:'native-snap-guides','aria-hidden':'true',viewBox:`0 0 ${area.width} ${area.height}`});
    Object.assign(overlay.style,{left:area.left+'px',top:area.top+'px',width:area.width+'px',height:area.height+'px'});
    for(const guide of guides){
      const group=element('g',{'data-snap-axis':guide.axis,'data-snap-kind':guide.spacing?'spacing':guide.ref.kind});overlay.append(group);
      const vertical=guide.axis==='x',value=guide.value-(vertical?area.left:area.top);
      if(guide.spacing){
        const {a,b,placement,gap}=guide.spacing,start=vertical?'left':'top',end=vertical?'right':'bottom',cross=vertical?Math.min(area.bottom-18,Math.max(box.bottom,a.bounds.bottom,b.bounds.bottom)+12):Math.min(area.right-18,Math.max(box.right,a.bounds.right,b.bounds.right)+12);
        let pairs;
        if(placement==='between')pairs=[[a.bounds[end],box[start]],[box[end],b.bounds[start]]];
        else if(placement==='after')pairs=[[a.bounds[end],b.bounds[start]],[b.bounds[end],box[start]]];
        else pairs=[[box[end],a.bounds[start]],[a.bounds[end],b.bounds[start]]];
        for(const pair of pairs){
          const x1=vertical?pair[0]-area.left:cross-area.left,y1=vertical?cross-area.top:pair[0]-area.top,x2=vertical?pair[1]-area.left:x1,y2=vertical?y1:pair[1]-area.top;
          group.append(element('line',{x1,y1,x2,y2,class:'snap-distance'}));
          for(const [x,y]of [[x1,y1],[x2,y2]])group.append(element('line',{x1:vertical?x:x-3,y1:vertical?y-3:y,x2:vertical?x:x+3,y2:vertical?y+3:y,class:'snap-distance'}));
        }
        const middle=(pairs[0][0]+pairs.at(-1)[1])/2,labelLeft=!vertical&&cross-area.left+85>area.width;
        const text=element('text',{x:vertical?middle-area.left:cross-area.left+(labelLeft?-5:5),y:vertical?cross-area.top+12:middle-area.top+3,'text-anchor':vertical?'middle':labelLeft?'end':'start'});
        text.textContent=(gap/session.scale[guide.axis]).toFixed(1)+' mm × 2';group.append(text);
      }else{
        const ref=guide.ref.bounds,start=Math.min(vertical?box.top:box.left,vertical?ref.top:ref.left)-10,end=Math.max(vertical?box.bottom:box.right,vertical?ref.bottom:ref.right)+10;
        group.append(element('line',{x1:vertical?value:start-area.left,y1:vertical?start-area.top:value,x2:vertical?value:end-area.left,y2:vertical?end-area.top:value}));
      }
    }
    document.body.append(overlay);
  }
  function solve(box,{constraint,bypass=false,point=false}={}){
    if(!enabled||!session||session.holder!==root()||!session.items.every(item=>item.node.isConnected)||bypass){hide();if(session)session.previous={};return {dx:0,dy:0};}
    const result=solveSvgSnap(box,references(box),{previous:session.previous,constraint,point});session.previous=result.previous;
    draw(result.guides,offsetSnapBox(box,result.dx,result.dy));return result;
  }
  return {begin,end,get active(){return !!session;},get enabled(){return enabled;},setEnabled(value){enabled=!!value;end();try{localStorage.setItem(preference,enabled?'1':'0');}catch{}changed?.(enabled);},
    move(dx,dy,options){if(!session)return {dx,dy};const result=solve(offsetSnapBox(session.bounds,dx,dy),options);return {dx:dx+result.dx,dy:dy+result.dy};},
    point(point,options){const result=solve({left:point.x,right:point.x,top:point.y,bottom:point.y},{...options,point:true});return {x:point.x+result.dx,y:point.y+result.dy};},
  };
}
