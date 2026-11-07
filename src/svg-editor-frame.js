import {mountSvgLayerPanel,svgLayerName} from './svg-layer-panel.js';
import {installSvgPointerGestures} from './svg-pointer-gestures.js';
import {captureSvgPlacement,restoreSvgPlacement,ungroupSvgLayers,sortableTextPart,preserveTextOrder} from './svg-layer-operations.js';
import {readSvgText,writeSvgText} from './svg-typography.js';
import {canonicalizeImageElement} from './svg-capacity.js';
import {installSvgInlineText} from './svg-inline-text.js';
import {selectableSvgNode,svgMarqueeNodes,svgArtworkIntersects} from './svg-selection.js';
import {createSvgSnapping} from './svg-snapping.js';

// Shared SVGCanvas interface; imported/source-edited SVG is validated before loading.
export function initializeSvgFrame(SvgCanvas, options={}) {
  const $ = selector => document.querySelector(selector);
  const ns = 'http://www.w3.org/2000/svg';
  const send = (type, values={}) => options.message?options.message({type,...values}):parent.postMessage({channel:'fold-svg-editor',type,...values}, '*');
  const container = $('#canvas-container');
  const canvas = new SvgCanvas(container, {
    dimensions:[640,480],initFill:{color:'39563c',opacity:1},
    initStroke:{color:'none',opacity:1,width:1},initOpacity:1,
    text:{stroke_width:0,font_size:options.textSize??24,font_family:'Arial'},baseUnit:'px',imgPath:'',
    show_outside_canvas:!!options.openWorkspace,selectNew:true,
  });
  window.svgCanvas = canvas;
  const applyLocks=()=>{
    // Lock hit testing follows the attribute in CSS, including ancestor locks
    // and undo/redo. Remove editor-owned inline overrides left by older builds:
    // an unlocked node no longer has data-locked, so an attribute-only query
    // would miss its stale pointer-events:none forever.
    const root=sourceElement();
    for(const node of root?[root,...root.querySelectorAll('[style]')]:[]){
      node.style.removeProperty('pointer-events');
      if(node.getAttribute('style')==='')node.removeAttribute('style');
    }
  };
  container.addEventListener('mousedown',event=>{if(event.target.closest('[data-locked="true"]')){event.preventDefault();event.stopImmediatePropagation();}},true);
  const setMode=canvas.setMode.bind(canvas);
  canvas.setMode=mode=>{
    if(['path','fhpath','rect','ellipse','line','text'].includes(mode)){
      const context=graphicContext(canvas.getCurrentGroup());if(context&&context!==canvas.getCurrentGroup())canvas.setContext(context);
    }
    setMode(mode);
    if(['line','fhpath'].includes(mode)){
      const style=canvas.getStyle();
      if(!style.stroke||style.stroke==='none')style.stroke='#39563c';
      if(!(Number(style.stroke_width)>0))style.stroke_width=1;
    }
    options.mode?.(mode);
    refreshCursor();
  };
  let sourceRoot, wrapperId, wrapper, viewport, loading=true, selected=null, clipboard=null;
  let changedTimer,layersPanel,propertyNode,propertyText;
  let marqueeScope=null,marqueeBase=[];
  let pan={x:0,y:0},panDrag=null,inlineText,laidOutZoom,copying=false,movingObject=false;
  function refreshCursor(){
    const mode=canvas.getMode(),pan=options.panActive?.()||mode==='pan';
    const cursor=panDrag?'grabbing':pan?'grab':movingObject?'move':mode==='text'?'text':['path','fhpath','rect','ellipse','line'].includes(mode)?'crosshair':'default';
    container.style.setProperty('--fold-canvas-cursor',cursor);
    container.style.setProperty('--fold-object-cursor',mode==='select'&&!pan&&!panDrag?'move':cursor);
  }
  const setCurrentMode=canvas.setCurrentMode.bind(canvas);
  canvas.setCurrentMode=mode=>{setCurrentMode(mode);refreshCursor();};
  const tagName = element => element.localName;
  const title = element => [...element.children].find(child=>tagName(child)==='title');
  const label=svgLayerName;

  // Selecting a nested object needs its parent coordinate system, not the
  // engine's isolation mode (which disables every other group's pointer hits).
  const leaveContext = canvas.leaveContext.bind(canvas);
  canvas.leaveContext = () => {leaveContext();};
  canvas.setContext = element => {
    canvas.leaveContext();
    if(typeof element==='string')element=document.getElementById(element);
    const root=sourceElement();if(element!==root&&!root?.contains(element))element=root;
    canvas.setCurrentGroup(element);canvas.call('contextset',element);
  };
  // Fold's format validator handles scripts, URLs, references and styles.
  // Retain attributes/effects that SVG-edit's older sanitizer would remove.
  canvas.prepareSvg = () => {};
  // The select tool must stay a select tool after repeated path clicks.
  // Node editing has explicit menu and double-click entry points below.
  canvas.pathActions.select=()=>{};

  function showError(error) {
    $('#message').textContent = error?.message ?? String(error);
  }
  function sourceElement() {
    wrapper = canvas.getSvgContent().querySelector(`[data-fold-svg-wrapper="${wrapperId}"]`);
    return wrapper;
  }
  function graphicContext(node){
    const root=sourceElement();
    for(let parent=node;parent&&parent!==root;parent=parent.parentElement){
      if(['g','svg'].includes(tagName(parent))&&root?.contains(parent)&&!parent.closest('defs,mask,clipPath,pattern,marker,symbol,filter'))return parent;
    }
    return root;
  }
  if(options.openWorkspace){
    const editable=node=>selectableSvgNode(node,sourceElement());
    for(const method of ['selectOnly','addToSelection']){
      const original=canvas[method].bind(canvas);
      canvas[method]=(nodes,...args)=>{
        const chosen=(nodes??[]).filter(editable);
        const groups=new Set(copying?[]:chosen.map(node=>node.getAttribute('data-fold-group')).filter(Boolean));
        const peers=groups.size?[...sourceElement().querySelectorAll('[data-fold-group]')].filter(node=>editable(node)&&groups.has(node.getAttribute('data-fold-group'))):[];
        const next=[...new Set([...chosen,...peers])];
        // The core emits no selection event for selectOnly([]). Keep the
        // active layer/properties in sync when filtering removes every node.
        if(method==='selectOnly'&&!next.length)return canvas.clearSelection();
        return original(next,...args);
      };
    }
  }
  canvas.getMouseTarget=event=>{
    const root=sourceElement(),target=event?.target,manager=canvas.selectorManager;
    if(target?.closest?.('#selectorParentGroup'))return manager.selectorParentGroup;
    if(!root?.contains(target)||target===root)return canvas.getSvgRoot();
    if(Number.isFinite(event.clientX)&&!svgArtworkIntersects(target,{left:event.clientX-.5,right:event.clientX+.5,top:event.clientY-.5,bottom:event.clientY+.5},root))return canvas.getSvgRoot();
    const current=canvas.getCurrentGroup(),parent=current?.contains(target)?current:root;
    let node=target;while(node.parentElement!==parent&&node.parentElement&&root.contains(node.parentElement))node=node.parentElement;
    return selectableSvgNode(node,root)?node:canvas.getSvgRoot();
  };
  container.addEventListener('mousedown',event=>{
    if(event.button!==0||options.panActive?.()||canvas.getMode()!=='select')return;
    const hit=canvas.getMouseTarget(event),root=sourceElement();
    if(root?.contains(hit)&&!canvas.getCurrentGroup()?.contains(hit))canvas.setContext(graphicContext(hit.parentElement));
    marqueeScope=canvas.getCurrentGroup()??sourceElement();
    marqueeBase=event.shiftKey||event.ctrlKey||event.metaKey?canvas.getSelectedElements().filter(Boolean):[];
  },true);
  // Use the same actual DOM matrices for handles and mouse gestures, including
  // nested viewports, CSS transforms, nonuniform scales and mirrored groups.
  const selectorRequest=canvas.selectorManager.requestSelector.bind(canvas.selectorManager),patchedSelectors=new WeakSet();
  function alignViewportSelector(selector){
    const node=selector?.selectedElement;if(!node?.isConnected||!sourceElement()?.contains(node))return;
    const matrix=canvas.selectorManager.selectorParentGroup.getScreenCTM()?.inverse().multiply(node.getScreenCTM());if(!matrix)return;
    const box=node.getBBox(),padX=1/Math.max(.001,Math.hypot(matrix.a,matrix.b)),padY=1/Math.max(.001,Math.hypot(matrix.c,matrix.d));
    const at=(x,y)=>new DOMPoint(x,y).matrixTransform(matrix),corners=[at(box.x-padX,box.y-padY),at(box.x+box.width+padX,box.y-padY),at(box.x+box.width+padX,box.y+box.height+padY),at(box.x-padX,box.y+box.height+padY)];
    selector.selectorGroup.removeAttribute('transform');selector.selectorRect.setAttribute('d',corners.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+'z');
    const middle=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),positions={nw:corners[0],ne:corners[1],se:corners[2],sw:corners[3],n:middle(corners[0],corners[1]),e:middle(corners[1],corners[2]),s:middle(corners[2],corners[3]),w:middle(corners[3],corners[0])};
    const manager=canvas.selectorManager;selector.gripCoords=Object.fromEntries(Object.entries(positions).map(([key,p])=>[key,[p.x,p.y]]));
    if(!selector.selectorGroup.contains(manager.selectorGripsGroup))return;
    for(const [dir,p]of Object.entries(positions)){manager.selectorGrips[dir].setAttribute('cx',p.x);manager.selectorGrips[dir].setAttribute('cy',p.y);}
    const length=Math.hypot(matrix.c,matrix.d)||1,top=positions.n,rotate={x:top.x-matrix.c/length*20,y:top.y-matrix.d/length*20};
    for(const [key,value]of Object.entries({x1:top.x,y1:top.y,x2:rotate.x,y2:rotate.y}))manager.rotateGripConnector.setAttribute(key,value);
    manager.rotateGrip.setAttribute('cx',rotate.x);manager.rotateGrip.setAttribute('cy',rotate.y);
  }
  canvas.selectorManager.requestSelector=(...args)=>{
    const element=args[0],manager=canvas.selectorManager;
    // Imported wrappers may not have an ID until the tree renders. Give them
    // one before the engine indexes the selector, otherwise its second lookup
    // creates another live selector under the newly assigned ID.
    if(element&&!element.id)element.id=canvas.getNextId();
    const indexed=element&&manager.selectorMap[element.id],existing=element&&(indexed?.selectedElement===element?indexed:manager.selectors.find(selector=>selector.selectedElement===element));
    if(existing&&indexed!==existing){for(const [id,value]of Object.entries(manager.selectorMap))if(value===existing&&id!==element.id)delete manager.selectorMap[id];manager.selectorMap[element.id]=existing;}
    const selector=selectorRequest(...args);if(!selector)return selector;
    if(!patchedSelectors.has(selector)){
      const resize=selector.resize.bind(selector),showGrips=selector.showGrips.bind(selector);
      selector.resize=(...args)=>{const result=resize(...args);alignViewportSelector(selector);return result;};
      selector.showGrips=show=>{showGrips(show);if(show)alignViewportSelector(selector);};
      patchedSelectors.add(selector);
    }
    alignViewportSelector(selector);return selector;
  };
  const snapping=createSvgSnapping(canvas,container,{root:sourceElement,geometry:options.snapGeometry,changed:options.snappingChanged});
  const pointerGestures=installSvgPointerGestures(canvas,container,{root:sourceElement,panActive:options.panActive,snapping,changed:()=>contentChanged(true),interaction:active=>{movingObject=active;refreshCursor();},validate:()=>options.validate?.(snapshot()),error:showError});
  function syncSelectors(){
    const manager=canvas.selectorManager,nodes=new Set(canvas.getSelectedElements().filter(node=>node?.isConnected)),kept=new Map();
    for(const selector of manager.selectors){
      const node=selector.selectedElement;
      if(node&&nodes.has(node)&&!kept.has(node)){kept.set(node,selector);selector.locked=true;continue;}
      selector.locked=false;selector.selectedElement=null;selector.showGrips(false);selector.selectorGroup.setAttribute('display','none');
    }
    manager.selectorMap=Object.create(null);
    const single=nodes.size===1,objectMode=['select','multiselect','resize','rotate','pan'].includes(canvas.getMode());
    for(const [node,selector]of kept){manager.selectorMap[node.id]=selector;selector.selectorGroup.setAttribute('display',objectMode?'inline':'none');selector.resize();selector.showGrips(single&&objectMode);}
  }
  const clearSelection=canvas.clearSelection.bind(canvas);
  canvas.clearSelection=(...args)=>{clearSelection(...args);syncSelectors();};
  const intersections=canvas.getIntersectionList.bind(canvas);
  canvas.getIntersectionList=rect=>{
    if(rect)return intersections(rect);
    const rubber=canvas.getRubberBox();if(!rubber)return [];
    const bounds=rubber.getBoundingClientRect(),root=sourceElement();if(!root)return [];
    // Native bboxes are local to each imported viewport/group; comparing them
    // to a document-space marquee stops working after nested SVG editing.
    const hits=svgMarqueeNodes(root,marqueeScope??canvas.getCurrentGroup(),bounds),nodes=[...new Set([...marqueeBase.filter(node=>selectableSvgNode(node,root)),...hits])];
    return nodes.filter(node=>!nodes.some(parent=>node!==parent&&parent.contains(node)));
  };
  function snapshot() {
    const holder=sourceElement();
    if(!holder)throw Error('SVG 原稿容器已移除，请撤销后重试');
    const root=sourceRoot.cloneNode(false);
    for(const child of holder.childNodes){
      if(child.nodeType===1&&child.getAttribute('data-fold-editor-title')==='true')continue;
      const copy=child.cloneNode(true);
      if(child.nodeType===1){
        const originals=[child,...child.querySelectorAll('*')],copies=[copy,...copy.querySelectorAll('*')],storage=canvas.getDataStorage();
        for(let index=0;index<originals.length;index++){
          const original=originals[index],clone=copies[index];
          if(storage.has(original,'orig_opac')){const opacity=storage.get(original,'orig_opac');if(opacity===null||opacity===undefined)clone.removeAttribute('opacity');else clone.setAttribute('opacity',opacity);}
        }
      }
      root.appendChild(copy);
    }
    for(const element of [root,...root.querySelectorAll('*')]){
      canonicalizeImageElement(element);
      element.style?.removeProperty('pointer-events');
      element.style?.removeProperty('cursor');
      if(element.getAttribute('style')==='')element.removeAttribute('style');
      element.removeAttribute('data-fold-editor-title');
      element.removeAttribute('data-fold-inline-editing');
    }
    return new XMLSerializer().serializeToString(root);
  }
  window.foldSvgSource = snapshot;
  function contentChanged(immediate=false) {
    if(loading)return;
    send('changed');
    clearTimeout(changedTimer);
    const persist=()=>{changedTimer=null;refreshTree();refreshProperties();options.changed?.(snapshot());};
    if(immediate)persist();
    else changedTimer=setTimeout(persist,30);
  }
  const finishGesture=canvas.mouseUpEvent;
  function finishMarquee(event){
    event.preventDefault();event.stopImmediatePropagation();
    const rubber=canvas.getRubberBox()?.getBoundingClientRect(),elements=(rubber&&rubber.width<2&&rubber.height<2?marqueeBase:canvas.getSelectedElements()).filter(Boolean),single=elements.length===1?elements[0]:null;
    canvas.setStarted(false);canvas.getRubberBox()?.setAttribute('display','none');canvas.setCurBBoxes([]);
    canvas.setStartTransform(null);canvas.setJustSelected(null);canvas.dragStartTransforms=null;canvas.hasDragStartTransform=false;canvas.setMode('select');
    const root=sourceElement();let parent=elements[0]?.parentElement??root;
    while(parent!==root&&parent&&!elements.every(node=>parent.contains(node)))parent=parent.parentElement;
    canvas.setContext(graphicContext(parent));canvas.selectOnly(elements,true);marqueeScope=null;marqueeBase=[];
    if(single){
      if(single.localName==='text'){canvas.setCurText('font_size',single.getAttribute('font-size'));canvas.setCurText('font_family',single.getAttribute('font-family'));}
      for(const key of ['fill','fill_opacity','stroke','stroke_opacity','stroke_width','stroke_dasharray','stroke_linejoin','stroke_linecap'])canvas.setCurProperties(key,single.getAttribute(key.replaceAll('_','-')));
    }
    syncSelectors();canvas.call('selected',elements);
  }
  container.removeEventListener('mouseup',finishGesture);
  container.addEventListener('mouseup',event=>{
    const mode=canvas.getMode();
    if(mode==='multiselect'){
      // SVGCanvas's stock mouseup falls through from marquee to object-move
      // finalization. It then bakes existing transforms into path coordinates,
      // although nothing was dragged. Keep marquee strictly selection-only.
      finishMarquee(event);return;
    }
    if(!canvas.getStarted()||!['select','resize','multiselect'].includes(mode))return finishGesture(event);
    const styles=new Map();
    const selectedNode=canvas.getSelectedElements().find(Boolean);
    for(const node of selectedNode?[selectedNode,...selectedNode.querySelectorAll('[style]')]:[]){
      if(node.hasAttribute('style'))styles.set(node,node.getAttribute('style'));
    }
    const undoSize=canvas.undoMgr.getUndoStackSize();
    try{finishGesture(event);}
    finally{
      for(const [node,style] of styles)node.setAttribute('style',style);
    }
    // SVGCanvas records move/resize in its own history without emitting changed.
    if(canvas.undoMgr.getUndoStackSize()!==undoSize)contentChanged(true);
  });
  // SVGCanvas's mouseleave dispatches to #svgcanvas, which does not exist in
  // this embedded workspace. Finish real gestures on the actual release.
  container.removeEventListener('mouseleave',canvas.mouseOutEvent);
  container.addEventListener('mouseleave',event=>{
    if(canvas.getStarted()&&!['select','multiselect','resize','rotate','pan'].includes(canvas.getMode()))container.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:event.clientX,clientY:event.clientY,button:0}));
  });
  document.addEventListener('mousemove',event=>{
    if(canvas.getMode()!=='multiselect'||!canvas.getStarted())return;
    if(!(event.buttons&1)){cancelCanvasGesture();return;}
    if(!container.contains(event.target))canvas.mouseMoveEvent(event);
  },true);
  document.addEventListener('mouseup',event=>{if(canvas.getMode()==='multiselect'&&!container.contains(event.target))finishMarquee(event);},true);
  function layout(fit=false) {
    if(!viewport)return;
    const width=Math.max(200,container.clientWidth),height=Math.max(200,container.clientHeight);
    if(fit){pan={x:0,y:0};container.scrollLeft=0;container.scrollTop=0;canvas.setZoom(Math.min((width-70)/viewport[0],(height-70)/viewport[1],3));}
    canvas.updateCanvas(Math.max(width,viewport[0]*canvas.getZoom()+60),Math.max(height,viewport[1]*canvas.getZoom()+60));
    const content=canvas.getSvgContent(),x=Number(content.getAttribute('x'))+pan.x,y=Number(content.getAttribute('y'))+pan.y;
    content.setAttribute('x',x);content.setAttribute('y',y);
    canvas.selectorManager.selectorParentGroup.setAttribute('transform',`translate(${x},${y})`);
    const background=$('#canvasBackground');background?.setAttribute('x',x);background?.setAttribute('y',y);
    syncSelectors();const zoom=canvas.getZoom();
    if(laidOutZoom!==zoom){
      laidOutZoom=zoom;
      canvas.pathActions.zoomChange();
    }
    options.zoom?.(canvas.getZoom());options.layout?.(canvas,wrapper);inlineText?.refresh();
    for(const grip of canvas.getSvgRoot().querySelectorAll('[id^="selectorGrip_"]'))grip.style.cursor='crosshair';
  }
  function zoom(factor,cx=container.clientWidth/2,cy=container.clientHeight/2){
    if(canvas.getStarted())cancelCanvasGesture();
    const content=canvas.getSvgContent(),previous=canvas.getZoom();
    const x=(cx+container.scrollLeft-Number(content.getAttribute('x')))/previous,y=(cy+container.scrollTop-Number(content.getAttribute('y')))/previous;
    canvas.setZoom(Math.max(.03,Math.min(20,previous*factor)));layout();
    pan.x+=cx+container.scrollLeft-Number(content.getAttribute('x'))-x*canvas.getZoom();pan.y+=cy+container.scrollTop-Number(content.getAttribute('y'))-y*canvas.getZoom();layout();
  }
  container.addEventListener('pointerdown',event=>{
    if(event.button!==1&&!options.panActive?.()&&canvas.getMode()!=='pan')return;
    inlineText?.end();
    event.preventDefault();event.stopImmediatePropagation();
    panDrag={pointer:event.pointerId,x:event.clientX,y:event.clientY,pan:{...pan}};
    container.setPointerCapture(event.pointerId);canvas.getSvgRoot().style.cursor='grabbing';
    refreshCursor();
  },true);
  container.addEventListener('pointermove',event=>{if(!panDrag)return;event.preventDefault();event.stopImmediatePropagation();pan={x:panDrag.pan.x+event.clientX-panDrag.x,y:panDrag.pan.y+event.clientY-panDrag.y};layout();},true);
  function stopPan(){const prior=panDrag;panDrag=null;if(prior&&container.hasPointerCapture(prior.pointer))container.releasePointerCapture(prior.pointer);canvas.getSvgRoot().style.removeProperty('cursor');refreshCursor();}
  for(const type of ['pointerup','pointercancel','lostpointercapture'])container.addEventListener(type,event=>{if(!panDrag||panDrag.pointer!==event.pointerId)return;event.preventDefault();event.stopImmediatePropagation();stopPan();},true);
  function cancelCanvasGesture(){
    pointerGestures.cancel();stopPan();const mode=canvas.getMode();
    if(!['select','resize','multiselect','rotate'].includes(mode))return;
    if(mode==='rotate'&&canvas.getStarted())canvas.undoMgr.finishUndoableChange().unapply();
    canvas.setStarted(false);canvas.setStartTransform(null);canvas.setJustSelected(null);canvas.dragStartTransforms=null;canvas.hasDragStartTransform=false;canvas.setCurBBoxes([]);canvas.getRubberBox()?.setAttribute('display','none');
    marqueeScope=null;marqueeBase=[];
    if(mode!=='select')canvas.setMode('select');
    for(const node of canvas.getSelectedElements().filter(Boolean))canvas.selectorManager.requestSelector(node)?.resize();
  }
  window.addEventListener('blur',cancelCanvasGesture);
  document.addEventListener('pointercancel',cancelCanvasGesture,true);
  container.addEventListener('lostpointercapture',cancelCanvasGesture,true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelCanvasGesture();});
  function prepareRoot(source, dimensions) {
    sourceRoot=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;
    viewport=dimensions;
    wrapperId ||= 'fold-source-' + crypto.randomUUID().replaceAll('-','');
    const doc=document.implementation.createDocument(ns,'svg');
    const root=doc.documentElement;
    root.setAttribute('width',viewport[0]);root.setAttribute('height',viewport[1]);
    root.setAttribute('viewBox',`0 0 ${viewport[0]} ${viewport[1]}`);
    for(const attr of sourceRoot.attributes){
      if(!['width','height','viewBox','x','y','id','preserveAspectRatio'].includes(attr.name)&&!attr.name.startsWith('xmlns'))root.setAttributeNS(attr.namespaceURI,attr.name,attr.value);
    }
    const group=doc.createElementNS(ns,'g');
    group.setAttribute('data-fold-svg-wrapper',wrapperId);
    const heading=doc.createElementNS(ns,'title');
    heading.setAttribute('data-fold-editor-title','true');heading.textContent='SVG 原稿';
    group.appendChild(heading);
    const box=sourceRoot.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    if(box){
      let sx=viewport[0]/box[2],sy=viewport[1]/box[3],dx=0,dy=0;
      const aspect=sourceRoot.getAttribute('preserveAspectRatio')??'xMidYMid meet';
      if(!aspect.includes('none')){
        const scale=aspect.includes('slice')?Math.max(sx,sy):Math.min(sx,sy);
        sx=sy=scale;
        dx=(viewport[0]-box[2]*scale)*(aspect.includes('xMin')?0:aspect.includes('xMax')?1:.5);
        dy=(viewport[1]-box[3]*scale)*(aspect.includes('YMin')?0:aspect.includes('YMax')?1:.5);
      }
      group.setAttribute('transform',`matrix(${sx} 0 0 ${sy} ${dx-box[0]*sx} ${dy-box[1]*sy})`);
    }
    for(const child of sourceRoot.childNodes)group.appendChild(doc.importNode(child,true));
    root.appendChild(group);
    return new XMLSerializer().serializeToString(root);
  }
  function loadDocument(source,dimensions,initial=true,preserveView=false) {
    finishPropertyText();inlineText?.end(false);stopPan();snapping.end();
    const previousZoom=canvas.getZoom();
    clearTimeout(changedTimer);changedTimer=null;
    loading=true;
    canvas.leaveContext();
    const before=initial?null:{content:canvas.getSvgContent(),drawing:canvas.getDrawing(),root:sourceRoot,viewport};
    const xml=prepareRoot(source,dimensions);
    // The incoming IDs are already unique and all references are validated.
    const uniquify=canvas.uniquifyElems, gradients=canvas.convertGradients, groupSvg=canvas.groupSvgElem;
    canvas.uniquifyElems=()=>{};
    canvas.convertGradients=()=>{};
    canvas.groupSvgElem=()=>{};
    let loaded;
    try{loaded=canvas.setSvgString(xml,true);}finally{canvas.uniquifyElems=uniquify;canvas.convertGradients=gradients;canvas.groupSvgElem=groupSvg;}
    if(!loaded)throw Error('SVG-edit 无法打开此 SVG，请查看原稿与支持说明');
    sourceElement();
    applyLocks();
    canvas.contentW=viewport[0];canvas.contentH=viewport[1];
    canvas.setContext(wrapper);
    selected=null;
    if(initial)canvas.undoMgr.resetUndoStack();
    else{
      const after={content:canvas.getSvgContent(),drawing:canvas.getDrawing(),root:sourceRoot,viewport};
      // SVGCanvas's source command swaps DOM roots without updating its root
      // reference or Fold's viewport. Keep both actual DOMs, so earlier object
      // commands remain valid when undo crosses a source-code change.
      const restore=state=>{
        canvas.leaveContext();canvas.clearSelection(true);canvas.pathActions.clear();
        canvas.getSvgContent().remove();
        canvas.getSvgRoot().insertBefore(state.content,canvas.selectorManager.selectorParentGroup);
        canvas.setSvgContent(state.content);canvas.current_drawing_=state.drawing;
        sourceRoot=state.root;viewport=state.viewport;
        canvas.contentW=viewport[0];canvas.contentH=viewport[1];
        sourceElement();canvas.setUseData(state.content);canvas.setContext(wrapper);
        selected=null;layout(true);contentChanged();
      };
      canvas.undoMgr.addCommandToHistory({type:()=> 'FoldSourceCommand',getText:()=> '修改 SVG 源码',elements:()=>[before.content,after.content],apply:()=>restore(after),unapply:()=>restore(before)});
    }
    if(preserveView)canvas.setZoom(previousZoom);
    layout(!preserveView);refreshTree();refreshProperties();
    loading=false;
    if(!initial)send('changed');
  }
  const definitions = new Set('defs linearGradient radialGradient clipPath mask pattern marker symbol filter'.split(' '));
  layersPanel=mountSvgLayerPanel({host:$('#layers'),canvas,root:sourceElement,select:selectElement,change:changeAttribute,run,move:moveLayers,count:options.treeCount,active:()=>selected});
  function refreshTree(){layersPanel?.render();}
  function selectElement(element,add=false,range=null) {
    if(!element?.isConnected||element===sourceElement()||!sourceElement()?.contains(element))return;
    selected=element;
    const visual=['tspan','textPath'].includes(tagName(element))?element.closest('text'):element;
    const previous=add?canvas.getSelectedElements().filter(Boolean):[],toggle=add&&previous.includes(visual);
    const next=(range??(toggle?previous.filter(node=>node!==visual):[...previous,visual])).filter((node,index,list)=>node&&!list.some(other=>other!==node&&other.contains(node)));
    let context=graphicContext(visual?.parentElement);
    if(add&&next.length){for(let parent=next[0].parentElement;parent;parent=parent.parentElement)if(next.every(node=>parent.contains(node))){context=graphicContext(parent);break;}}
    if((context===wrapper||wrapper.contains(context))&&(!add||canvas.getCurrentGroup()!==context))canvas.setContext(context);
    if(typeof element.getBBox==='function'&&element.getAttribute('display')!=='none'&&!element.closest('[data-locked="true"]')){
      if(add||range)canvas.selectOnly(next,true);
      else canvas.selectOnly([visual],true);
    }else canvas.clearSelection(true);
    selected=toggle?(next.at(-1)??null):element;refreshTree();refreshProperties();options.selected?.(selected);
  }
  function moveLayers(nodes,target,position){
    if(position!=='inside'&&sortableTextPart(target)&&nodes.every(node=>sortableTextPart(node)&&node.parentElement===target.parentElement)){
      transaction('调整文字分段顺序',batch=>{
        const parent=target.parentElement,ordered=[...nodes].sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
        let reference=position==='before'?target.nextSibling:target;while(reference&&nodes.includes(reference))reference=reference.nextSibling;
        preserveTextOrder(canvas,parent,batch,()=>{for(const node of ordered){const next=node.nextSibling;parent.insertBefore(node,reference);if(node.nextSibling!==next)batch.addSubCommand(new canvas.history.MoveElementCommand(node,next,parent));}});
        return {selection:[target.closest('text')],active:nodes.at(-1)};
      });
      return;
    }
    const visual=node=>['tspan','textPath'].includes(node.localName)?node.closest('text'):node;
    nodes=[...new Set(nodes.map(visual).filter(Boolean))];target=visual(target);
    const parent=position==='inside'?target:target.parentElement;
    if(!parent||!wrapper.contains(parent)||nodes.some(node=>node===target||node.contains(parent)))throw Error('不能把图层移入自身或子图层');
    if(!['g','svg'].includes(parent.localName))throw Error('请把图层放到画布或组合中');
    if(parent.closest('defs,mask,clipPath,filter,[data-locked="true"]'))throw Error('此位置无法放入图层');
    const destination=parent.getScreenCTM();
    if(!destination||![destination.a,destination.b,destination.c,destination.d,destination.e,destination.f].every(Number.isFinite)||destination.a*destination.d-destination.b*destination.c===0)throw Error('目标组合的变换不可逆，请先调整组合缩放');
    canvas.leaveContext();
    const before=snapshot();
    const ordered=[...nodes].sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
    let reference=position==='inside'?null:position==='before'?target.nextSibling:target;
    while(reference&&nodes.includes(reference))reference=reference.nextSibling;
    const apply=()=>{
      for(const node of ordered){
        const reparent=node.parentElement!==parent;
        const placement=reparent?captureSvgPlacement(node,{percentages:true}):null;
        if(placement)for(const length of placement.lengths)length.node.setAttribute(length.key,length.value);
        parent.insertBefore(node,reference);
        if(!reparent)continue;
        restoreSvgPlacement(placement,parent);
      }
    };
    try{
      if(options.sourceStyles)options.sourceStyles(apply);else apply();
      options.validate?.(snapshot());
    }catch(error){loadDocument(before,viewport,true,true);throw error;}
    canvas.setContext(parent);canvas.selectOnly(ordered,true);contentChanged(true);
  }
  function changeAttribute(element,name,value) {
    if(!element)return;
    canvas.changeSelectedAttribute(name,value,[element]);
    if(name==='display'||name==='data-locked'){
      applyLocks();
      canvas.selectOnly(canvas.getSelectedElements().filter(Boolean),true);
    }
    canvas.call('changed',[element]);refreshTree();refreshProperties();
  }
  function transaction(title,apply){
    const previous=canvas.getSelectedElements().filter(Boolean),batch=new canvas.history.BatchCommand(title);
    canvas.leaveContext();
    let result;
    const edit=()=>{result=apply(batch);options.validate?.(snapshot());};
    try{if(options.sourceStyles)options.sourceStyles(edit);else edit();}
    catch(error){
      batch.unapply();canvas.setContext(sourceElement());canvas.selectOnly(previous.filter(node=>node.isConnected),true);
      refreshTree();refreshProperties();throw error;
    }
    if(batch.isEmpty())return result;
    canvas.undoMgr.addCommandToHistory(batch);canvas.setContext(sourceElement());
    const next=(result?.selection??previous).filter(node=>node.isConnected);canvas.selectOnly(next,true);
    if(result?.active?.isConnected&&next.some(node=>node===result.active||node.contains(result.active)))selected=result.active;
    contentChanged(true);return result;
  }
  function finishPropertyText(){
    if(!propertyText)return;
    propertyText=null;
    // Share the inline editor's draft/commit boundary: live updates save the
    // project and repaint the preview, but a typing session is one undo step.
    options.textEditing?.(false);
  }
  function textControl(node){
    const input=document.createElement('textarea');input.id='node-text';input.maxLength=5000;
    input.setAttribute('aria-label','文字内容');input.value=readSvgText(node);
    const apply=()=>{
      if(!node.isConnected||node.closest('[data-locked="true"]'))return;
      if(input.value.length>5000){input.value=readSvgText(node);showError('文字内容最多 5000 字');return;}
      if(readSvgText(node)===input.value)return;
      if(propertyText?.input!==input){
        finishPropertyText();inlineText?.end();propertyText={input,node};options.textEditing?.(true);
      }
      // Edit the selected SVG node in place. Replacing it on every input
      // loses focus/caret and leaves subsequent events bound to a stale node.
      writeSvgText(node,input.value);syncSelectors();canvas.call('changed',[node]);
    };
    input.oninput=apply;input.onchange=apply;
    input.onblur=()=>{if(propertyText?.input===input)finishPropertyText();};
    return input;
  }
  function refreshProperties(force=false) {
    const host=$('#properties');
    // Layout/selection notifications can repeat while a field is being typed.
    // Keep that draft and its focused DOM control until selection actually changes.
    if(!force&&propertyNode===selected&&host.contains(document.activeElement))return;
    finishPropertyText();
    propertyNode=selected;host.replaceChildren();
    const heading=document.createElement('h3');heading.textContent=selected?`${label(selected)} · ${tagName(selected)}`:'选择图层或对象';host.appendChild(heading);
    if(!selected){options.properties?.(host,null,canvas);return;}
    if(selected.closest('[data-locked="true"]')){const note=document.createElement('p');note.textContent='对象已锁定，请在图层树中解锁后编辑。';host.append(note);options.properties?.(host,selected,canvas);return;}
    const nameLabel=document.createElement('label');nameLabel.textContent='图层 / 对象名称';
    const name=document.createElement('input');name.id='node-name';name.value=label(selected);
    name.onchange=()=>changeAttribute(selected,'data-name',name.value);
    nameLabel.appendChild(name);host.appendChild(nameLabel);
    if(['text','tspan','textPath'].includes(tagName(selected))){
      const label=document.createElement('label');label.textContent='文字内容';
      label.appendChild(textControl(selected));host.appendChild(label);
    }
    const defaults={rect:['x','y','width','height','rx'],circle:['cx','cy','r'],ellipse:['cx','cy','rx','ry'],text:['x','y','font-size','font-family','font-weight','font-style','text-decoration','text-anchor','letter-spacing'],path:['d']};
    const names=new Set([...(defaults[tagName(selected)]??[]),...selected.getAttributeNames().filter(n=>!['id','data-name','style','class'].includes(n)),...selected.style, 'fill','stroke','stroke-width','opacity']);
    const labels={x:'横向位置',y:'纵向位置',width:'宽度',height:'高度',fill:'填充颜色',stroke:'描边颜色','stroke-width':'描边宽度',opacity:'不透明度','font-size':'字号','font-family':'字体','font-weight':'字重','font-style':'字体样式','text-decoration':'文字装饰','text-anchor':'文字对齐','letter-spacing':'字距',transform:'变换',d:'路径数据',display:'显示方式',visibility:'可见性',rx:'水平圆角 / 半径',ry:'垂直圆角 / 半径',r:'半径',cx:'圆心 X',cy:'圆心 Y',preserveAspectRatio:'图片比例'};
    for(const attribute of names){
      if(attribute.startsWith('xmlns')||attribute.startsWith('data-fold-')||attribute.startsWith('on')||['cursor','pointer-events','data-locked'].includes(attribute)||(tagName(selected)==='image'&&['href','xlink:href'].includes(attribute)))continue;
      const field=document.createElement('label');field.textContent=options.message?(labels[attribute]??attribute):attribute;field.title=attribute;
      const input=document.createElement(attribute==='d'?'textarea':'input');
      input.dataset.attribute=attribute;input.value=selected.style.getPropertyValue(attribute)||selected.getAttribute(attribute)||'';
      input.onchange=()=>send('attribute-request',{source:snapshot(),targetId:selected.id,attribute,value:input.value,tag:tagName(selected)});
      field.appendChild(input);host.appendChild(field);
    }
    options.properties?.(host,selected,canvas);
  }
  function copyElements(copy){
    copying=true;
    try{copy();}finally{copying=false;}
    const groups=new Map();
    for(const selected of canvas.getSelectedElements().filter(Boolean)){
      for(const node of [selected,...selected.querySelectorAll('[data-fold-group]')]){
        const group=node.getAttribute('data-fold-group');if(!group)continue;
        if(!groups.has(group))groups.set(group,'copy-'+crypto.randomUUID());
        node.setAttribute('data-fold-group',groups.get(group));
      }
    }
    contentChanged();
  }
  function run(action) {
    try{
      $('#message').textContent='';
      if(action==='snap'){snapping.setEnabled(!snapping.enabled);return;}
      if(options.handleAction?.(action))return;
      if(action==='apply'){send('apply',{source:snapshot()});return;}
      if(action==='cancel'){send('cancel');return;}
      if(action==='source'){$('#source-text').value=snapshot();$('#source-dialog').showModal();return;}
      if(action==='download'){send('download',{source:snapshot()});return;}
      if(action==='fit'){layout(true);return;}
      if(action.startsWith('zoom-')){zoom(action==='zoom-in'?1.25:.8);return;}
      if(action==='undo'||action==='redo'){
        if(options.command){options.command(action);return;}
        canvas.leaveContext();canvas.undoMgr[action]();sourceElement();canvas.setContext(wrapper);selected=null;refreshTree();refreshProperties();return;
      }
      if(action==='up-context'){
        const parent=canvas.getCurrentGroup()?.parentElement;
        canvas.setContext(parent&&wrapper.contains(parent)?parent:wrapper);return;
      }
      if(action==='new-layer'){
        const group=document.createElementNS(ns,'g');group.id=canvas.getNextId();group.setAttribute('data-name','新图层');
        const parent=canvas.getCurrentGroup()??wrapper;parent.appendChild(group);
        canvas.undoMgr.addCommandToHistory(new canvas.history.InsertElementCommand(group,'新建图层'));
        contentChanged();selectElement(group);return;
      }
      if(action==='nodes'){
        if(tagName(selected??{})!=='path'||selected.closest('[data-locked="true"],[display="none"]'))throw Error('请先选中可编辑路径，或使用“转路径”');
        // Imported paths retain relative/compact commands until the user
        // explicitly edits nodes. The engine's node grips need absolute data.
        const node=selected,old=node.getAttribute('d'),normalized=canvas.pathActions.convertPath(node,false);
        if(normalized!==old){
          node.setAttribute('d',normalized);
          try{options.validate?.(snapshot());}catch(error){node.setAttribute('d',old);throw error;}
          canvas.undoMgr.addCommandToHistory(new canvas.history.ChangeElementCommand(node,{d:old},'准备路径节点'));contentChanged(true);
        }
        canvas.pathActions.toEditMode(node);return;
      }
      if(action==='lock'){
        if(!selected)return;
        const locked=selected.closest('[data-locked="true"]'),nodes=canvas.getSelectedElements().filter(Boolean);
        if(locked)changeAttribute(locked,'data-locked',null);
        else for(const node of nodes.length?nodes:[selected])changeAttribute(node,'data-locked','true');
        return;
      }
      if(['up','down','front','back'].includes(action)){
        const chosen=canvas.getSelectedElements().filter(Boolean),part=chosen.length===1&&sortableTextPart(selected)&&selected.closest('text')===chosen[0];
        const nodes=part?[selected]:chosen,batch=new canvas.history.BatchCommand('调整图层顺序');
        const graphical=node=>!['title','desc'].includes(node.localName)&&!definitions.has(node.localName);
        const order=[...nodes].sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
        if(action==='up')order.reverse();
        const apply=()=>{for(const node of order){
          const parent=node.parentNode,next=node.nextSibling;
          if(action==='front')parent.append(node);
          else if(action==='back'){const first=[...parent.children].find(child=>graphical(child)&&!nodes.includes(child));if(first)parent.insertBefore(node,first);}
          else{
            let neighbor=action==='up'?node.nextElementSibling:node.previousElementSibling;
            while(neighbor&&(nodes.includes(neighbor)||!graphical(neighbor)))neighbor=action==='up'?neighbor.nextElementSibling:neighbor.previousElementSibling;
            if(neighbor)action==='up'?neighbor.after(node):neighbor.before(node);
          }
          if(node.nextSibling!==next)batch.addSubCommand(new canvas.history.MoveElementCommand(node,next,parent));
        }};
        if(part)preserveTextOrder(canvas,selected.parentElement,batch,apply);else apply();
        if(!batch.isEmpty()){canvas.undoMgr.addCommandToHistory(batch);contentChanged(true);}return;
      }
      if(['bold','italic','underline'].includes(action)){
        const node=selected?.closest('text');if(!node||node.closest('[data-locked="true"]'))return;
        const attr={bold:'font-weight',italic:'font-style',underline:'text-decoration'}[action];
        const value={bold:['bold','normal'],italic:['italic','normal'],underline:['underline','none']}[action];
        changeAttribute(node,attr,node.getAttribute(attr)===value[0]?value[1]:value[0]);return;
      }
      if(action==='group'){
        const nodes=canvas.getSelectedElements().filter(Boolean).sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
        if(nodes.length>1)for(const node of nodes)node.removeAttribute('data-fold-group');
        if(nodes.length>1&&new Set(nodes.map(n=>n.parentNode)).size>1){
          let parent=nodes[0].parentElement;while(parent&&!nodes.every(n=>parent.contains(n)))parent=parent.parentElement;
          parent=graphicContext(parent);canvas.leaveContext();
          const group=document.createElementNS(ns,'g');group.id=canvas.getNextId();group.setAttribute('data-name','组合');parent.append(group);
          const batch=new canvas.history.BatchCommand('跨组组合'),copies=new Map();batch.addSubCommand(new canvas.history.InsertElementCommand(group));
          for(const node of nodes){
            const chain=[];for(let p=node.parentElement;p&&p!==parent;p=p.parentElement)chain.unshift(p);
            let target=group;
            for(const original of chain){if(!copies.has(original)){const copy=original.cloneNode(false);copy.id=canvas.getNextId();copy.setAttribute('data-name',label(original));const heading=title(original);if(heading)copy.append(heading.cloneNode(true));target.append(copy);copies.set(original,copy);}target=copies.get(original);}
            const oldParent=node.parentNode,next=node.nextSibling;target.append(node);batch.addSubCommand(new canvas.history.MoveElementCommand(node,next,oldParent));
          }
          canvas.undoMgr.addCommandToHistory(batch);canvas.setContext(parent);canvas.selectOnly([group],true);contentChanged();return;
        }
      }
      if(action==='ungroup'){
        const nodes=canvas.getSelectedElements().filter(node=>node?.hasAttribute('data-fold-group'));
        if(nodes.length){
          for(const node of nodes)node.removeAttribute('data-fold-group');
          contentChanged();return;
        }
        const groups=canvas.getSelectedElements().filter(node=>node&&['g','svg'].includes(node.localName));
        if(groups.length){ungroupSvgLayers(canvas,wrapper,groups,{validate:options.validate,source:snapshot,sourceStyles:options.sourceStyles});contentChanged(true);return;}
      }
      if(action==='duplicate'){copyElements(()=>canvas.cloneSelectedElements(20,20));return;}
      if(action==='copy'||action==='cut'){
        canvas.copySelectedElements();clipboard=sessionStorage.getItem(canvas.getClipboardID());
        options.copied?.();
        if(action==='cut'){canvas.deleteSelectedElements();contentChanged();}
        return;
      }
      if(action==='paste'){
        if(!clipboard)return;
        // Only paste the internally captured, already validated document data.
        sessionStorage.setItem(canvas.getClipboardID(),clipboard);copyElements(()=>canvas.pasteElements('in_place'));return;
      }
      if(action.startsWith('align-')){canvas.alignSelectedElements(action.slice(6),'selected');contentChanged();return;}
      if(action.startsWith('flip-')){canvas.flipSelectedElements(action==='flip-x'?-1:1,action==='flip-y'?-1:1);contentChanged();return;}
      if(action.startsWith('node-')){
        if(canvas.getMode()!=='pathedit')throw Error('请先进入路径节点模式并选择节点');
        const path=canvas.pathActions;
        const methods={'node-add':()=>path.clonePathNode(),'node-delete':()=>path.deletePathNode(),'node-line':()=>path.setSegType(4),'node-curve':()=>path.setSegType(6),'node-link':()=>path.linkControlPoints(true),'node-unlink':()=>path.linkControlPoints(false),'node-close':()=>path.opencloseSubPath(),'node-subpath':()=>path.addSubPath(true)};
        methods[action]?.();contentChanged();return;
      }
      const methods={delete:'deleteSelectedElements',group:'groupSelectedElements',convert:'convertToPath'};
      if(methods[action]){canvas[methods[action]]();contentChanged();}
    }catch(error){showError(error);}
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button?.dataset.mode){canvas.setMode(button.dataset.mode);return;}
    if(button?.dataset.action)run(button.dataset.action);
  });
  document.addEventListener('keydown',event=>{
    if(options.message&&$('dialog[open],.native-edit-menu:popover-open'))return;
    if(event.target.closest('input,textarea,select,[contenteditable]'))return;
    const command=event.ctrlKey||event.metaKey;
    if(command&&event.key.toLowerCase()==='v'&&(options.systemClipboard||!clipboard))return;
    if(options.command&&command&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopImmediatePropagation();options.command('save');return;}
    if(command||['Delete','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))event.stopImmediatePropagation();
    if(command&&event.key.toLowerCase()==='z'){event.preventDefault();run(event.shiftKey?'redo':'undo');}
    else if(command&&event.key.toLowerCase()==='y'){event.preventDefault();run('redo');}
    else if(command&&event.key.toLowerCase()==='s'){event.preventDefault();run('download');}
    else if(command&&event.key.toLowerCase()==='g'){event.preventDefault();run(event.shiftKey?'ungroup':'group');}
    else if(command&&event.key.toLowerCase()==='d'){event.preventDefault();run('duplicate');}
    else if(command&&['b','i','u','l'].includes(event.key.toLowerCase())){event.preventDefault();run({b:'bold',i:'italic',u:'underline',l:'lock'}[event.key.toLowerCase()]);}
    else if(command&&['BracketLeft','BracketRight'].includes(event.code)){event.preventDefault();run(event.code==='BracketRight'?(event.shiftKey?'front':'up'):(event.shiftKey?'back':'down'));}
    else if(command&&event.key.toLowerCase()==='a'){event.preventDefault();const context=canvas.getCurrentGroup()??wrapper;canvas.selectOnly([...context.children].filter(node=>!['defs','title','desc'].includes(tagName(node))),true);}
    else if(command&&['c','x','v'].includes(event.key.toLowerCase())){event.preventDefault();run({c:'copy',x:'cut',v:'paste'}[event.key.toLowerCase()]);}
    else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();run(canvas.getMode()==='pathedit'?'node-delete':'delete');}
    else if(event.key==='Escape'){cancelCanvasGesture();canvas.setMode('select');canvas.setContext(wrapper);canvas.clearSelection();}
    else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();const distance=event.shiftKey?10:1;
      canvas.moveSelectedElements(event.key==='ArrowLeft'?-distance:event.key==='ArrowRight'?distance:0,event.key==='ArrowUp'?-distance:event.key==='ArrowDown'?distance:0,true);contentChanged();
    }
  });
  $('#source-apply').onclick=()=>send('source-request',{source:$('#source-text').value});
  $('#source-cancel').onclick=()=>$('#source-dialog').close();
  inlineText=installSvgInlineText(canvas,container,{input:$('#text'),root:sourceElement,context:graphicContext,changed:()=>canvas.call('changed',[selected]),editing:active=>{if(active)finishPropertyText();options.textEditing?.(active);},selectionChanged:()=>refreshProperties(true),validate:()=>options.validate?.(snapshot()),command:run});
  const endText=()=>{finishPropertyText();inlineText.end();};
  container.addEventListener('dblclick',event=>{
    const node=canvas.getMouseTarget(event);
    if(node?.localName==='path'&&selectableSvgNode(node,sourceElement())){event.preventDefault();event.stopImmediatePropagation();canvas.selectOnly([node],true);run('nodes');return;}
    if(node&&['g','svg'].includes(tagName(node))&&sourceElement()?.contains(node)&&node!==wrapper){event.preventDefault();event.stopImmediatePropagation();canvas.setContext(graphicContext(node));}
  },true);
  canvas.bind('selected',(_window,elements)=>{syncSelectors();selected=elements?.filter(Boolean).at(-1)??null;layersPanel?.reveal(elements?.filter(Boolean)??[]);refreshProperties();options.selected?.(selected);});
  canvas.bind('transition',()=>{const input=$('#object-rotation'),angle=pointerGestures.rotation;if(input&&document.activeElement!==input&&Number.isFinite(angle))input.value=String(+angle.toFixed(4));});
  canvas.bind('changed',()=>contentChanged());
  canvas.bind('updateCanvas',()=>layout());
  new ResizeObserver(()=>layout()).observe(container);
  function receive(data){
    try{
      if(data.type==='load'||data.type==='source-approved'){
        loadDocument(data.source,data.dimensions,data.type==='load',data.preserveView??(data.type==='source-approved'));
        if(!options.message)document.documentElement.dataset.ready='true';
        $('#source-dialog').close();send('loaded');
      }else if(data.type==='attribute-approved'){
        const element=[...wrapper.querySelectorAll('[id]')].find(node=>node.id===data.targetId);
        if(element&&data.style!==undefined){
          const old={style:element.getAttribute('style')};
          if(data.style)element.setAttribute('style',data.style);else element.removeAttribute('style');
          canvas.undoMgr.addCommandToHistory(new canvas.history.ChangeElementCommand(element,old,'修改属性与样式'));
          canvas.call('changed',[element]);refreshTree();refreshProperties();
        }else if(element)changeAttribute(element,data.attribute,data.value||null);
      }else if(data.type==='error')showError(data.message);
    }catch(error){showError(error);send('error',{message:error.message});}
  }
  if(!options.message)window.addEventListener('message',event=>{if(event.source===parent&&event.data?.channel==='fold-svg-editor')receive(event.data);});
  send('ready');
  return {canvas,receive,source:snapshot,run,layout,zoom,endText,select:selectElement,refreshTree,refreshProperties,refreshCursor,transaction,
    get snapping(){return snapping.enabled;},setSnapping:value=>snapping.setEnabled(value),
    get rotation(){return pointerGestures.rotation;},rotateTo:value=>pointerGestures.rotateTo(value),
    get textRange(){return inlineText.range;},formatTextRange:apply=>inlineText.formatSelection(apply),
    sourceStyles(action){return options.sourceStyles?options.sourceStyles(action):action();},
    endRename(){layersPanel.finishRename(true);},get layerDirty(){return layersPanel.dirty;},
    get hasClipboard(){return !!clipboard;},
    get selected(){return selected;},get wrapper(){return sourceElement();},
    flush(){if(changedTimer){clearTimeout(changedTimer);changedTimer=null;options.changed?.(snapshot());}},
    append(source){const root=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;
      canvas.leaveContext();const parent=sourceElement();canvas.setContext(parent);
      const batch=new canvas.history.BatchCommand('导入图文');
      const inserted=[];for(const node of [...root.children]){const element=document.importNode(node,true);parent.appendChild(element);batch.addSubCommand(new canvas.history.InsertElementCommand(element));inserted.push(element);}
      canvas.undoMgr.addCommandToHistory(batch);canvas.selectOnly(inserted.filter(node=>!definitions.has(node.localName)),true);contentChanged();
    }};
}
