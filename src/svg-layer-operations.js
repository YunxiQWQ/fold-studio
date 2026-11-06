import {rgbHex} from './color-values.js';
import {definitionTags} from './svg-format.js';

const ns='http://www.w3.org/2000/svg';
const inherited='color fill fill-rule fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset font-family font-size font-weight font-style font-stretch text-anchor letter-spacing word-spacing dominant-baseline alignment-baseline direction writing-mode visibility paint-order shape-rendering text-rendering image-rendering color-interpolation color-interpolation-filters'.split(' ');
const geometry='x y x1 y1 x2 y2 cx cy r rx ry width height dx dy textLength'.split(' ');
const descriptive=new Set(['title','desc']);
const matrix=value=>new DOMMatrix([value.a,value.b,value.c,value.d,value.e,value.f]);
const invert=value=>{if(!value||Math.abs(value.a*value.d-value.b*value.c)<1e-12)throw Error('目标组合的变换不可逆，请先调整组合缩放');return matrix(value).inverse();};
const matrixText=m=>`matrix(${[m.a,m.b,m.c,m.d,m.e,m.f].map(n=>Math.abs(n)<1e-12?0:n).join(' ')})`;
const localValue=value=>value.replace(/url\(["']?[^#)"']*#([^)"']+)["']?\)/g,(_match,id)=>`url(#${decodeURIComponent(id)})`);
const attrSnapshot=node=>Object.fromEntries(node.getAttributeNames().map(key=>[key,node.getAttribute(key)]));
const attributeChange=(canvas,node,old)=>{
  const changed={};for(const key of new Set([...Object.keys(old),...node.getAttributeNames()]))if((old[key]??null)!==node.getAttribute(key))changed[key]=old[key]??null;
  return Object.keys(changed).length?new canvas.history.ChangeElementCommand(node,changed):null;
};

// Capture before changing the DOM: inherited fonts/paint and percentages can
// otherwise resolve against a different viewport after SVG ungroup/reparent.
export function captureSvgPlacement(node,{percentages=false}={}){
  const world=matrix(node.getScreenCTM()),style=getComputedStyle(node),paint=Object.fromEntries(inherited.map(key=>[key,localValue(style.getPropertyValue(key))]));
  const lengths=[];
  if(percentages){
    const visit=element=>{
      for(const key of geometry){
        if(!element.getAttribute(key)?.includes('%'))continue;
        const value=element[key]?.baseVal;
        if(value&&typeof value.value==='number')lengths.push({node:element,key,value:String(value.value)});
        else if(value?.numberOfItems)lengths.push({node:element,key,value:Array.from({length:value.numberOfItems},(_,i)=>value.getItem(i).value).join(' ')});
      }
      if(element.localName==='svg'||definitionTags.has(element.localName))return; // Descendants retain their own viewport.
      for(const child of element.children)visit(child);
    };visit(node);
  }
  return {node,world,paint,lengths};
}
export function restoreSvgPlacement(placement,parent){
  const {node,world,paint}=placement,parentInverse=invert(parent.getScreenCTM());
  node.removeAttribute('transform');for(const key of ['transform','transform-origin','transform-box'])node.style.removeProperty(key);
  const intrinsic=parentInverse.multiply(matrix(node.getScreenCTM())),transform=parentInverse.multiply(world).multiply(invert(intrinsic));
  node.setAttribute('transform',matrixText(transform));
  for(const [key,value]of Object.entries(paint)){
    if(!value)continue;const rgb=value.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
    node.style.removeProperty(key);node.setAttribute(key,rgb?rgbHex(rgb.slice(1))??value:value);
  }
  if(!node.getAttribute('style'))node.removeAttribute('style');
}
const artwork=node=>[...node.children].filter(child=>!descriptive.has(child.localName)&&!definitionTags.has(child.localName));
function definitionLengths(resources){
  const lengths=[];
  const units=(node,key,fallback,seen=new Set())=>{
    if(!node||seen.has(node))return fallback;seen.add(node);
    const value=node.getAttribute(key);if(value)return value;
    const href=node.getAttribute('href')||node.getAttributeNS('http://www.w3.org/1999/xlink','href');
    return href?.startsWith('#')?units(document.getElementById(href.slice(1)),key,fallback,seen):fallback;
  };
  for(const resource of resources)for(const node of [resource,...resource.querySelectorAll('*')]){
    let keys=[];
    if(['linearGradient','radialGradient'].includes(node.localName)&&units(node,'gradientUnits','objectBoundingBox')==='userSpaceOnUse')keys=node.localName==='linearGradient'?['x1','y1','x2','y2']:['cx','cy','r','fx','fy','fr'];
    if(node.localName==='pattern'&&units(node,'patternUnits','objectBoundingBox')==='userSpaceOnUse')keys=['x','y','width','height'];
    for(const key of keys){const value=node[key]?.baseVal;if(value?.unitType===2)lengths.push({node,key,value:String(value.value)});}
  }
  return lengths;
}
function aggregateEffect(node){
  const style=getComputedStyle(node);
  return Number(style.opacity)<1||['filter','mask','clip-path'].some(key=>{const value=style.getPropertyValue(key);return value&&value!=='none';})||style.mixBlendMode!=='normal'||style.isolation==='isolate';
}
function viewportClip(svg){
  if(getComputedStyle(svg).overflow==='visible')return null;
  const width=svg.width.baseVal.value,height=svg.height.baseVal.value,box=svg.viewBox.baseVal,aspect=svg.preserveAspectRatio.baseVal;
  let view=new DOMMatrix();
  if(box.width&&box.height){
    let sx=width/box.width,sy=height/box.height,dx=0,dy=0;
    if(aspect.align!==1){sx=sy=aspect.meetOrSlice===2?Math.max(sx,sy):Math.min(sx,sy);const align=aspect.align-2;dx=(width-box.width*sx)*(align%3)/2;dy=(height-box.height*sy)*Math.floor(align/3)/2;}
    view=view.translate(dx,dy).scale(sx,sy).translate(-box.x,-box.y);
  }
  const screen=matrix(svg.getScreenCTM()).multiply(view.inverse());
  return {screen,inverse:screen.inverse(),width,height};
}
function paintedBounds(node){
  const corners=[];let filtered=false;
  for(const element of [node,...node.querySelectorAll('*')]){
    if(!element.getBBox||element.closest('defs,mask,clipPath,pattern,marker,symbol,filter'))continue;
    const style=getComputedStyle(element),screen=element.getScreenCTM();if(!screen)continue;
    if(style.filter&&style.filter!=='none')filtered=true;
    const b=element.getBBox(),pad=style.stroke!=='none'?(parseFloat(style.strokeWidth)||0)/2*Math.max(1,parseFloat(style.strokeMiterlimit)||1):0;
    for(const [x,y]of [[b.x-pad,b.y-pad],[b.x+b.width+pad,b.y-pad],[b.x+b.width+pad,b.y+b.height+pad],[b.x-pad,b.y+b.height+pad]])corners.push(new DOMPoint(x,y).matrixTransform(screen));
  }
  return {corners,filtered};
}

// One import is one selected group. Its technical SVG viewport and single
// document wrapper are removed together; authored sibling groups stay intact.
export function ungroupSvgLayers(canvas,root,selected,{validate,source,sourceStyles}={}){
  const nodes=selected.filter(node=>['g','svg'].includes(node.localName)&&!selected.some(other=>other!==node&&other.contains(node)));
  if(!nodes.length)return [];
  canvas.leaveContext();
  const batch=new canvas.history.BatchCommand('解组 SVG'),promoted=[],plans=[];
  const prepare=()=>{
    for(const node of nodes){
      if(node.closest('[data-locked="true"]'))throw Error('请先解锁组合');
      const parent=node.parentElement;if(!root.contains(parent))throw Error('不能拆除画布容器');invert(parent.getScreenCTM());
      if(aggregateEffect(node))throw Error('此组合包含整体透明度、蒙版或滤镜；请在图层树中展开编辑，移除整体效果后可解组');
      const containers=[node],clips=[],resources=[];
      let current=node,children=artwork(current);
      const imported=node.localName==='svg'||children.length===1&&children[0].localName==='svg';
      if(node.localName==='svg'){const clip=viewportClip(node);if(clip)clips.push(clip);}
      if(imported)while(children.length===1&&['g','svg'].includes(children[0].localName)&&!aggregateEffect(children[0])&&!children[0].hasAttribute('data-locked')){
        current=children[0];containers.push(current);if(current.localName==='svg'){const clip=viewportClip(current);if(clip)clips.push(clip);}children=artwork(current);
      }
      for(const container of containers)resources.push(...[...container.children].filter(child=>definitionTags.has(child.localName)));
      const placements=children.map(child=>captureSvgPlacement(child,{percentages:containers.some(c=>c.localName==='svg')}));
      for(const placement of placements){
        const {corners,filtered}=clips.length?paintedBounds(placement.node):{corners:[],filtered:false};
        placement.clips=clips.filter(clip=>filtered||corners.some(p=>{const q=p.matrixTransform(clip.inverse);return q.x<-.001||q.y<-.001||q.x>clip.width+.001||q.y>clip.height+.001;}));
      }
      plans.push({node,parent,containers,resources,placements,definitionLengths:containers.some(c=>c.localName==='svg')?definitionLengths(resources):[]});
    }
  };
  try{
    if(sourceStyles)sourceStyles(prepare);else prepare();
    const apply=()=>{
      for(const plan of plans){
        const {node,parent,placements,resources}=plan;
        for(const length of plan.definitionLengths){const old=length.node.getAttribute(length.key);length.node.setAttribute(length.key,length.value);batch.addSubCommand(new canvas.history.ChangeElementCommand(length.node,{[length.key]:old}));}
        const move=child=>{const oldParent=child.parentNode,next=child.nextSibling;parent.insertBefore(child,node);batch.addSubCommand(new canvas.history.MoveElementCommand(child,next,oldParent));};
        for(const resource of resources)move(resource);
        for(const placement of placements){
          const old=attrSnapshot(placement.node);
          for(const length of placement.lengths){const previous=length.node.getAttribute(length.key);length.node.setAttribute(length.key,length.value);if(length.node!==placement.node)batch.addSubCommand(new canvas.history.ChangeElementCommand(length.node,{[length.key]:previous}));}
          move(placement.node);
          try{restoreSvgPlacement(placement,parent);}
          finally{const change=attributeChange(canvas,placement.node,old);if(change)batch.addSubCommand(change);}
          let visual=placement.node;
          // Keep the old viewport crop only where content actually crosses it.
          // Attach it directly when possible so clipped text can still be sorted
          // as a normal layer. An existing clip needs an intersecting wrapper.
          const directClip=getComputedStyle(placement.node).clipPath==='none';let previousClip;
          for(const clip of placement.clips){
            const defs=document.createElementNS(ns,'defs'),path=document.createElementNS(ns,'clipPath'),polygon=document.createElementNS(ns,'polygon');
            path.id=canvas.getNextId();path.setAttribute('clipPathUnits','userSpaceOnUse');
            const inverse=invert(directClip?placement.world:parent.getScreenCTM()),points=[[0,0],[clip.width,0],[clip.width,clip.height],[0,clip.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(clip.screen).matrixTransform(inverse));
            polygon.setAttribute('points',points.map(p=>`${p.x},${p.y}`).join(' '));if(directClip&&previousClip)polygon.setAttribute('clip-path',`url(#${previousClip})`);path.append(polygon);defs.append(path);parent.insertBefore(defs,node);batch.addSubCommand(new canvas.history.InsertElementCommand(defs));
            if(directClip){previousClip=path.id;continue;}
            const wrapper=document.createElementNS(ns,'g');wrapper.id=canvas.getNextId();wrapper.setAttribute('data-name',placement.node.getAttribute('data-name')||'裁切图文');wrapper.setAttribute('clip-path',`url(#${path.id})`);parent.insertBefore(wrapper,visual);batch.addSubCommand(new canvas.history.InsertElementCommand(wrapper));
            const next=visual.nextSibling;wrapper.append(visual);batch.addSubCommand(new canvas.history.MoveElementCommand(visual,next,parent));visual=wrapper;
          }
          if(previousClip){const old=attrSnapshot(placement.node);placement.node.style.removeProperty('clip-path');if(!placement.node.getAttribute('style'))placement.node.removeAttribute('style');placement.node.setAttribute('clip-path',`url(#${previousClip})`);const command=attributeChange(canvas,placement.node,old);if(command)batch.addSubCommand(command);}
          promoted.push(visual);
        }
        const next=node.nextSibling;node.remove();batch.addSubCommand(new canvas.history.RemoveElementCommand(node,next,parent));
      }
      validate?.(source());
    };
    if(sourceStyles)sourceStyles(apply);else apply();
  }catch(error){batch.unapply();canvas.setContext(root);canvas.selectOnly(nodes.filter(node=>node.isConnected),true);throw error;}
  canvas.undoMgr.addCommandToHistory(batch);canvas.setContext(root);canvas.selectOnly(promoted,true);
  return promoted;
}
