import {editLayers,expandGroups} from './editor-commands.js';
import {sideOf,clone} from './project.js';
import {escapeHtml as esc} from './icons.js';

const actions=[['group','组合','Ctrl G'],['ungroup','解组','Ctrl Shift G'],['duplicate','复制一份','Ctrl D'],['lock','锁定 / 解锁','Ctrl L'],['front','置于顶层','Ctrl Shift ]'],['back','置于底层','Ctrl Shift ['],['up','上移一层','Ctrl ]'],['down','下移一层','Ctrl ['],['flip-x','水平翻转',''],['flip-y','垂直翻转',''],['rotate-reset','清除旋转',''],['delete','删除','Del']];
const alignments=[['left','左对齐'],['center-x','水平居中'],['right','右对齐'],['top','顶对齐'],['center-y','垂直居中'],['bottom','底对齐'],['distribute-x','水平等间距'],['distribute-y','垂直等间距']];
const btn=(action,label,tip='')=>`<button type="button" data-editor-action="${action}" title="${tip||label}">${label}</button>`;
const property=(key,label,value,{min=0,max=100,step=.1}={})=>`<label class="property-field"><span>${label}</span><input type="number" data-editor-prop="${key}" value="${value}" min="${min}" max="${max}" step="${step}" aria-label="${label}"/></label>`;

export function mountEditorUI(api){
  const {getState,editor,images,notify,select,change}=api;
  const bar=document.createElement('div');bar.className='editor-commandbar';bar.setAttribute('aria-label','平面编辑操作');
  bar.innerHTML=`${btn('select-all','全选','Ctrl A · 选择当前印刷面的可见未锁定图层')}${btn('group','组合','Ctrl G')}${btn('ungroup','解组','Ctrl Shift G')}<select id="editor-align" aria-label="对齐与分布"><option value="">对齐 / 分布</option>${alignments.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select><select id="editor-order" aria-label="图层顺序"><option value="">图层顺序</option>${actions.filter(([v])=>['front','back','up','down','lock'].includes(v)).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select>${btn('snap','吸附：开')}${btn('rulers','标尺：开')}${btn('grid','网格：开')}${btn('zoom-100','100%')}<span id="editor-selection-count">未选中图层</span>`;
  document.querySelector('#editor-host').before(bar);
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
      if(command.startsWith('crop-')){cropPreset(command);return;}
      if(['bold','italic','underline'].includes(command)){const targets=list.filter(l=>l.type==='text'&&!l.locked),v=!targets.every(l=>l[command]);for(const l of targets)l[command]=v;change();return;}
      if(command==='edit-text'){const object=editor.fabric.getActiveObject();if(object?.enterEditing){object.enterEditing();object.selectAll();}return;}
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
    if(l.type==='shape'||l.type==='text')section.innerHTML+=`<h2 class="extra-heading">描边${l.type==='shape'?'与圆角':''}</h2><label class="property-label">描边颜色<input type="color" data-editor-prop="stroke" value="${esc(l.stroke??l.color)}" aria-label="描边颜色"/></label><div class="property-grid">${property('strokeWidth','描边宽度 mm',l.strokeWidth??0,{max:20})}${l.type==='shape'?property('radius','圆角 mm',l.radius??0,{max:300}):''}</div>`;
    host.appendChild(section);
    const scope=document.createElement('section');scope.className='inspector-section';scope.innerHTML=`<h2>排版范围</h2><select id="layer-clip-scope" data-editor-prop="clipToPanel" aria-label="排版范围"><option value="sheet" ${!l.clipToPanel?'selected':''}>整张刀版 · 可跨面板</option><option value="panel" ${l.clipToPanel?'selected':''}>仅基准面板</option></select><p class="field-note">默认可拖过折线，图案会连续延伸到相邻面；基准面板只用于定位和尺寸计算。</p>`;host.prepend(scope);
    if(l.type==='shape')for(const [value,text]of [['triangle','三角形'],['line','线条'],['arrow','箭头']]){const option=document.createElement('option');option.value=value;option.textContent=text;option.selected=l.shape===value;host.querySelector('#prop-shape').appendChild(option);}
    if(l.type==='text'){const option=document.createElement('option');option.value='mono';option.textContent='等宽字体';option.selected=l.font==='mono';host.querySelector('#prop-font').appendChild(option);}
  }
  function propertyEvent(e,commit){
    const key=e.target.dataset.editorProp,batch=e.target.dataset.editorBatch;if(!key&&!batch)return;e.stopPropagation();const s=getState();if(!e.target.checkValidity())return;
    for(const l of s.project.layers.filter(l=>s.ids.includes(l.id)&&!l.locked)){
      if(batch==='opacity')l.opacity=+e.target.value/100;else if(batch==='color'&&l.type!=='image')l.color=e.target.value;
      else if(key==='clipToPanel')l.clipToPanel=e.target.value==='panel';
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
  return {run,context,decorateLayers,decorateInspector,renderMultiInspector};
}
