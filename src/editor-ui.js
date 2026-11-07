import {editLayers,expandGroups} from './editor-commands.js';
import {sideOf,clone} from './project.js';
import {escapeHtml as esc,icon} from './icons.js';
import {setTextScale} from './text-transform.js';
import {svgSupport,svgLimitations} from './svg-support.js';
import {svgCommandState} from './svg-editor-ui-state.js';
import {mountDesignTools} from './design-tools-ui.js';
import {mountSvgContextMenu} from './svg-context-menu.js';

function mountNativeUI({editor,addShape,notify}){
  const buttonList=(items,attribute)=>items.map(([value,label])=>`<button type="button" data-${attribute}="${value}">${label}</button>`).join('');
  const select=(id,label,items)=>`<select id="${id}" aria-label="${label}"><option value="">${label}</option>${items.map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select>`;
  const group=(label,content)=>`<section class="native-menu-group" aria-label="${label}"><span>${label}</span>${content}</section>`;
  function menu(trigger,id,content){
    const panel=document.createElement('div');panel.id=id;panel.popover='auto';panel.className='native-edit-menu';
    panel.innerHTML=content;
    trigger.setAttribute('popovertarget',id);
    trigger.setAttribute('aria-controls',id);
    trigger.setAttribute('aria-expanded','false');
    document.body.append(panel);
    panel.addEventListener('beforetoggle',event=>{
      trigger.setAttribute('aria-expanded',String(event.newState==='open'));
      if(event.newState!=='open')return;
      const box=trigger.getBoundingClientRect(),above=box.top-12,below=innerHeight-box.bottom-12;
      const openAbove=below<260&&above>below;
      panel.style.left=`${Math.max(8,Math.min(box.left,innerWidth-232))}px`;
      panel.style.top=openAbove?'auto':`${box.bottom+4}px`;
      panel.style.bottom=openAbove?`${innerHeight-box.top+4}px`:'auto';
      panel.style.maxHeight=`${Math.max(80,openAbove?above:below)}px`;
    });
    panel.addEventListener('click',event=>{if(event.target.closest('button')){panel.hidePopover();trigger.focus({preventScroll:true});}});
    panel.addEventListener('change',event=>{
      const field=event.target.closest('select');if(!field?.value)return;
      editor.run(field.value);field.value='';panel.hidePopover();trigger.focus();
    });
    return panel;
  }
  const shapes=document.querySelector('#add-shape');
  shapes.title='图形与绘制工具';shapes.setAttribute('aria-label',shapes.title);shapes.insertAdjacentHTML('beforeend',icon('down','native-menu-caret'));
  const drawing=menu(shapes,'draw-menu',group('添加', '<button type="button" id="insert-rect">插入预设矩形</button><button type="button" data-mode="text">定位文字</button>')+
    group('绘制',buttonList([['rect','矩形'],['ellipse','椭圆'],['line','直线'],['fhpath','自由线'],['path','钢笔']],'mode')));
  drawing.querySelector('#insert-rect').onclick=addShape;

  const trigger=document.createElement('button');trigger.type='button';trigger.id='edit-menu-toggle';trigger.className='icon-button';
  trigger.title='图层、路径与 SVG 编辑';trigger.setAttribute('aria-label',trigger.title);trigger.innerHTML=icon('more');
  document.querySelector('#edit-menu-anchor').replaceWith(trigger);
  const edit=menu(trigger,'canvas-edit-menu',
    group('图层',buttonList([['group','组合'],['ungroup','解组'],['up','上移一层'],['down','下移一层'],['front','置顶'],['back','置底'],['duplicate','创建副本'],['delete','删除'],['lock','锁定 / 解锁'],['new-layer','新建图层'],['up-context','返回上一级']],'action'))+
    group('路径与变换',buttonList([['nodes','编辑节点'],['convert','转为路径']],'action')+
      select('arrange','排列与变换',[['flip-x','水平翻转'],['flip-y','垂直翻转'],['align-l','左对齐'],['align-c','水平居中'],['align-r','右对齐'],['align-t','上对齐'],['align-m','垂直居中'],['align-b','下对齐'],['align-dh','水平分布'],['align-dv','垂直分布']])+
      select('node-actions','节点操作',[['node-add','插入节点'],['node-delete','删除节点'],['node-line','转直线'],['node-curve','转曲线'],['node-link','关联控制柄'],['node-unlink','独立控制柄'],['node-close','开合子路径'],['node-subpath','绘制子路径']]))+
    group('SVG', '<button type="button" data-action="source">编辑源码</button><button type="button" id="svg-support-button">支持说明</button>'));
  const designTools=mountDesignTools({editor,menu:edit,notify});
  const contextMenu=mountSvgContextMenu({editor,designTools});
  const count=document.createElement('span');count.id='editor-selection-count';count.className='toolbar-selection-count';
  trigger.before(count);
  function sync(){
    const state=svgCommandState(editor.api.canvas,editor.api.selected,editor.api.wrapper,editor.alignment),mode=editor.api.canvas.getMode();
    count.textContent=state.nodes.length?`${state.nodes.length} 项`:'';count.title=state.nodes.length?`已选中 ${state.nodes.length} 个对象`:'';
    for(const button of edit.querySelectorAll('[data-action]'))button.disabled=!state.can(button.dataset.action);
    for(const option of edit.querySelectorAll('#arrange option[value]'))if(option.value)option.disabled=!state.can(option.value);
    edit.querySelector('#arrange').disabled=![...edit.querySelectorAll('#arrange option')].some(option=>option.value&&!option.disabled);
    edit.querySelector('#node-actions').disabled=mode!=='pathedit';
    for(const button of drawing.querySelectorAll('[data-mode]')){const selected=button.dataset.mode===mode;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));}
    for(const [id,value]of [['tool-select','select'],['tool-pan','pan']])document.getElementById(id).setAttribute('aria-pressed',String(mode===value));
    designTools.sync();
  }
  editor.updateToolbar=sync;sync();
  edit.addEventListener('beforetoggle',event=>{if(event.newState==='open')sync();});
  drawing.addEventListener('beforetoggle',event=>{if(event.newState==='open')sync();});
  const support=edit.querySelector('#svg-support-button');
  const dialog=document.createElement('dialog');dialog.id='svg-support-dialog';dialog.className='crop-dialog';
  const heading=document.createElement('h2');heading.textContent='SVG 支持说明';dialog.append(heading);
  const error=document.createElement('p');error.id='svg-support-error';dialog.append(error);
  for(const [title,text]of svgSupport){const p=document.createElement('p');p.textContent=title+'：'+text;dialog.append(p);}
  for(const text of svgLimitations){const p=document.createElement('p');p.textContent=text;dialog.append(p);}
  const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>dialog.close();dialog.append(close);document.body.append(dialog);
  function showSvgSupport(text=''){error.textContent=text;error.hidden=!text;if(!dialog.open)dialog.showModal();}
  support.onclick=()=>showSvgSupport();
  return {run(command){
    if(command==='select-all'){const root=editor.api.wrapper;editor.api.canvas.selectOnly([...root.children].filter(n=>!['defs','title','desc'].includes(n.localName)),true);return;}
    editor.run(command);
  },showSvgSupport,context:event=>contextMenu.open(event),decorateLayers(){},decorateInspector(){},renderMultiInspector(){}};
}

const actions=[['group','组合','Ctrl G'],['ungroup','解组','Ctrl Shift G'],['duplicate','复制一份','Ctrl D'],['lock','锁定 / 解锁','Ctrl L'],['front','置于顶层','Ctrl Shift ]'],['back','置于底层','Ctrl Shift ['],['up','上移一层','Ctrl ]'],['down','下移一层','Ctrl ['],['flip-x','水平翻转',''],['flip-y','垂直翻转',''],['rotate-reset','清除旋转',''],['delete','删除','Del']];
const alignments=[['left','左对齐'],['center-x','水平居中'],['right','右对齐'],['top','顶对齐'],['center-y','垂直居中'],['bottom','底对齐'],['distribute-x','水平等间距'],['distribute-y','垂直等间距']];
const btn=(action,label,tip='')=>`<button type="button" data-editor-action="${action}" title="${tip||label}">${label}</button>`;
const property=(key,label,value,{min=0,max=100,step=.1}={})=>`<label class="property-field"><span>${label}</span><input type="number" data-editor-prop="${key}" value="${value}" min="${min}" max="${max}" step="${step}" aria-label="${label}"/></label>`;

export function mountEditorUI(api){
  if(api.editor.native)return mountNativeUI(api);
  const {getState,editor,images,notify,select,change}=api;
  const bar=document.createElement('div');bar.className='editor-commandbar';bar.setAttribute('aria-label','平面编辑操作');
  bar.innerHTML=`${btn('select-all','全选','Ctrl A · 选择当前印刷面的可见未锁定图层')}${btn('group','组合','Ctrl G')}${btn('ungroup','解组','Ctrl Shift G')}<select id="editor-align" aria-label="对齐与分布"><option value="">对齐 / 分布</option>${alignments.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select><select id="editor-order" aria-label="图层顺序"><option value="">图层顺序</option>${actions.filter(([v])=>['front','back','up','down','lock'].includes(v)).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select>${btn('snap','吸附：开')}${btn('rulers','标尺：开')}${btn('grid','网格：开')}${btn('zoom-100','100%')}<span id="editor-selection-count">未选中图层</span>`;
  document.querySelector('#editor-host').before(bar);
  const svgButton=document.createElement('button');svgButton.type='button';svgButton.dataset.editorAction='import-svg';svgButton.textContent='导入 SVG 图文';bar.prepend(svgButton);
  const editSvgButton=document.createElement('button');editSvgButton.type='button';editSvgButton.dataset.editorAction='edit-svg';editSvgButton.textContent='SVG 编辑器';svgButton.after(editSvgButton);
  const supportButton=document.createElement('button');
  supportButton.type='button';
  supportButton.textContent='SVG 支持说明';
  supportButton.id='svg-support-button';
  editSvgButton.after(supportButton);
  const supportDialog=document.createElement('dialog');
  supportDialog.id='svg-support-dialog';
  supportDialog.className='crop-dialog';
  supportDialog.setAttribute('aria-labelledby','svg-support-title');
  supportDialog.innerHTML=`<h2 id="svg-support-title">SVG 导入支持说明</h2><p id="svg-support-error" role="alert" hidden></p><p>完整原稿在 SVG 编辑器中保留原有图层、分组与可编辑对象。</p><h3>支持的内容</h3>${svgSupport.map(([title,description])=>`<p><strong>${esc(title)}</strong><br/>${esc(description)}</p>`).join('')}<h3>限制与暂不支持的内容</h3><ul>${svgLimitations.map(description=>`<li><p>${esc(description)}</p></li>`).join('')}</ul><div class="dialog-actions"><button class="button primary" type="button">关闭</button></div>`;
  document.body.appendChild(supportDialog);
  supportDialog.querySelector('button').onclick=()=>supportDialog.close();
  function showSvgSupport(error=''){
    const message=supportDialog.querySelector('#svg-support-error');
    message.textContent=error ? `此次导入失败。 ${error}` : '';
    message.hidden=!error;
    if(!supportDialog.open)supportDialog.showModal();
    supportDialog.scrollTop=0;
  }
  supportButton.onclick=()=>showSvgSupport();
  const shortcutList=document.querySelector('.shortcut-list');
  for(const [key,label]of [['Shift / Ctrl 点选','添加 / 移除多个选中图层'],['Ctrl / ⌘ A','全选当前印刷面可见图层'],['Ctrl / ⌘ G','组合选中图层'],['Ctrl / ⌘ Shift G','解组'],['Ctrl / ⌘ L','锁定 / 解锁选中图层'],['Ctrl / ⌘ B / I / U','粗体 / 斜体 / 下划线'],['Ctrl / ⌘ [ / ]','图层后移 / 前移'],['Ctrl / ⌘ Shift [ / ]','图层置底 / 置顶']]){const item=document.createElement('div');item.innerHTML=`<span>${label}</span><kbd>${key}</kbd>`;shortcutList.appendChild(item);}
  const menu=document.createElement('div');menu.className='editor-context-menu';menu.setAttribute('role','menu');menu.hidden=true;document.body.appendChild(menu);
  const cropDialog=document.createElement('dialog');cropDialog.id='crop-dialog';cropDialog.className='crop-dialog';
  cropDialog.innerHTML=`<h2>裁剪图片</h2><p>拖动选取裁剪区域，或输入百分比。修改会实时显示在包装预览中。</p><canvas id="crop-canvas" width="560" height="320" aria-label="拖动设置图片裁剪区域"></canvas><div class="crop-presets">${btn('crop-full','完整图片')}${btn('crop-square','1 : 1')}${btn('crop-wide','16 : 9')}</div><div class="property-grid">${['x','y','w','h'].map((key,i)=>`<label class="property-field"><span>${['左侧 %','顶部 %','宽度 %','高度 %'][i]}</span><input data-crop="${key}" aria-label="${['裁剪左侧','裁剪顶部','裁剪宽度','裁剪高度'][i]}" type="number" min="${i<2?0:1}" max="100" step=".1"/></label>`).join('')}</div><div class="dialog-actions"><button id="cancel-crop" class="button subtle">取消</button><button id="apply-crop" class="button primary">应用裁剪</button></div>`;
  document.body.appendChild(cropDialog);let cropState,dragStart,cropRect;
  const cropCanvas=cropDialog.querySelector('canvas'),cropCtx=cropCanvas.getContext('2d');
  const replaceInput=document.createElement('input');replaceInput.type='file';replaceInput.accept='image/png,image/jpeg,image/webp';replaceInput.hidden=true;document.body.appendChild(replaceInput);
  const ids=()=>getState().ids;
  function setSelection(next){const s=getState(),last=s.project.layers.find(l=>l.id===next.at(-1));select(last?.id??null,last?.panel??s.panelId,next);}
  function run(command,value){
    try{
      editor.up();const s=getState(),list=s.project.layers.filter(l=>s.ids.includes(l.id));
      if(command==='select-all'){setSelection(s.project.layers.filter(l=>sideOf(l)===s.side&&l.visible&&!l.locked).map(l=>l.id));return;}
      if(['snap','rulers'].includes(command)){editor[command]=!editor[command];document.querySelector(`[data-editor-action="${command}"]`).textContent=`${command==='snap'?'吸附':'标尺'}：${editor[command]?'开':'关'}`;editor.invalidate();return;}
      if(command==='grid'){const host=document.querySelector('#editor-host'),off=host.classList.toggle('hide-dot-grid');document.querySelector('[data-editor-action="grid"]').textContent=`网格：${off?'关':'开'}`;return;}
      if(command==='zoom-100'){editor.zoom(1/editor.view.scale);return;}
      if(command==='crop'){openCrop();return;}
      if(command==='replace-image'){replaceInput.click();return;}
      if(command==='import-svg'){document.querySelector('#image-input').click();return;}
      if(command==='edit-svg'){api.editSvg();return;}
      if(command.startsWith('crop-')){cropPreset(command);return;}
      if(['bold','italic','underline'].includes(command)){const targets=list.filter(l=>l.type==='text'&&!l.locked),v=!targets.every(l=>l[command]);for(const l of targets){l[command]=v;if(command==='bold')delete l.fontWeight;}change();return;}
      if(command==='edit-text'){const object=editor.fabric.getActiveObject();if(object?.enterEditing){object.enterEditing();object.selectAll();}return;}
      if(command==='text-scale-reset'){for(const l of list.filter(l=>l.type==='text'&&!l.locked)){setTextScale(l,'x',1);setTextScale(l,'y',1);}change();return;}
      const next=editLayers(s.project,s.dieline,s.ids,command,value);if(command==='delete')images.retain(s.project.layers);setSelection(next);change();
    }catch(e){notify(e.message);}finally{menu.hidden=true;}
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-editor-action]');if(!b)return;e.preventDefault();e.stopPropagation();run(b.dataset.editorAction);},true);
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))menu.hidden=true;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')menu.hidden=true;});
  for(const name of ['align','order'])bar.querySelector(`#editor-${name}`).onchange=e=>{run(e.target.value);e.target.value='';};
  function context(e){const s=getState();menu.innerHTML=actions.map(([v,t,k])=>`<button role="menuitem" data-editor-action="${v}" ${!s.ids.length?'disabled':''}><span>${t}</span><kbd>${k}</kbd></button>`).join('')+btn('select-all','全选当前面');menu.hidden=false;menu.style.left=Math.max(4,Math.min(e.clientX,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(4,Math.min(e.clientY,innerHeight-menu.offsetHeight-8))+'px';}
  function decorateLayers(){
    const s=getState();bar.querySelector('#editor-selection-count').textContent=s.ids.length?`已选择 ${s.ids.length} 个`:'未选中图层';
    document.querySelectorAll('.layer-row').forEach(row=>{
      const l=s.project.layers.find(l=>l.id===row.dataset.layer);row.classList.toggle('selected',s.ids.includes(l.id));row.draggable=!l.locked;
      const lock=document.createElement('button');lock.className='layer-lock';lock.dataset.lockId=l.id;lock.title=l.locked?'解锁图层':'锁定图层';lock.setAttribute('aria-label',lock.title+' '+l.name);lock.textContent=l.locked?'▣':'◇';row.insertBefore(lock,row.lastElementChild);
      if(l.group)row.querySelector('small').append(' · 组合');
      row.ondragstart=e=>{if(!s.ids.includes(l.id))setSelection(expandGroups(s.project,[l.id]));e.dataTransfer.setData('application/x-fold-layer-order',l.id);e.dataTransfer.effectAllowed='move';};
      row.ondragover=e=>{if(e.dataTransfer.types.includes('application/x-fold-layer-order')){e.preventDefault();row.classList.add('layer-drop-target');}};
      row.ondragleave=()=>row.classList.remove('layer-drop-target');
      row.ondrop=e=>{e.preventDefault();row.classList.remove('layer-drop-target');if(!e.dataTransfer.getData('application/x-fold-layer-order'))return;const st=getState(),moving=st.project.layers.filter(l=>st.ids.includes(l.id)&&!l.locked);if(moving.includes(l))return;const rest=st.project.layers.filter(x=>!moving.includes(x)),index=rest.indexOf(l);rest.splice(index+1,0,...moving);st.project.layers=rest;change();};
    });
  }
  document.querySelector('#layer-list').addEventListener('click',e=>{const lock=e.target.closest('[data-lock-id]');if(!lock)return;e.stopImmediatePropagation();const s=getState(),l=s.project.layers.find(l=>l.id===lock.dataset.lockId),group=expandGroups(s.project,[l.id]),value=!l.locked;for(const item of s.project.layers)if(group.includes(item.id))item.locked=value;change();},true);
  function renderMultiInspector(host){
    host.innerHTML=`<section class="inspector-section"><h2>已选择 ${ids().length} 个图层</h2><p class="field-note">Shift / Ctrl 点选，或拖动空白区域框选。拖动控制柄可整体缩放与旋转。</p><div class="editor-action-grid">${actions.map(([v,t,k])=>btn(v,t,k)).join('')}</div></section><section class="inspector-section"><h2>对齐与分布</h2><div class="editor-action-grid">${alignments.map(([v,t])=>btn(v,t)).join('')}</div></section><section class="inspector-section"><h2>批量外观</h2><label class="property-label">填充颜色<input type="color" data-editor-batch="color" aria-label="批量填充颜色" value="#39563c"/></label><label class="property-label">不透明度<input type="range" min="0" max="100" value="100" data-editor-batch="opacity" aria-label="批量不透明度"/></label></section>`;
  }
  function decorateInspector(){
    const s=getState(),l=s.project.layers.find(l=>l.id===s.selected);if(!l||s.ids.length>1)return;const host=document.querySelector('#inspector'),section=document.createElement('section');section.className='inspector-section editor-extra-properties';
    section.innerHTML=`<h2>编辑工具</h2><div class="editor-action-grid">${btn('lock',l.locked?'解锁图层':'锁定图层')}${btn('flip-x','水平翻转')}${btn('flip-y','垂直翻转')}${btn('rotate-reset','清除旋转')}${btn('front','置顶')}${btn('back','置底')}</div><div class="editor-action-grid">${alignments.slice(0,6).map(([v,t])=>btn(v,t)).join('')}</div>`;
    if(l.type==='text')section.innerHTML+=`<h2 class="extra-heading">文字排版</h2><div class="editor-action-grid">${btn('edit-text','画布内编辑')}${btn('italic',l.italic?'取消斜体':'斜体')}${btn('underline',l.underline?'取消下划线':'下划线')}</div><label class="property-label">段落对齐<select data-editor-prop="textAlign" aria-label="文字对齐">${[['left','左对齐'],['center','居中'],['right','右对齐'],['justify','两端对齐']].map(([v,t])=>`<option value="${v}" ${(l.textAlign??'center')===v?'selected':''}>${t}</option>`).join('')}</select></label><div class="property-grid">${property('lineHeight','行距倍数',l.lineHeight??1.5,{min:.7,max:4})}${property('charSpacing','字距（千分之一 em）',l.charSpacing??0,{min:-100,max:1000,step:10})}</div>`;
    if(l.type==='image')section.innerHTML+=`<div class="editor-action-grid">${btn('crop','裁剪图片')}${btn('replace-image','替换图片')}</div>`;
    if(l.type==='svg')section.innerHTML+=`<h2 class="extra-heading">SVG 原稿</h2><p class="field-note">原有图层、分组和对象已保留。双击画布中的 SVG，或打开原稿编辑器修改文字、路径节点与对象。</p>${btn('edit-svg','编辑 SVG 原稿')}<label class="property-label">包装上的整体颜色<select data-editor-prop="svgOriginal" aria-label="SVG 颜色模式"><option value="original" ${l.svgOriginal!==false?'selected':''}>保留原色 / 渐变</option><option value="single" ${l.svgOriginal===false?'selected':''}>统一改色</option></select></label>`;
    if(l.type==='shape'||l.type==='text')section.innerHTML+=`<h2 class="extra-heading">描边${l.type==='shape'?'与圆角':''}</h2><label class="property-label">描边颜色<input type="color" data-editor-prop="stroke" value="${esc(l.stroke??l.color)}" aria-label="描边颜色"/></label><div class="property-grid">${property('strokeWidth','描边宽度 mm',l.strokeWidth??0,{max:20})}${l.type==='shape'?property('radius','圆角 mm',l.radius??0,{max:300}):''}</div>`;
    host.appendChild(section);
    if(l.type==='text'&&l.font==='custom'){const option=document.createElement('option');option.value='custom';option.textContent=`导入字体：${l.fontFamily}`;option.selected=true;host.querySelector('#prop-font').appendChild(option);const tip=document.createElement('p');tip.className='field-note';tip.textContent='字体使用本机已安装的字体，缺失时由浏览器替代。';host.querySelector('#prop-font').closest('section').appendChild(tip);}
    if(l.type==='text'){
      const controls=document.createElement('div');controls.innerHTML=`<label class="property-label">文字控制框<select id="text-transform-mode" aria-label="文字控制框模式"><option value="scale" ${editor.textTransformMode==='scale'?'selected':''}>拉伸文字</option><option value="frame" ${editor.textTransformMode==='frame'?'selected':''}>调整文本框</option></select></label><p class="field-note">拉伸文字保留原换行，按住 Shift 等比例缩放；调整文本框只改框大小与换行。</p><div class="property-grid">${property('textScaleX','水平拉伸 %',+((l.textScaleX??1)*100).toFixed(1),{min:5,max:2000,step:1})}${property('textScaleY','垂直拉伸 %',+((l.textScaleY??1)*100).toFixed(1),{min:5,max:2000,step:1})}</div>${btn('text-scale-reset','还原字形拉伸')}`;
      host.querySelector('#prop-text').closest('section').appendChild(controls);
    }
    if(l.type==='image'){const tip=document.createElement('p');tip.className='field-note';tip.textContent='拖动控制柄自由拉伸；按住 Shift 等比例放大、缩小。';section.prepend(tip);}
    const scope=document.createElement('section');scope.className='inspector-section';scope.innerHTML=`<h2>排版范围</h2><select id="layer-clip-scope" data-editor-prop="clipToPanel" aria-label="排版范围"><option value="sheet" ${!l.clipToPanel?'selected':''}>整张刀版 · 可跨面板</option><option value="panel" ${l.clipToPanel?'selected':''}>仅基准面板</option></select><p class="field-note">默认可拖过折线，图案会连续延伸到相邻面；基准面板只用于定位和尺寸计算。</p>`;host.prepend(scope);
    if(l.type==='shape')for(const [value,text]of [['triangle','三角形'],['line','线条'],['arrow','箭头']]){const option=document.createElement('option');option.value=value;option.textContent=text;option.selected=l.shape===value;host.querySelector('#prop-shape').appendChild(option);}
    if(l.type==='text'){const option=document.createElement('option');option.value='mono';option.textContent='等宽字体';option.selected=l.font==='mono';host.querySelector('#prop-font').appendChild(option);}
  }
  function propertyEvent(e,commit){
    if(e.target.id==='text-transform-mode'){e.stopPropagation();if(commit){editor.setTextTransformMode(e.target.value);const s=getState();select(s.selected,s.panelId,s.ids);}return;}
    const key=e.target.dataset.editorProp,batch=e.target.dataset.editorBatch;if(!key&&!batch)return;e.stopPropagation();const s=getState();if(!e.target.checkValidity())return;
    for(const l of s.project.layers.filter(l=>s.ids.includes(l.id)&&!l.locked)){
      if(batch==='opacity')l.opacity=+e.target.value/100;else if(batch==='color'&&l.type!=='image'&&!(l.type==='svg'&&l.svgOriginal!==false))l.color=e.target.value;
      else if(key==='svgOriginal'&&l.type==='svg')l.svgOriginal=e.target.value==='original';
      else if(key==='clipToPanel')l.clipToPanel=e.target.value==='panel';
      else if(key==='textScaleX'||key==='textScaleY'){if(l.type==='text')setTextScale(l,key==='textScaleX'?'x':'y',+e.target.value/100);}
      else if(key)l[key]=['textAlign','stroke'].includes(key)?e.target.value:+e.target.value;
    }change({commit,render:commit});
  }
  const inspector=document.querySelector('#inspector');inspector.addEventListener('input',e=>propertyEvent(e,false),true);inspector.addEventListener('change',e=>propertyEvent(e,true),true);
  function paintCrop(){
    if(!cropState)return;const {layer,image}=cropState,c=layer.crop??{x:0,y:0,w:1,h:1},scale=Math.min(560/image.naturalWidth,320/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale,x=(560-w)/2,y=(320-h)/2;cropRect={x,y,w,h};cropCtx.clearRect(0,0,560,320);cropCtx.drawImage(image,x,y,w,h);cropCtx.fillStyle='#0008';cropCtx.fillRect(x,y,w,h);cropCtx.save();cropCtx.beginPath();cropCtx.rect(x+c.x*w,y+c.y*h,c.w*w,c.h*h);cropCtx.clip();cropCtx.drawImage(image,x,y,w,h);cropCtx.restore();cropCtx.strokeStyle='#60a5fa';cropCtx.lineWidth=2;cropCtx.strokeRect(x+c.x*w,y+c.y*h,c.w*w,c.h*h);for(const input of cropDialog.querySelectorAll('[data-crop]'))if(document.activeElement!==input)input.value=+(c[input.dataset.crop]*100).toFixed(1);
  }
  function openCrop(){const s=getState(),layer=s.project.layers.find(l=>l.id===s.selected);if(layer?.type!=='image'||layer.locked)return;const image=images.get(layer.src);if(!image)return;cropState={layer,image,original:clone(layer.crop??null),project:s.project};cropDialog.showModal();paintCrop();}
  function cropPreset(command){if(!cropState)return;const {layer,image}=cropState;let w=1,h=1;if(command!=='crop-full'){const aspect=command==='crop-square'?1:16/9,ratio=image.naturalWidth/image.naturalHeight;if(ratio>aspect)w=aspect/ratio;else h=ratio/aspect;}layer.crop={x:(1-w)/2,y:(1-h)/2,w,h};paintCrop();change({commit:false,render:false});}
  cropDialog.addEventListener('input',e=>{const key=e.target.dataset.crop;if(!key||!cropState)return;const c={...(cropState.layer.crop??{x:0,y:0,w:1,h:1})};c[key]=Math.max(key==='x'||key==='y'?0:.01,Math.min(1,+e.target.value/100));c.x=Math.min(.99,c.x);c.y=Math.min(.99,c.y);c.w=Math.min(c.w,1-c.x);c.h=Math.min(c.h,1-c.y);cropState.layer.crop=c;paintCrop();change({commit:false,render:false});});
  const cropPoint=e=>{const r=cropCanvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,((e.clientX-r.left)*560/r.width-cropRect.x)/cropRect.w)),y:Math.max(0,Math.min(1,((e.clientY-r.top)*320/r.height-cropRect.y)/cropRect.h))};};
  cropCanvas.onpointerdown=e=>{if(!cropState)return;dragStart=cropPoint(e);cropCanvas.setPointerCapture(e.pointerId);};cropCanvas.onpointermove=e=>{if(!dragStart)return;const p=cropPoint(e);cropState.layer.crop={x:Math.min(.99,p.x,dragStart.x),y:Math.min(.99,p.y,dragStart.y),w:Math.max(.01,Math.abs(p.x-dragStart.x)),h:Math.max(.01,Math.abs(p.y-dragStart.y))};const c=cropState.layer.crop;c.w=Math.min(c.w,1-c.x);c.h=Math.min(c.h,1-c.y);paintCrop();change({commit:false,render:false});};cropCanvas.onpointerup=cropCanvas.onpointercancel=()=>{dragStart=null;};
  function closeCrop(apply){if(!cropState)return;if(!apply){if(cropState.original)cropState.layer.crop=cropState.original;else delete cropState.layer.crop;}cropState=null;dragStart=null;cropDialog.close();change({commit:apply,render:true});}
  cropDialog.querySelector('#cancel-crop').onclick=()=>closeCrop(false);cropDialog.querySelector('#apply-crop').onclick=()=>closeCrop(true);cropDialog.addEventListener('cancel',e=>{e.preventDefault();closeCrop(false);});
  replaceInput.onchange=async()=>{const file=replaceInput.files[0],s=getState(),l=s.project.layers.find(l=>l.id===s.selected);replaceInput.value='';if(!file||l?.type!=='image'||l.locked)return;if(file.size>5*1024*1024){notify('图片需小于 5 MB');return;}try{const src=await new Promise((r,j)=>{const reader=new FileReader();reader.onload=()=>r(reader.result);reader.onerror=j;reader.readAsDataURL(file);});await images.preload([{type:'image',src}]);if(getState().project!==s.project)return;l.src=src;delete l.crop;change();}catch{notify('无法读取这张图片');}};
  return {run,context,decorateLayers,decorateInspector,renderMultiInspector,showSvgSupport};
}
