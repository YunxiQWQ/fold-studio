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
  const applyLocks=()=>{for(const node of canvas.getSvgContent().querySelectorAll('[data-locked]')){if(node.getAttribute('data-locked')==='true')node.style.pointerEvents='none';else node.style.removeProperty('pointer-events');}};
  container.addEventListener('mousedown',event=>{if(event.target.closest('[data-locked="true"]')){event.preventDefault();event.stopImmediatePropagation();}},true);
  // Match the packaging workspace: free scaling by default, Shift proportional.
  if(options.imageShiftScaling)container.addEventListener('mousemove',event=>{if(canvas.getMode()==='resize'&&canvas.getSelectedElements().filter(Boolean).some(n=>n.localName==='image'))Object.defineProperty(event,'shiftKey',{value:!event.shiftKey});},true);
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
  };
  let sourceRoot, wrapperId, wrapper, viewport, loading=true, selected=null, clipboard=null;
  let originalStyle = new Map(), rendering=false, changedTimer;
  const openGroups = new Map();
  const selectionKeys = new WeakMap(), nodesByKey = new Map();
  let nextKey=0;
  let pan={x:0,y:0},panDrag=null,textSession=null,laidOutZoom,copying=false;
  const tagName = element => element.localName;
  const title = element => [...element.children].find(child=>tagName(child)==='title');
  const label = element => element.getAttribute('data-name') || title(element)?.textContent ||
    element.getAttribute('inkscape:label') || element.id || ({g:'组',path:'路径',text:'文字',rect:'矩形',ellipse:'椭圆',circle:'圆'}[tagName(element)] ?? tagName(element));

  // SVG-edit dims siblings while editing a group. Restore their complete
  // source style as well as opacity, including CSS transforms/blend modes.
  const leaveContext = canvas.leaveContext.bind(canvas);
  canvas.leaveContext = () => {
    leaveContext();
    for(const [element,style] of originalStyle){
      if(style === null)element.removeAttribute('style');
      else element.setAttribute('style',style);
    }
    originalStyle.clear();
  };
  const setContext = canvas.setContext.bind(canvas);
  canvas.setContext = element => {
    canvas.leaveContext();
    for(const node of canvas.getSvgContent().querySelectorAll('*'))originalStyle.set(node,node.getAttribute('style'));
    setContext(element);
    for(const [node,style]of originalStyle)if(node.getAttribute('style')===style)originalStyle.delete(node);
  };
  // Fold's format validator handles scripts, URLs, references and styles.
  // Retain attributes/effects that SVG-edit's older sanitizer would remove.
  canvas.prepareSvg = () => {};

  function showError(error) {
    $('#message').textContent = error?.message ?? String(error);
  }
  function keyFor(element) {
    if(!element.id)element.id=canvas.getNextId();
    if(!selectionKeys.has(element))selectionKeys.set(element,String(++nextKey));
    const key=selectionKeys.get(element);
    nodesByKey.set(key,element);
    return key;
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
    const editable=node=>{const root=sourceElement();return node&&root&&node!==root&&root.contains(node)&&!node.closest('defs,[display="none"],[data-locked="true"]')&&!['title','desc'].includes(tagName(node));};
    for(const method of ['selectOnly','addToSelection']){
      const original=canvas[method].bind(canvas);
      canvas[method]=(nodes,...args)=>{
        const chosen=(nodes??[]).filter(editable);
        const groups=new Set(copying?[]:chosen.map(node=>node.getAttribute('data-fold-group')).filter(Boolean));
        const peers=groups.size?[...sourceElement().querySelectorAll('[data-fold-group]')].filter(node=>editable(node)&&groups.has(node.getAttribute('data-fold-group'))):[];
        return original([...new Set([...chosen,...peers])],...args);
      };
    }
  }
  // SVGCanvas's stock selector accumulates <g> transforms, but skips nested
  // SVG viewports. Position its UI from the actual DOM matrices instead.
  const selectorRequest=canvas.selectorManager.requestSelector.bind(canvas.selectorManager),patchedSelectors=new WeakSet();
  function alignViewportSelector(selector){
    const node=selector?.selectedElement;if(!node?.isConnected||!sourceElement()?.contains(node))return;
    let nested=node.localName==='svg';for(let p=node.parentElement;p&&p!==canvas.getSvgContent();p=p.parentElement)if(p.localName==='svg')nested=true;
    if(!nested)return;
    const matrix=canvas.selectorManager.selectorParentGroup.getScreenCTM()?.inverse().multiply(node.getScreenCTM());if(!matrix)return;
    const box=node.getBBox(),scale=Math.max(.001,Math.hypot(matrix.a,matrix.b)),pad=1/scale;
    const at=(x,y)=>new DOMPoint(x,y).matrixTransform(matrix),corners=[at(box.x-pad,box.y-pad),at(box.x+box.width+pad,box.y-pad),at(box.x+box.width+pad,box.y+box.height+pad),at(box.x-pad,box.y+box.height+pad)];
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
    const selector=selectorRequest(...args);if(!selector)return selector;
    if(!patchedSelectors.has(selector)){
      const resize=selector.resize.bind(selector),showGrips=selector.showGrips.bind(selector);
      selector.resize=(...args)=>{const result=resize(...args);alignViewportSelector(selector);return result;};
      selector.showGrips=show=>{showGrips(show);if(show)alignViewportSelector(selector);};
      patchedSelectors.add(selector);
    }
    alignViewportSelector(selector);return selector;
  };
  container.addEventListener('mousedown',event=>{
    if(canvas.getMode()!=='resize'||!canvas.getStarted())return;
    const node=canvas.getSelectedElements().find(Boolean),parent=node?.parentElement;
    const matrix=parent?.getScreenCTM()?.inverse();
    if(!matrix)return;
    const start=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix);
    canvas.setRootSctm(matrix);canvas.setStartX(start.x);canvas.setStartY(start.y);
    canvas.setRStartX(start.x);canvas.setRStartY(start.y);
    if(node.localName==='text'){
      const transform=matrix.multiply(node.getScreenCTM()),{x,y,width,height}=node.getBBox();
      const corners=[[x,y],[x+width,y],[x,y+height],[x+width,y+height]].map(([px,py])=>new DOMPoint(px,py).matrixTransform(transform));
      const xs=corners.map(point=>point.x),ys=corners.map(point=>point.y);
      const left=Math.min(...xs),top=Math.min(...ys);
      canvas.setInitBbox({x:left,y:top,width:Math.max(...xs)-left,height:Math.max(...ys)-top});
    }
  });
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
          if(originalStyle.has(original)){const style=originalStyle.get(original);if(style===null)clone.removeAttribute('style');else clone.setAttribute('style',style);}
          if(storage.has(original,'orig_opac')){const opacity=storage.get(original,'orig_opac');if(opacity===null||opacity===undefined)clone.removeAttribute('opacity');else clone.setAttribute('opacity',opacity);}
        }
      }
      root.appendChild(copy);
    }
    for(const element of [root,...root.querySelectorAll('*')]){
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
  container.removeEventListener('mouseup',finishGesture);
  container.addEventListener('mouseup',event=>{
    const mode=canvas.getMode();
    if(!canvas.getStarted()||!['select','resize','multiselect'].includes(mode))return finishGesture(event);
    const styles=new Map();
    const selectedNode=canvas.getSelectedElements().find(Boolean);
    for(const node of selectedNode?[selectedNode,...selectedNode.querySelectorAll('[style]')]:[]){
      if(node.hasAttribute('style'))styles.set(node,node.getAttribute('style'));
    }
    const undoSize=canvas.undoMgr.getUndoStackSize();
    const recalculate=canvas.recalculateDimensions;
    if(mode==='resize'&&selectedNode?.localName==='text'){
      const transform=canvas.getStartTransform();
      // Keep glyph stretch independent of font size and original line layout.
      canvas.recalculateDimensions=node=>{
        if(node!==selectedNode)return recalculate.call(canvas,node);
        return new canvas.history.ChangeElementCommand(node,{transform},'拉伸文字');
      };
    }
    try{finishGesture(event);}
    finally{
      canvas.recalculateDimensions=recalculate;
      for(const [node,style] of styles)node.setAttribute('style',style);
    }
    // SVGCanvas records move/resize in its own history without emitting changed.
    if(canvas.undoMgr.getUndoStackSize()!==undoSize)contentChanged(true);
  });
  function layout(fit=false) {
    if(!viewport)return;
    const width=Math.max(200,container.clientWidth),height=Math.max(200,container.clientHeight);
    if(fit){pan={x:0,y:0};container.scrollLeft=0;container.scrollTop=0;canvas.setZoom(Math.min((width-70)/viewport[0],(height-70)/viewport[1],3));}
    canvas.updateCanvas(Math.max(width,viewport[0]*canvas.getZoom()+60),Math.max(height,viewport[1]*canvas.getZoom()+60));
    const content=canvas.getSvgContent(),x=Number(content.getAttribute('x'))+pan.x,y=Number(content.getAttribute('y'))+pan.y;
    content.setAttribute('x',x);content.setAttribute('y',y);
    canvas.selectorManager.selectorParentGroup.setAttribute('transform',`translate(${x},${y})`);
    const background=$('#canvasBackground');background?.setAttribute('x',x);background?.setAttribute('y',y);
    const zoom=canvas.getZoom();
    if(laidOutZoom!==zoom){
      laidOutZoom=zoom;
      for(const node of canvas.getSelectedElements().filter(Boolean))canvas.selectorManager.requestSelector(node)?.resize();
      canvas.pathActions.zoomChange();
    }
    options.zoom?.(canvas.getZoom());options.layout?.(canvas,wrapper);
    for(const grip of canvas.getSvgRoot().querySelectorAll('[id^="selectorGrip_"]'))grip.style.cursor='crosshair';
  }
  function zoom(factor,cx=container.clientWidth/2,cy=container.clientHeight/2){
    const content=canvas.getSvgContent(),previous=canvas.getZoom();
    const x=(cx+container.scrollLeft-Number(content.getAttribute('x')))/previous,y=(cy+container.scrollTop-Number(content.getAttribute('y')))/previous;
    canvas.setZoom(Math.max(.03,Math.min(20,previous*factor)));layout();
    pan.x+=cx+container.scrollLeft-Number(content.getAttribute('x'))-x*canvas.getZoom();pan.y+=cy+container.scrollTop-Number(content.getAttribute('y'))-y*canvas.getZoom();layout();
  }
  container.addEventListener('pointerdown',event=>{
    if(event.button!==1&&!options.panActive?.()&&canvas.getMode()!=='pan')return;
    event.preventDefault();event.stopImmediatePropagation();
    panDrag={pointer:event.pointerId,x:event.clientX,y:event.clientY,pan:{...pan}};
    container.setPointerCapture(event.pointerId);canvas.getSvgRoot().style.cursor='grabbing';
  },true);
  container.addEventListener('pointermove',event=>{if(!panDrag)return;event.preventDefault();event.stopImmediatePropagation();pan={x:panDrag.pan.x+event.clientX-panDrag.x,y:panDrag.pan.y+event.clientY-panDrag.y};layout();},true);
  for(const type of ['pointerup','pointercancel'])container.addEventListener(type,event=>{if(!panDrag)return;event.preventDefault();event.stopImmediatePropagation();if(container.hasPointerCapture(event.pointerId))container.releasePointerCapture(event.pointerId);panDrag=null;canvas.getSvgRoot().style.removeProperty('cursor');},true);
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
  function refreshTree() {
    if(rendering||!sourceElement())return;
    rendering=true;
    const host=$('#layers');host.replaceChildren();nodesByKey.clear();
    function row(element,depth) {
      if(['title','desc','metadata'].includes(tagName(element)))return null;
      const key=keyFor(element),children=[...element.children].filter(child=>!['title','desc'].includes(tagName(child)));
      const box=document.createElement(children.length?'details':'div');
      const line=document.createElement(children.length?'summary':'div');line.className='tree-row';
      if(children.length){
        box.open=openGroups.get(key)??(depth<1&&!definitions.has(tagName(element)));
        const toggle=document.createElement('button');toggle.className='tree-toggle';toggle.dataset.toggleNode=element.id;
        const update=()=>{toggle.textContent=box.open?'▾':'▸';toggle.setAttribute('aria-expanded',String(box.open));toggle.setAttribute('aria-label',`${box.open?'折叠':'展开'} ${label(element)}`);};
        update();toggle.onclick=event=>{event.preventDefault();event.stopPropagation();box.open=!box.open;openGroups.set(key,box.open);update();};
        box.ontoggle=()=>{if(box.isConnected){openGroups.set(key,box.open);update();}};line.appendChild(toggle);
      }
      const select=document.createElement('button');select.className='tree-label';select.dataset.nodeId=element.id;
      select.dataset.key=key;select.textContent=`${label(element)} · ${tagName(element)}`;
      select.title=select.textContent;select.classList.toggle('selected',element===selected);
      select.onclick=event=>{event.preventDefault();event.stopPropagation();selectElement(element,event.shiftKey||event.ctrlKey||event.metaKey);};
      select.ondblclick=event=>{event.preventDefault();if(['g','svg'].includes(tagName(element)))canvas.setContext(element);};
      line.appendChild(select);
      const eye=document.createElement('button');eye.className='tree-eye';eye.textContent=element.getAttribute('display')==='none'?'○':'●';eye.title='显示 / 隐藏';
      eye.onclick=event=>{event.preventDefault();event.stopPropagation();changeAttribute(element,'display',element.getAttribute('display')==='none'?null:'none');};
      line.appendChild(eye);box.appendChild(line);
      const lock=document.createElement('button');lock.className='tree-eye';lock.title='锁定 / 解锁';lock.dataset.lockNode=element.id;lock.textContent=element.getAttribute('data-locked')==='true'?'▣':'◇';
      lock.onclick=event=>{event.preventDefault();event.stopPropagation();changeAttribute(element,'data-locked',element.getAttribute('data-locked')==='true'?null:'true');applyLocks();};line.append(lock);
      if(children.length){const list=document.createElement('div');list.className='tree-children';for(const child of children){const entry=row(child,depth+1);if(entry)list.appendChild(entry);}box.appendChild(list);}
      return box;
    }
    for(const element of [...wrapper.children]){
      const entry=row(element,0);
      if(entry){
        if(definitions.has(tagName(element)))entry.classList.add('definition');
        host.appendChild(entry);
      }
    }
    rendering=false;
  }
  function selectElement(element,add=false) {
    if(!element?.isConnected)return;
    selected=element;
    const visual=['tspan','textPath'].includes(tagName(element))?element.closest('text'):element;
    const previous=add?canvas.getSelectedElements().filter(Boolean):[],toggle=add&&previous.includes(visual);
    const next=(toggle?previous.filter(node=>node!==visual):[...previous,visual]).filter((node,index,list)=>node&&!list.some(other=>other!==node&&other.contains(node)));
    let context=graphicContext(visual?.parentElement);
    if(add&&next.length){for(let parent=next[0].parentElement;parent;parent=parent.parentElement)if(next.every(node=>parent.contains(node))){context=graphicContext(parent);break;}}
    if((context===wrapper||wrapper.contains(context))&&(!add||canvas.getCurrentGroup()!==context))canvas.setContext(context);
    if(typeof element.getBBox==='function'&&element.getAttribute('display')!=='none'&&!element.closest('[data-locked="true"]')){
      if(add)canvas.selectOnly(next,true);
      else canvas.selectOnly([visual],true);
    }else canvas.clearSelection(true);
    selected=toggle?(next.at(-1)??null):element;refreshTree();refreshProperties();options.selected?.(selected);
  }
  function changeAttribute(element,name,value) {
    if(!element)return;
    canvas.changeSelectedAttribute(name,value,[element]);
    if(name==='display'||name==='data-locked'){
      canvas.selectOnly(canvas.getSelectedElements().filter(Boolean),true);
      applyLocks();
    }
    canvas.call('changed',[element]);refreshTree();refreshProperties();
  }
  function refreshProperties() {
    const host=$('#properties');host.replaceChildren();
    const heading=document.createElement('h3');heading.textContent=selected?`${label(selected)} · ${tagName(selected)}`:'选择图层或对象';host.appendChild(heading);
    if(!selected){options.properties?.(host,null,canvas);return;}
    if(selected.closest('[data-locked="true"]')){const note=document.createElement('p');note.textContent='对象已锁定，请在图层树中解锁后编辑。';host.append(note);return;}
    const nameLabel=document.createElement('label');nameLabel.textContent='图层 / 对象名称';
    const name=document.createElement('input');name.id='node-name';name.value=label(selected);
    name.onchange=()=>changeAttribute(selected,'data-name',name.value);
    nameLabel.appendChild(name);host.appendChild(nameLabel);
    if(['text','tspan'].includes(tagName(selected))&&![...selected.children].some(child=>['tspan','textPath'].includes(tagName(child)))){
      const label=document.createElement('label');label.textContent='文字内容';
      const text=document.createElement('textarea');text.id='node-text';text.value=selected.textContent;
      text.onchange=()=>changeAttribute(selected,'#text',text.value);label.appendChild(text);host.appendChild(label);
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
        canvas.pathActions.toEditMode(selected);return;
      }
      if(action==='lock'){
        if(!selected)return;
        const locked=selected.closest('[data-locked="true"]');changeAttribute(locked??selected,'data-locked',locked?null:'true');return;
      }
      if(action==='up'||action==='down'){
        const nodes=canvas.getSelectedElements().filter(Boolean);
        if(action==='up')nodes.reverse();
        for(const node of nodes){
          let neighbor=action==='up'?node.nextElementSibling:node.previousElementSibling;
          while(neighbor&&(nodes.includes(neighbor)||['title','desc','defs'].includes(neighbor.localName)))neighbor=action==='up'?neighbor.nextElementSibling:neighbor.previousElementSibling;
          if(neighbor)action==='up'?neighbor.after(node):neighbor.before(node);
        }
        contentChanged();return;
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
      const methods={delete:'deleteSelectedElements',group:'groupSelectedElements',ungroup:'ungroupSelectedElement',front:'moveToTopSelectedElement',back:'moveToBottomSelectedElement',convert:'convertToPath'};
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
    else if(event.key==='Escape'){canvas.setMode('select');canvas.setContext(wrapper);canvas.clearSelection();}
    else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();const distance=event.shiftKey?10:1;
      canvas.moveSelectedElements(event.key==='ArrowLeft'?-distance:event.key==='ArrowRight'?distance:0,event.key==='ArrowUp'?-distance:event.key==='ArrowDown'?distance:0,true);contentChanged();
    }
  });
  $('#source-apply').onclick=()=>send('source-request',{source:$('#source-text').value});
  $('#source-cancel').onclick=()=>$('#source-dialog').close();
  const textInput=$('#text');
  canvas.textActions.setInputElem(textInput);
  function textValue(node){
    if(!node.querySelector('tspan'))return node.textContent;
    let value='',y;
    for(const child of node.childNodes){
      if(child.nodeType===3){if(child.textContent.trim())value+=child.textContent;continue;}
      if(child.nodeType!==1)continue;
      const next=child.getAttribute('y');if(value&&((y!==undefined&&next!==null&&next!==y)||parseFloat(child.getAttribute('dy'))>0))value+='\n';
      value+=child.textContent;if(next!==null)y=next;
    }
    return value;
  }
  function writeText(node,value){
    const path=node.querySelector('textPath');if(path){path.textContent=value;return;}
    const first=node.querySelector('tspan');
    if(!first&&!value.includes('\n')){node.textContent=value;return;}
    const x=first?.getAttribute('x')??node.getAttribute('x')??'0',y=parseFloat(first?.getAttribute('y')??node.getAttribute('y')??'0'),size=parseFloat(getComputedStyle(node).fontSize)||6;
    node.replaceChildren(...value.split('\n').map((line,index)=>{const span=first?.cloneNode(false)??document.createElementNS(ns,'tspan');if(index)span.removeAttribute('id');span.removeAttribute('dy');span.setAttribute('x',x);span.setAttribute('y',String(y+index*size*1.4));span.textContent=line;return span;}));
  }
  function beginText(node){
    if(node.closest('[data-locked="true"]'))return;
    if(textSession===node)return;
    if(textSession)canvas.textActions.toSelectMode(true);
    canvas.setContext(graphicContext(node.parentElement));canvas.selectOnly([node],true);
    selected=node;textInput.value=textValue(node);textSession=node;
    const box=node.getBoundingClientRect(),style=getComputedStyle(node),matrix=node.getScreenCTM(),font=(parseFloat(style.fontSize)||6)*Math.hypot(matrix.a,matrix.b);
    textInput.classList.add('is-inline');Object.assign(textInput.style,{left:box.left-5+'px',top:box.top-5+'px',width:Math.max(130,box.width+22)+'px',height:Math.max(font*1.7,box.height+12)+'px',fontFamily:style.fontFamily,fontSize:font+'px',fontWeight:style.fontWeight,fontStyle:style.fontStyle,color:style.fill.startsWith('url(')?'#263729':style.fill,lineHeight:'1.4'});
    node.setAttribute('data-fold-inline-editing','true');canvas.setCurrentMode('textedit');canvas.selectorManager.requestSelector(node).showGrips(false);options.textEditing?.(true);
    textInput.focus({preventScroll:true});textInput.select();
  }
  canvas.textActions.select=beginText;
  canvas.textActions.start=beginText;
  canvas.textActions.toSelectMode=(select=true)=>{
    const node=textSession;if(!node)return;
    textSession=null;node.removeAttribute('data-fold-inline-editing');textInput.classList.remove('is-inline');textInput.removeAttribute('style');canvas.setCurrentMode('select');
    if(select&&node.isConnected)canvas.selectOnly([node],true);
    if(!node.textContent.length){canvas.deleteSelectedElements();contentChanged();}
    options.textEditing?.(false);textInput.blur();
  };
  for(const name of ['init','setCursor','mouseDown','mouseMove','mouseUp'])canvas.textActions[name]=()=>{};
  const endText=()=>{if(textSession)canvas.textActions.toSelectMode(true);};
  textInput.addEventListener('input',()=>{
    if(!textSession)return;writeText(textSession,textInput.value);textInput.style.height=Math.max(38,textInput.scrollHeight+2)+'px';canvas.call('changed',[textSession]);
  });
  textInput.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();endText();container.tabIndex=-1;container.focus({preventScroll:true});}});
  textInput.addEventListener('blur',()=>{if(textSession&&canvas.getMode()==='textedit')endText();});
  container.addEventListener('dblclick',event=>{
    const node=event.target.closest('text')??canvas.getMouseTarget(event);
    if(node?.localName==='text'&&sourceElement()?.contains(node)){event.preventDefault();event.stopImmediatePropagation();beginText(node);return;}
    if(node&&['g','svg'].includes(tagName(node))&&sourceElement()?.contains(node)&&node!==wrapper){event.preventDefault();event.stopImmediatePropagation();canvas.setContext(graphicContext(node));}
  },true);
  container.addEventListener('pointerdown',()=>{if(textSession)endText();},true);
  canvas.bind('selected',(_window,elements)=>{selected=elements?.filter(Boolean).at(-1)??null;refreshTree();refreshProperties();options.selected?.(selected);});
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
  return {canvas,receive,source:snapshot,run,layout,zoom,endText,select:selectElement,refreshTree,refreshProperties,
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
