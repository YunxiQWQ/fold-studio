import {icon} from './icons.js';
import {svgCommandState} from './svg-editor-ui-state.js';

// Use the same commands, selection and history as the toolbar. Opening a menu
// must never begin an SVGCanvas drag or change the artwork.
export function mountSvgContextMenu({editor,designTools}){
  const menu=document.createElement('div');menu.id='canvas-context-menu';menu.className='svg-context-menu';menu.popover='auto';
  menu.setAttribute('role','menu');menu.setAttribute('aria-label','画布快捷操作');menu.tabIndex=-1;document.body.append(menu);
  const row=(key,label,shortcut='',glyph='')=>({key,label,shortcut,glyph});
  const groups={
    arrange:{label:'排列',items:[row('front','置于顶层','Ctrl Shift ]'),row('up','上移一层','Ctrl ]'),row('down','下移一层','Ctrl ['),row('back','置于底层','Ctrl Shift [')]},
    transform:{label:'变换与对齐',items:[row('flip-x','水平翻转'),row('flip-y','垂直翻转'),row('rotation-zero','清除旋转'),null,row('align-l','左对齐'),row('align-c','水平居中'),row('align-r','右对齐'),row('align-t','顶部对齐'),row('align-m','垂直居中'),row('align-b','底部对齐'),row('align-dh','水平等间距分布'),row('align-dv','垂直等间距分布')]},
    similar:{label:'选择相同',items:[row('design:same-fill','填充颜色'),row('design:same-type','对象类型')]},
    layout:{label:'快速排版',items:[row('design:array','阵列复制…','','grid'),row('design:center','居中到当前面'),row('design:fit','等比适配当前面…')]},
    path:{label:'路径',items:[row('nodes','编辑路径节点'),row('convert','转为路径')]},
  };
  let page='',anchor,selection=[];
  const visible=()=>menu.matches(':popover-open');
  const close=()=>{if(visible())menu.hidePopover();};
  function allowed(key){
    const api=editor.api,canvas=api.canvas,state=svgCommandState(canvas,api.selected,api.wrapper,editor.alignment);
    if(groups[key])return groups[key].items.some(item=>item&&allowed(item.key));
    if(key.startsWith('design:'))return designTools.can(key.slice(7));
    if(key==='undo'||key==='redo')return !document.getElementById(key)?.disabled;
    if(key==='paste')return api.hasClipboard;
    if(key==='select-all'||key==='fit')return true;
    if(key==='rotation-zero')return state.can('duplicate')&&Number.isFinite(api.rotation);
    return state.can(key);
  }
  function position(){
    const box=menu.getBoundingClientRect();
    menu.style.left=`${Math.max(8,Math.min(anchor.x,innerWidth-box.width-8))}px`;
    menu.style.top=`${Math.max(8,Math.min(anchor.y,innerHeight-box.height-8))}px`;
  }
  function render(){
    const selected=selection.length>0;
    const items=page?groups[page].items:[row('undo','撤销','Ctrl Z','undo'),row('redo','重做','Ctrl Shift Z','redo'),null,
      ...(selected?[row('cut','剪切','Ctrl X','cut'),row('copy','复制','Ctrl C','copy')]:[]),row('paste','原位粘贴','Ctrl V','paste'),
      ...(selected?[row('duplicate','创建副本','Ctrl D','copy'),null,row('group','组合','Ctrl G','group'),row('ungroup','解组','Ctrl Shift G','ungroup'),row('arrange','排列','','layers'),row('transform','变换与对齐','','settings'),row('similar','选择相同','','cursor'),row('layout','快速排版','','grid'),row('path','路径'),null,row('lock','锁定','Ctrl L','lock'),row('delete','删除','Delete','trash'),null]:[]),
      row('select-all','全选当前层','Ctrl A'),row('fit','适应画布','','fit')];
    menu.replaceChildren();
    if(page){const back=document.createElement('button');back.type='button';back.dataset.contextCommand='back-menu';back.setAttribute('role','menuitem');back.className='svg-context-back';back.innerHTML=`<span aria-hidden="true">‹</span><span>${groups[page].label}</span>`;menu.append(back);}
    for(const item of items){
      if(!item){const line=document.createElement('div');line.setAttribute('role','separator');menu.append(line);continue;}
      const button=document.createElement('button');button.type='button';button.dataset.contextCommand=item.key;button.setAttribute('role','menuitem');button.disabled=!allowed(item.key);
      if(groups[item.key]){button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');}
      if(item.key==='delete')button.className='svg-context-danger';
      button.innerHTML=`<span class="svg-context-icon">${item.glyph?icon(item.glyph):''}</span><span>${item.label}</span>${groups[item.key]?'<span class="svg-context-arrow" aria-hidden="true">›</span>':`<kbd>${item.shortcut}</kbd>`}`;
      menu.append(button);
    }
    if(visible())position();
  }
  function focusFirst(){menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});}
  function activate(key){
    if(key==='back-menu'){const previous=page;page='';render();menu.querySelector(`[data-context-command="${previous}"]`)?.focus({preventScroll:true});return;}
    if(!allowed(key)||selection.some(node=>!node.isConnected))return close();
    if(groups[key]){page=key;render();focusFirst();return;}
    close();editor.host.focus({preventScroll:true});
    if(key.startsWith('design:'))designTools.run(key.slice(7));
    else if(key==='rotation-zero')editor.api.rotateTo(0);
    else if(key==='fit')editor.fit();
    else if(key==='select-all'){
      const api=editor.api,root=api.canvas.getCurrentGroup()??api.wrapper;
      api.canvas.selectOnly([...root.children].filter(node=>{
        if(!['g','svg','path','rect','circle','ellipse','line','polyline','polygon','text','image','use'].includes(node.localName)||node.closest('[data-locked="true"]'))return false;
        const style=getComputedStyle(node);return style.display!=='none'&&!['hidden','collapse'].includes(style.visibility);
      }),true);
    }else editor.run(key);
  }
  menu.addEventListener('click',event=>{const button=event.target.closest('[data-context-command]');if(button&&!button.disabled)activate(button.dataset.contextCommand);});
  menu.addEventListener('keydown',event=>{
    event.stopPropagation();
    const modifier=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    const shortcut=modifier?{c:'copy',x:'cut',v:'paste',d:'duplicate',a:'select-all',g:event.shiftKey?'ungroup':'group',l:'lock',z:event.shiftKey?'redo':'undo',y:'redo'}[key]:event.key==='Delete'?'delete':null;
    if(shortcut){event.preventDefault();if(allowed(shortcut))activate(shortcut);return;}
    const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus({preventScroll:true});
    }else if(event.key==='ArrowRight'&&groups[document.activeElement?.dataset.contextCommand]){event.preventDefault();activate(document.activeElement.dataset.contextCommand);}
    else if(event.key==='ArrowLeft'&&page){event.preventDefault();activate('back-menu');}
    else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();editor.host.focus({preventScroll:true});}
    else if(event.key==='Tab'){close();}
  });
  menu.addEventListener('contextmenu',event=>event.preventDefault());
  window.addEventListener('resize',close);editor.host.addEventListener('wheel',close,{capture:true,passive:true});
  editor.host.tabIndex=0;
  function open(event,keyboard=false){
    if(event.target.closest('input,textarea,[contenteditable="true"]'))return;
    event.preventDefault();close();editor.up();
    const api=editor.api,canvas=api.canvas,root=api.wrapper;
    if(!keyboard){
      const chosen=canvas.getSelectedElements().filter(Boolean);
      let target=chosen.find(node=>node===event.target||node.contains(event.target));
      if(!target&&root.contains(event.target)&&event.target!==root){
        if(!canvas.getCurrentGroup()?.contains(event.target))canvas.setContext(root);
        target=canvas.getMouseTarget(event);
      }
      if(target&&root.contains(target)&&target!==root&&!target.closest('defs,[data-locked="true"]')){
        if(!chosen.some(node=>node===target||node.contains(target)))api.select(target);
      }else if(!event.target.closest('#selectorParentGroup'))canvas.clearSelection();
    }
    selection=canvas.getSelectedElements().filter(Boolean);page='';
    const box=(selection[0]??editor.host).getBoundingClientRect();anchor=keyboard?{x:box.x+Math.min(box.width/2,100),y:box.y+Math.min(box.height/2,100)}:{x:event.clientX,y:event.clientY};
    render();menu.showPopover();position();menu.focus({preventScroll:true});if(keyboard)focusFirst();
  }
  editor.host.addEventListener('keydown',event=>{
    if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')open(event,true);
  });
  return {open,close};
}
