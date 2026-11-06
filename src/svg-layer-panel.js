import {icon} from './icons.js';

const resources=new Set('defs linearGradient radialGradient clipPath mask pattern marker symbol filter'.split(' '));
const descriptive=new Set(['title','desc','metadata']);
const names={g:'组合',svg:'SVG 画布',path:'路径',rect:'矩形',circle:'圆形',ellipse:'椭圆',line:'直线',polygon:'多边形',polyline:'折线',text:'文字',tspan:'文字分段',textPath:'路径文字',image:'图片',use:'引用',defs:'资源定义',linearGradient:'线性渐变',radialGradient:'径向渐变',clipPath:'裁切',mask:'蒙版',pattern:'图案',filter:'滤镜',symbol:'符号',marker:'线端标记'};
export function svgLayerName(node){
  const title=[...node.children].find(child=>child.localName==='title')?.textContent;
  const explicit=node.getAttribute('data-name')||title||node.getAttribute('inkscape:label');
  if(explicit)return explicit;
  const id=node.id.replace(/^(?:(?:import|added)-[a-f0-9]{32}-)+/g,'');
  if(id&&!/^svg_\d+$/.test(id))return id;
  if(['text','tspan','textPath'].includes(node.localName)&&node.textContent.trim())return node.textContent.trim().slice(0,60);
  return names[node.localName]??node.localName;
}

export function mountSvgLayerPanel({host,canvas,root,select,change,run,move,count,active}){
  host.innerHTML='<div class="tree-search"><input type="search" id="layer-search" aria-label="搜索图层" placeholder="搜索名称、文字或 ID"><button type="button" id="collapse-layers" title="折叠所有组" aria-label="折叠所有组">⌃</button></div><div class="tree-scroll" role="tree" aria-label="图层与对象" aria-multiselectable="true"></div><nav class="tree-actions" aria-label="图层操作"></nav><div class="tree-status" aria-live="polite"></div>';
  const tree=host.querySelector('.tree-scroll'),search=host.querySelector('input'),status=host.querySelector('.tree-status'),expanded=new Map();
  let anchor=null,dragging=null,dropTarget=null,revealing=false,renaming=null;
  const selection=()=>canvas.getSelectedElements().filter(Boolean);
  const locked=node=>!!node.closest('[data-locked="true"]');
  const hidden=node=>!!node.closest('[display="none"],[visibility="hidden"]');
  const children=node=>[...node.children].filter(child=>!descriptive.has(child.localName));
  const textPart=node=>['tspan','textPath'].includes(node.localName);
  const movable=node=>textPart(node)?node.closest('text'):node;
  const editable=node=>!!movable(node)&&!locked(node)&&!node.closest('defs,mask,clipPath,pattern,marker,symbol,filter');
  const topNodes=nodes=>nodes.filter(node=>!nodes.some(parent=>parent!==node&&parent.contains(node)));
  const labels={ 'new-layer':['plus','新建图层'],group:['group','组合'],ungroup:['ungroup','解组'],up:['up','上移一层'],down:['down','下移一层'],delete:['trash','删除']};
  for(const [command,[glyph,label]]of Object.entries(labels)){
    const button=document.createElement('button');button.type='button';button.dataset.layerCommand=command;
    button.title=label;button.setAttribute('aria-label',label);button.innerHTML=icon(glyph);
    button.onclick=()=>run(command);host.querySelector('.tree-actions').append(button);
  }
  host.querySelector('#collapse-layers').onclick=()=>{for(const node of root().querySelectorAll('[id]'))expanded.set(node.id,false);render();};
  search.oninput=()=>render();

  const menu=document.createElement('div');menu.id='layer-context-menu';menu.className='native-edit-menu';menu.popover='auto';document.body.append(menu);
  for(const [command,label]of [['rename','重命名'],['duplicate','创建副本'],['group','组合'],['ungroup','解组'],['up','上移一层'],['down','下移一层'],['front','置于顶层'],['back','置于底层'],['visibility','显示 / 隐藏'],['lock','锁定 / 解锁'],['delete','删除']]){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.layerCommand=command;
    button.onclick=event=>{event.stopPropagation();menu.hidePopover();command==='rename'?rename(anchor):command==='visibility'?toggleVisibility(anchor):run(command);};menu.append(button);
  }
  function canRun(command){
    const nodes=selection(),current=active();
    if(command==='new-layer')return true;
    if(command==='rename')return !!current;
    if(command==='visibility')return !!current&&!current.parentElement?.closest('[display="none"],[visibility="hidden"]');
    if(command==='lock')return !!current&&!current.closest('defs,mask,clipPath,pattern,marker,symbol,filter');
    if(command==='group')return nodes.length>1;
    if(command==='ungroup')return nodes.some(node=>['g','svg'].includes(node.localName)||node.hasAttribute('data-fold-group'));
    return nodes.length>0;
  }
  function rename(node){
    if(!node?.isConnected)return;
    finishRename(true);
    const button=tree.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);if(!button)return;
    const input=document.createElement('input');input.className='tree-rename';input.value=svgLayerName(node);input.setAttribute('aria-label','图层名称');
    renaming={node,input,original:input.value};button.replaceWith(input);
    input.onkeydown=event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s')return;
      event.stopPropagation();
      if(event.key==='Enter'){event.preventDefault();finishRename(true);}
      if(event.key==='Escape'){event.preventDefault();finishRename(false);}
    };
    input.onblur=()=>{if(renaming?.input===input)finishRename(true);};input.focus();input.select();
  }
  function finishRename(save){
    const session=renaming;if(!session)return;
    renaming=null;
    const value=session.input.value.trim();
    if(save&&session.node.isConnected&&value&&value!==session.original)change(session.node,'data-name',value.slice(0,300));
    else render();
  }
  function toggleVisibility(node){
    if(!node)return;
    if(node.getAttribute('visibility')==='hidden')change(node,'visibility',null);
    else change(node,'display',node.getAttribute('display')==='none'?null:'none');
  }
  function choose(node,event){
    if(event.shiftKey&&anchor?.isConnected&&anchor.parentElement===node.parentElement){
      const visible=new Set([...tree.querySelectorAll('.tree-row')].filter(row=>row.getClientRects().length).map(row=>row.parentElement.dataset.treeNode));
      const siblings=children(node.parentElement).filter(child=>visible.has(child.id)),start=siblings.indexOf(anchor),end=siblings.indexOf(node);
      if(start>=0&&end>=0)select(node,false,siblings.slice(Math.min(start,end),Math.max(start,end)+1));
      else{select(node);anchor=node;}
    }else{select(node,event.ctrlKey||event.metaKey||event.shiftKey);anchor=node;}
  }
  function reveal(nodes){
    if(search.value&&nodes.some(node=>!tree.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`)))search.value='';
    for(const node of nodes)for(let parent=node.parentElement;parent&&parent!==root();parent=parent.parentElement)expanded.set(parent.id,true);
    revealing=true;render();revealing=false;
    tree.querySelector('.tree-label.selected')?.scrollIntoView({block:'nearest'});
  }
  function render(){
    if(dragging||!root())return;
    if(renaming?.node.isConnected&&renaming.input.isConnected)return;
    renaming=null;
    const scroll=tree.scrollTop,selected=new Set(selection()),query=search.value.trim().toLocaleLowerCase();
    const matching=new Set();
    if(query)for(const node of root().querySelectorAll('*')){
      if((svgLayerName(node)+' '+node.id+' '+(node.localName==='text'?node.textContent:'')).toLocaleLowerCase().includes(query)){
        for(let ancestor=node;ancestor&&ancestor!==root();ancestor=ancestor.parentElement)matching.add(ancestor);
      }
    }
    const fragment=document.createDocumentFragment();let objects=0;
    function row(node,depth,inResources=false){
      if(descriptive.has(node.localName)||(query&&!matching.has(node)))return null;
      if(!node.id)node.id=canvas.getNextId();
      const isResource=inResources||resources.has(node.localName),items=children(node).filter(child=>isResource||!resources.has(child.localName));
      if(!isResource)objects++;
      const box=document.createElement(items.length?'details':'div');
      box.dataset.treeNode=node.id;
      const line=document.createElement(items.length?'summary':'div');line.className='tree-row';line.setAttribute('role','treeitem');line.setAttribute('aria-level',String(depth+1));line.setAttribute('aria-selected',String(selected.has(node)));
      line.classList.toggle('is-hidden',hidden(node));line.classList.toggle('is-locked',locked(node));
      if(items.length){
        box.open=query?true:expanded.get(node.id)??(depth===0&&!isResource);
        const toggle=document.createElement('button');toggle.className='tree-toggle';toggle.dataset.toggleNode=node.id;
        toggle.setAttribute('aria-label','展开或折叠 '+svgLayerName(node));toggle.textContent=box.open?'▾':'▸';toggle.setAttribute('aria-expanded',String(box.open));
        toggle.onclick=event=>{event.preventDefault();event.stopPropagation();box.open=!box.open;expanded.set(node.id,box.open);toggle.textContent=box.open?'▾':'▸';toggle.setAttribute('aria-expanded',String(box.open));};line.append(toggle);
      }else{const spacer=document.createElement('span');spacer.className='tree-toggle-space';line.append(spacer);}
      const kind=document.createElement('span');kind.className='tree-kind';kind.innerHTML=icon(isResource?'settings':['g','svg'].includes(node.localName)?'layers':node.localName==='image'?'image':['text','tspan','textPath'].includes(node.localName)?'text':'shape');line.append(kind);
      const button=document.createElement('button');button.type='button';button.className='tree-label';button.dataset.nodeId=node.id;button.dataset.key=node.id;
      button.textContent=svgLayerName(node);button.title=`${svgLayerName(node)} · ${names[node.localName]??node.localName}\nID ${node.id}`;button.classList.toggle('selected',selected.has(node)||active()===node);
      button.onclick=event=>{event.preventDefault();event.stopPropagation();choose(node,event);};
      button.ondblclick=event=>{event.preventDefault();event.stopPropagation();rename(node);};line.append(button);
      if(items.length){const total=document.createElement('small');total.textContent=String(items.length);total.className='tree-child-count';line.append(total);}
      const eye=document.createElement('button');eye.type='button';eye.className='tree-eye';eye.dataset.visibilityNode=node.id;eye.title='显示 / 隐藏 '+svgLayerName(node);eye.setAttribute('aria-label',eye.title);eye.setAttribute('aria-pressed',String(hidden(node)));eye.innerHTML=icon(hidden(node)?'hidden':'eye');
      const hiddenParent=node.parentElement?.closest('[display="none"],[visibility="hidden"]');
      if(hiddenParent){eye.disabled=true;eye.title='由组合 '+svgLayerName(hiddenParent)+' 隐藏，请先显示该组合';eye.setAttribute('aria-label',eye.title);}
      eye.onclick=event=>{event.preventDefault();event.stopPropagation();toggleVisibility(node);};line.append(eye);
      const lock=document.createElement('button');lock.type='button';lock.className='tree-lock';lock.dataset.lockNode=node.id;lock.title='锁定 / 解锁 '+svgLayerName(node);lock.setAttribute('aria-label',lock.title);lock.setAttribute('aria-pressed',String(locked(node)));lock.innerHTML=icon('lock');
      const lockedParent=node.parentElement?.closest('[data-locked="true"]');
      if(lockedParent){lock.disabled=true;lock.title='由组合 '+svgLayerName(lockedParent)+' 锁定，请先解锁该组合';lock.setAttribute('aria-label',lock.title);}
      lock.onclick=event=>{event.preventDefault();event.stopPropagation();change(node,'data-locked',node.getAttribute('data-locked')==='true'?null:'true');};line.append(lock);
      line.oncontextmenu=event=>{
        event.preventDefault();event.stopPropagation();if(!selected.has(node))select(node);anchor=node;
        for(const button of menu.querySelectorAll('button'))button.disabled=!canRun(button.dataset.layerCommand);
        menu.style.left=`${Math.max(8,Math.min(event.clientX,innerWidth-232))}px`;menu.style.top=`${Math.max(8,Math.min(event.clientY,innerHeight-410))}px`;menu.style.maxHeight='min(400px,calc(100vh - 16px))';menu.showPopover();
      };
      line.draggable=!isResource&&editable(node);
      if(textPart(node)){line.dataset.dragOwner=movable(node)?.id;line.title='拖动此分段可调整整段文字的图层顺序';button.title+=' · 拖动时移动整段文字';}
      line.ondragstart=event=>{
        if(!editable(node))return event.preventDefault();
        const owner=movable(node);dragging=[];if(!selection().includes(owner))select(owner);
        dragging=topNodes([...new Set(selection().map(movable).filter(editable))]);event.dataTransfer.setData('application/x-fold-layer',owner.id);event.dataTransfer.effectAllowed='move';line.classList.add('is-dragging');
      };
      line.ondragover=event=>{
        const target=movable(node);
        if(!dragging?.length||isResource||!target||dragging.some(source=>source===target||source.contains(target)))return;
        const bounds=line.getBoundingClientRect(),ratio=(event.clientY-bounds.top)/bounds.height;
        const position=['g','svg'].includes(target.localName)&&ratio>.3&&ratio<.7?'inside':ratio<.5?'before':'after';
        if(position==='inside'&&locked(target))return;
        event.preventDefault();event.dataTransfer.dropEffect='move';
        if(dropTarget)dropTarget.line.removeAttribute('data-drop');
        line.dataset.drop=position;dropTarget={node:target,line,position};
      };
      line.ondrop=event=>{
        if(!dragging?.length||dropTarget?.line!==line)return;
        event.preventDefault();event.stopPropagation();const nodes=dragging,position=dropTarget.position,target=dropTarget.node;
        dragging=null;dropTarget.line.removeAttribute('data-drop');dropTarget=null;
        try{move(nodes,target,position);status.textContent='已移动图层';}catch(error){status.textContent=error.message;}render();
      };
      line.ondragend=()=>{dragging=null;if(dropTarget)dropTarget.line.removeAttribute('data-drop');dropTarget=null;render();};
      line.onkeydown=event=>{if(event.key==='F2'){event.preventDefault();event.stopPropagation();rename(node);}};
      box.append(line);
      if(items.length){
        const list=document.createElement('div');list.className='tree-children';
        for(const child of [...items].reverse()){const element=row(child,depth+1,isResource);if(element)list.append(element);}box.append(list);
      }
      return box;
    }
    const roots=children(root()),definitions=[...root().querySelectorAll('*')].filter(node=>resources.has(node.localName)&&!node.parentElement.closest('defs,linearGradient,radialGradient,clipPath,mask,pattern,marker,symbol,filter'));
    for(const node of roots.filter(node=>!resources.has(node.localName)).reverse()){const entry=row(node,0);if(entry)fragment.append(entry);}
    if(definitions.length){
      const section=document.createElement('details');section.className='tree-resources';section.open=query?true:expanded.get('resources')??false;
      const heading=document.createElement('summary');heading.textContent=`SVG 资源 · ${definitions.length}`;section.append(heading);section.ontoggle=()=>{if(section.isConnected)expanded.set('resources',section.open);};
      for(const node of definitions){const entry=row(node,0,true);if(entry)section.append(entry);}fragment.append(section);
    }
    if(query&&!matching.size){const empty=document.createElement('p');empty.className='tree-empty';empty.textContent='没有匹配的图层';fragment.append(empty);}
    tree.replaceChildren(fragment);if(!revealing)tree.scrollTop=scroll;
    for(const button of host.querySelectorAll('.tree-actions button')){
      button.disabled=!canRun(button.dataset.layerCommand);
    }
    count?.(objects,selected.size);
  }
  return {render,reveal,finishRename,get dirty(){return !!renaming&&renaming.input.value!==renaming.original;}};
}
