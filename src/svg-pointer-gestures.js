// SVGCanvas's drag coordinates assume one untransformed layer. Imported SVGs
// have independent parent coordinate systems, so apply screen gestures through
// each object's actual DOM matrices without flattening its editable geometry.
export function installSvgPointerGestures(canvas,container,{root,panActive,changed}){
  let gesture=null,priorTransforms;
  const domMatrix=value=>value?new DOMMatrix([value.a,value.b,value.c,value.d,value.e,value.f]):null;
  const finite=matrix=>matrix&&['a','b','c','d','e','f'].every(key=>Number.isFinite(matrix[key]));
  const inverse=matrix=>{if(!finite(matrix)||Math.abs(matrix.a*matrix.d-matrix.b*matrix.c)<1e-12)return null;return matrix.inverse();};
  const setAttribute=(node,name,value)=>{if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);};
  const matrixText=matrix=>`matrix(${[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].map(value=>Math.abs(value)<1e-12?0:value).join(' ')})`;
  const selection=()=>canvas.getSelectedElements().filter(Boolean).filter((node,_,nodes)=>root()?.contains(node)&&!nodes.some(other=>other!==node&&other.contains(node)));
  const mouseTarget=canvas.getMouseTarget.bind(canvas);
  canvas.getMouseTarget=event=>{
    if(canvas.getMode()==='select'){
      const hit=selection().find(node=>node===event.target||node.contains(event.target));
      if(hit)return hit;
    }
    return mouseTarget(event);
  };
  function capture(node){
    const old={transform:node.getAttribute('transform'),style:node.getAttribute('style')};
    const world=domMatrix(node.getScreenCTM()),parent=domMatrix(node.parentElement?.getScreenCTM()),parentInverse=inverse(parent),worldInverse=inverse(world);
    if(!parentInverse||!worldInverse)return null;
    // Nested SVGs also have an intrinsic viewport transform. Measure it rather
    // than mistaking viewBox scaling for an editable transform attribute.
    let intrinsic;
    try{
      node.removeAttribute('transform');
      for(const key of ['transform','transform-origin','transform-box'])node.style.removeProperty(key);
      intrinsic=parentInverse.multiply(domMatrix(node.getScreenCTM()));
    }finally{setAttribute(node,'transform',old.transform);setAttribute(node,'style',old.style);}
    const intrinsicInverse=inverse(intrinsic);if(!intrinsicInverse)return null;
    return {node,old,world,worldInverse,parentInverse,intrinsicInverse};
  }
  function start(event,mode,dir=''){
    const nodes=selection(),items=nodes.map(capture);
    if(!items.length||items.some(item=>!item))return false;
    gesture={mode,dir,items,x:event.clientX,y:event.clientY,moved:false,box:mode==='resize'?nodes[0].getBBox():null};
    canvas.setStarted(true);canvas.setCurrentMode(mode);
    return true;
  }
  function refresh(){
    for(const {node}of gesture.items)canvas.selectorManager.requestSelector(node)?.resize();
    canvas.call('transition',gesture.items.map(item=>item.node));
  }
  // Intercept handles before SVGCanvas adds temporary transforms or derives a
  // local bounding box from its screen-space selection outline.
  container.addEventListener('mousedown',event=>{
    if(gesture)finish(null,true);
    priorTransforms=null;
    if(event.button!==0||panActive?.()||canvas.getMode()==='pan')return;
    const grip=event.target.closest('[id^="selectorGrip_resize_"]');
    if(grip&&selection().length===1&&start(event,'resize',grip.id.replace('selectorGrip_resize_',''))){
      event.preventDefault();event.stopImmediatePropagation();return;
    }
    if(canvas.getMode()!=='select')return;
    const target=canvas.getMouseTarget(event);
    priorTransforms=new Map([...selection(),target].filter(Boolean).map(node=>[node,node.getAttribute('transform')]));
  },true);
  // Let the existing engine resolve clicks, group context, Shift selection and
  // legacy logical groups, then take over only a real object drag.
  container.addEventListener('mousedown',event=>{
    if(event.button!==0||panActive?.()||canvas.getMode()!=='select'||!canvas.getStarted())return;
    for(const [node,transform]of priorTransforms??[])setAttribute(node,'transform',transform);
    start(event,'select');priorTransforms=null;
  });
  document.addEventListener('mousemove',event=>{
    if(!gesture)return;
    if(!(event.buttons&1)){finish(null,true);return;}
    event.preventDefault();event.stopImmediatePropagation();
    let dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!gesture.moved&&Math.max(Math.abs(dx),Math.abs(dy))<3)return;
    gesture.moved=true;
    let worldDelta;
    if(gesture.mode==='select'){
      if(event.shiftKey){const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,length=Math.hypot(dx,dy);dx=Math.cos(angle)*length;dy=Math.sin(angle)*length;}
      worldDelta=new DOMMatrix().translate(dx,dy);
    }else{
      const item=gesture.items[0],{x,y,width,height}=gesture.box,dir=gesture.dir;
      const from=new DOMPoint(gesture.x,gesture.y).matrixTransform(item.worldInverse),to=new DOMPoint(event.clientX,event.clientY).matrixTransform(item.worldInverse);
      dx=to.x-from.x;dy=to.y-from.y;
      const horizontal=/[ew]/.test(dir),vertical=/[ns]/.test(dir);
      let sx=horizontal&&width?1+(dir.includes('w')?-dx:dx)/width:1,sy=vertical&&height?1+(dir.includes('n')?-dy:dy)/height:1;
      if(event.shiftKey){const scale=!horizontal?sy:!vertical?sx:Math.abs(sx-1)>=Math.abs(sy-1)?sx:sy;sx=sy=scale;}
      // Avoid singular matrices while crossing the fixed anchor; allow flips.
      const safe=value=>Math.abs(value)<.0001?(value<0?-.0001:.0001):value;
      sx=safe(sx);sy=safe(sy);
      const ax=x+(dir.includes('w')?width:dir.includes('e')?0:width/2),ay=y+(dir.includes('n')?height:dir.includes('s')?0:height/2);
      const local=new DOMMatrix().translate(ax,ay).scale(sx,sy).translate(-ax,-ay);
      worldDelta=item.world.multiply(local).multiply(item.worldInverse);
    }
    for(const item of gesture.items){
      const matrix=item.parentInverse.multiply(worldDelta).multiply(item.world).multiply(item.intrinsicInverse);
      if(!finite(matrix))continue;
      for(const key of ['transform','transform-origin','transform-box'])item.node.style.removeProperty(key);
      if(!item.node.getAttribute('style'))item.node.removeAttribute('style');
      item.node.setAttribute('transform',matrixText(matrix));
    }
    refresh();
  },true);
  function finish(event,cancel=false){
    if(!gesture)return;
    const current=gesture;gesture=null;
    if(!current.moved&&current.mode==='select')return; // Preserve ordinary clicks and path/node editing.
    event?.preventDefault();event?.stopImmediatePropagation();
    canvas.setStarted(false);canvas.setCurrentMode('select');canvas.setStartTransform(null);canvas.setJustSelected(null);
    canvas.dragStartTransforms=null;canvas.hasDragStartTransform=false;
    canvas.setCurBBoxes([]);
    const batch=new canvas.history.BatchCommand(current.mode==='resize'?'缩放图文':'移动图文');
    for(const {node,old}of current.items){
      if(cancel){for(const [key,value]of Object.entries(old))setAttribute(node,key,value);}
      else if(node.getAttribute('transform')!==old.transform||node.getAttribute('style')!==old.style)batch.addSubCommand(new canvas.history.ChangeElementCommand(node,old));
      canvas.selectorManager.requestSelector(node)?.resize();
    }
    if(current.items.length===1)canvas.selectorManager.requestSelector(current.items[0].node)?.showGrips(true);
    if(!cancel&&!batch.isEmpty()){canvas.undoMgr.addCommandToHistory(batch);changed();}
  }
  document.addEventListener('mouseup',event=>finish(event),true);
  document.addEventListener('pointercancel',event=>finish(event,true),true);
  container.addEventListener('lostpointercapture',()=>finish(null,true),true);
  document.addEventListener('keydown',event=>{if(gesture&&event.key==='Escape')finish(event,true);},true);
  container.addEventListener('mouseleave',event=>{if(gesture)event.stopImmediatePropagation();},true);
  window.addEventListener('blur',()=>finish(null,true));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(null,true);});
}
