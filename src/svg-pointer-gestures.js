// SVGCanvas's drag coordinates assume one untransformed layer. Imported SVGs
// have independent parent coordinate systems, so apply screen gestures through
// each object's actual DOM matrices without flattening its editable geometry.
export function installSvgPointerGestures(canvas,container,{root,panActive,changed,interaction,validate,error}){
  let gesture=null,priorTransforms;
  const domMatrix=value=>value?new DOMMatrix([value.a,value.b,value.c,value.d,value.e,value.f]):null;
  const finite=matrix=>matrix&&['a','b','c','d','e','f'].every(key=>Number.isFinite(matrix[key]));
  const inverse=matrix=>{if(!finite(matrix)||Math.abs(matrix.a*matrix.d-matrix.b*matrix.c)<1e-12)return null;return matrix.inverse();};
  const setAttribute=(node,name,value)=>{if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);};
  const matrixText=matrix=>`matrix(${[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].map(value=>Math.abs(value)<1e-12?0:value).join(' ')})`;
  const degrees=value=>value*180/Math.PI;
  const normalized=value=>((value+180)%360+360)%360-180;
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
    const box=nodes[0].getBBox(),center=new DOMPoint(box.x+box.width/2,box.y+box.height/2).matrixTransform(items[0].world);
    gesture={mode,dir,items,x:event.clientX,y:event.clientY,moved:false,box,center,angle:0,previousAngle:Math.atan2(event.clientY-center.y,event.clientX-center.x),initialAngle:degrees(Math.atan2(items[0].world.b,items[0].world.a)),exclusive:mode!=='select'||event.altKey,copyRequested:mode==='select'&&event.altKey};
    canvas.setStarted(true);canvas.setCurrentMode(mode);
    interaction?.(mode==='select');
    return true;
  }
  function applyDelta(items,delta){
    for(const item of items){
      const matrix=item.parentInverse.multiply(delta).multiply(item.world).multiply(item.intrinsicInverse);
      if(!finite(matrix))throw Error('无法应用此变换，请检查对象或组合的缩放');
      for(const key of ['transform','transform-origin','transform-box'])item.node.style.removeProperty(key);
      if(!item.node.getAttribute('style'))item.node.removeAttribute('style');
      item.node.setAttribute('transform',matrixText(matrix));
    }
  }
  function copyForDrag(current){
    // Keep duplication in the active gesture: no zero-distance native move,
    // intermediate project commit, or change to the source objects.
    const originals=current.items,ids=new Map(),groups=new Map(),copies=[];
    for(const {node,old}of originals)for(const [key,value]of Object.entries(old))setAttribute(node,key,value);
    try{
      for(const {node}of originals){
        const copy=node.cloneNode(true),source=[node,...node.querySelectorAll('*')],cloned=[copy,...copy.querySelectorAll('*')];
        source.forEach((element,index)=>{const id=canvas.getNextId();if(element.id)ids.set(element.id,id);cloned[index].id=id;});copies.push(copy);
      }
      const reference=id=>{if(ids.has(id))return ids.get(id);try{return ids.get(decodeURIComponent(id));}catch{return null;}};
      for(const copy of copies)for(const node of [copy,...copy.querySelectorAll('*')]){
        for(const attribute of [...node.attributes]){
          let value=attribute.value;
          if(['href','xlink:href'].includes(attribute.name)&&value.startsWith('#')){const id=reference(value.slice(1));if(id)value='#'+id;}
          else value=value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/gi,(match,_quote,id)=>reference(id)?`url(#${reference(id)})`:match);
          if(value!==attribute.value)node.setAttributeNS(attribute.namespaceURI,attribute.name,value);
        }
        const group=node.getAttribute('data-fold-group');if(group){if(!groups.has(group))groups.set(group,'copy-'+crypto.randomUUID());node.setAttribute('data-fold-group',groups.get(group));}
      }
      copies.forEach((node,i)=>originals[i].node.parentElement.append(node));validate?.();
      const items=copies.map(capture);if(items.some(item=>!item))throw Error('副本的变换不可逆，请检查对象缩放');
      current.copies=copies;current.originals=originals;current.items=items;canvas.selectOnly(copies,true);
    }catch(cause){for(const node of copies)node.remove();canvas.selectOnly(originals.map(item=>item.node),true);throw cause;}
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
    if(event.target.closest('#selectorGrip_rotate')&&selection().length===1&&start(event,'rotate')){event.preventDefault();event.stopImmediatePropagation();return;}
    if(canvas.getMode()!=='select')return;
    const target=canvas.getMouseTarget(event);
    if(event.altKey){
      event.preventDefault();event.stopImmediatePropagation();
      if(target&&target!==root()&&root()?.contains(target)&&!target.closest('[data-locked="true"],defs,mask,clipPath,pattern,marker,symbol,filter')){
        if(!selection().includes(target))canvas.selectOnly([target],true);start(event,'select');
      }return;
    }
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
    if(!gesture.moved&&Math.max(Math.abs(dx),Math.abs(dy))<(gesture.mode==='rotate'?0.25:3))return;
    gesture.moved=true;
    let worldDelta;
    if(gesture.mode==='select'){
      if(!gesture.copies&&(gesture.copyRequested||event.altKey)){try{copyForDrag(gesture);}catch(cause){finish(event,true);error?.(cause);return;}}
      if(event.shiftKey){const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,length=Math.hypot(dx,dy);dx=Math.cos(angle)*length;dy=Math.sin(angle)*length;}
      worldDelta=new DOMMatrix().translate(dx,dy);
    }else if(gesture.mode==='rotate'){
      const {center}=gesture,angle=Math.atan2(event.clientY-center.y,event.clientX-center.x),delta=normalized(degrees(angle-gesture.previousAngle));gesture.previousAngle=angle;gesture.angle+=delta*(event.altKey?0.1:1);
      const rotation=event.shiftKey?Math.round((gesture.initialAngle+gesture.angle)/15)*15-gesture.initialAngle:gesture.angle;
      worldDelta=new DOMMatrix().translate(center.x,center.y).rotate(rotation).translate(-center.x,-center.y);
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
    applyDelta(gesture.items,worldDelta);
    refresh();
  },true);
  function finish(event,cancel=false){
    if(!gesture)return;
    const current=gesture;gesture=null;interaction?.(false);
    if(!current.moved&&current.mode==='select'&&!current.exclusive)return; // Preserve ordinary clicks and path/node editing.
    event?.preventDefault();event?.stopImmediatePropagation();
    canvas.setStarted(false);canvas.setCurrentMode('select');canvas.setStartTransform(null);canvas.setJustSelected(null);
    canvas.dragStartTransforms=null;canvas.hasDragStartTransform=false;
    canvas.setCurBBoxes([]);
    const batch=new canvas.history.BatchCommand(current.copies?'复制并移动图文':current.mode==='rotate'?'旋转图文':current.mode==='resize'?'缩放图文':'移动图文');
    if(cancel&&current.copies){for(const node of current.copies)node.remove();canvas.selectOnly(current.originals.map(item=>item.node),true);return;}
    for(const {node,old}of current.items){
      if(cancel){for(const [key,value]of Object.entries(old))setAttribute(node,key,value);}
      else if(current.copies)batch.addSubCommand(new canvas.history.InsertElementCommand(node));
      else if(node.getAttribute('transform')!==old.transform||node.getAttribute('style')!==old.style)batch.addSubCommand(new canvas.history.ChangeElementCommand(node,old));
      canvas.selectorManager.requestSelector(node)?.resize();
    }
    if(current.items.length===1)canvas.selectorManager.requestSelector(current.items[0].node)?.showGrips(true);
    canvas.call('transition',current.items.map(item=>item.node));
    if(!cancel&&!batch.isEmpty()){canvas.undoMgr.addCommandToHistory(batch);changed();}
  }
  document.addEventListener('mouseup',event=>finish(event),true);
  document.addEventListener('pointercancel',event=>finish(event,true),true);
  container.addEventListener('lostpointercapture',()=>finish(null,true),true);
  document.addEventListener('keydown',event=>{if(gesture&&event.key==='Escape')finish(event,true);},true);
  container.addEventListener('mouseleave',event=>{if(gesture)event.stopImmediatePropagation();},true);
  window.addEventListener('blur',()=>finish(null,true));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(null,true);});
  return {cancel:()=>finish(null,true),get rotation(){const items=selection();if(items.length!==1)return null;const m=items[0].getScreenCTM();return inverse(m)?normalized(degrees(Math.atan2(m.b,m.a))):null;},rotateTo(value){
    if(!Number.isFinite(value)||Math.abs(value)>360000)throw Error('请输入有效的旋转角度');finish(null,true);
    const nodes=selection();if(nodes.length!==1)throw Error('请先选中一个对象或组合');const item=capture(nodes[0]);if(!item)throw Error('此对象的变换不可逆');
    const delta=normalized(value-degrees(Math.atan2(item.world.b,item.world.a)));if(Math.abs(delta)<1e-9)return;
    const box=nodes[0].getBBox(),center=new DOMPoint(box.x+box.width/2,box.y+box.height/2).matrixTransform(item.world);
    applyDelta([item],new DOMMatrix().translate(center.x,center.y).rotate(delta).translate(-center.x,-center.y));
    const batch=new canvas.history.BatchCommand('设置旋转角度');batch.addSubCommand(new canvas.history.ChangeElementCommand(item.node,item.old));canvas.undoMgr.addCommandToHistory(batch);canvas.selectorManager.requestSelector(item.node)?.resize();changed();
  }};
}
