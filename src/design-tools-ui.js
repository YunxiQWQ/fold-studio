import {arraySvgSelection,placeSvgSelection,selectSvgSimilar,svgSelectionBounds} from './svg-design-tools.js';
import {svgCommandState} from './svg-editor-ui-state.js';

export function mountDesignTools({editor,menu,notify}){
  const section=document.createElement('section');section.className='native-menu-group';section.setAttribute('aria-label','快速排版');
  const heading=document.createElement('span');heading.textContent='快速排版';section.append(heading);
  const buttons=new Map();
  for(const [key,title]of [['same-fill','选择同填色'],['same-type','选择同类型'],['array','阵列复制…'],['center','居中到当前面'],['fit','等比适配当前面…']]){
    const button=document.createElement('button');button.type='button';button.dataset.designTool=key;button.textContent=title;section.append(button);buttons.set(key,button);
  }
  menu.querySelector('.native-menu-group:last-child').before(section);
  const dialog=document.createElement('dialog');dialog.id='design-tools-dialog';dialog.className='design-tools-dialog';dialog.setAttribute('aria-labelledby','design-tools-title');
  dialog.innerHTML='<form><h2 id="design-tools-title"></h2><p id="design-tools-context"></p><div id="design-tools-fields"></div><div id="design-array-preview" aria-hidden="true"></div><output id="design-tools-summary" aria-live="polite"></output><p id="design-tools-note"></p><p id="design-tools-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" id="cancel-design-tools">取消</button><button type="submit" class="button primary" id="apply-design-tools">创建阵列</button></div></form>';
  document.body.append(dialog);const $=selector=>dialog.querySelector(selector);let session;
  const number=(key,label,value,{min=0,max=1000,step=.1}={})=>`<label>${label}<input type="number" id="design-${key}" min="${min}" max="${max}" step="${step}" value="${value}" required></label>`;
  const values=()=>Object.fromEntries([...$('#design-tools-fields').querySelectorAll('input')].map(input=>[input.id.slice(7),input.value===''?NaN:Number(input.value)]));
  const context=()=>({project:editor.project,side:editor.side,panel:editor.panelId,ids:editor.api.canvas.getSelectedElements().filter(Boolean).map(node=>node.id).join('|')});
  function validSession(){const current=context();return session&&Object.keys(current).every(key=>current[key]===session[key]);}
  function showError(error){$('#design-tools-error').textContent=error.message;$('#design-tools-error').hidden=false;}
  function preview(){
    $('#design-tools-error').hidden=true;const current=values(),array=session.tool==='array';
    if(array){
      const {rows,columns,gapX,gapY}=current,b=session.bounds;
      const valid=Number.isInteger(rows)&&Number.isInteger(columns)&&rows>=1&&columns>=1&&rows<=20&&columns<=20&&rows*columns>=2&&rows*columns<=100&&[gapX,gapY].every(v=>Number.isFinite(v)&&v>=0&&v<=1000);
      $('#apply-design-tools').disabled=!valid;
      $('#design-tools-summary').textContent=valid?`${rows} 行 × ${columns} 列，共 ${rows*columns} 组（含原图） · ${(columns*b.width+(columns-1)*gapX).toFixed(1)} × ${(rows*b.height+(rows-1)*gapY).toFixed(1)} mm`:'总数须为 2–100，行列为 1–20 的整数，间距为 0–1000 mm';
      const preview=$('#design-array-preview');preview.replaceChildren();
      if(valid){
        const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
        const width=columns*b.width+(columns-1)*gapX,height=rows*b.height+(rows-1)*gapY;svg.setAttribute('viewBox',`-1 -1 ${width+2} ${height+2}`);
        for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const rect=document.createElementNS(ns,'rect');for(const [key,value]of Object.entries({x:c*(b.width+gapX),y:r*(b.height+gapY),width:b.width,height:b.height}))rect.setAttribute(key,value);rect.setAttribute('class',!r&&!c?'array-original':'');svg.append(rect);}preview.append(svg);
      }
    }else{
      const panel=editor.dieline.panels.find(p=>p.id===editor.panelId),m=current.margin,valid=Number.isFinite(m)&&m>=0&&m<=1000&&panel.w>2*m&&panel.h>2*m;
      $('#apply-design-tools').disabled=!valid;$('#design-tools-summary').textContent=valid?`可用范围 ${(panel.w-2*m).toFixed(1)} × ${(panel.h-2*m).toFixed(1)} mm`:'留边须小于面板短边的一半';
    }
  }
  function open(tool){
    editor.up();const bounds=editor.api.sourceStyles(()=>svgSelectionBounds(editor));session={...context(),tool,bounds};
    const panel=editor.dieline.panels.find(p=>p.id===editor.panelId);
    $('#design-tools-title').textContent=tool==='array'?'阵列复制':'等比适配当前面';
    $('#design-tools-context').textContent=`${editor.side==='inside'?'内面':'外面'} · ${tool==='array'?`选区 ${bounds.width.toFixed(1)} × ${bounds.height.toFixed(1)} mm`:panel.label+' · '+panel.w.toFixed(1)+' × '+panel.h.toFixed(1)+' mm'}`;
    $('#design-tools-fields').innerHTML=tool==='array'?number('rows','行数',2,{min:1,max:20,step:1})+number('columns','列数',3,{min:1,max:20,step:1})+number('gapX','横向净间距（mm）',5)+number('gapY','纵向净间距（mm）',5):number('margin','四周留边（mm）',3);
    $('#design-array-preview').hidden=tool!=='array';$('#apply-design-tools').textContent=tool==='array'?'创建阵列':'等比适配';
    $('#design-tools-note').textContent=tool==='array'?'保持原有文字、路径和资源引用。净间距按图形外接框计算，不含描边与滤镜。':'按当前面板外接矩形等比缩放并居中；异形边缘和孔位需另行留白。';
    preview();dialog.showModal();$('#design-tools-fields input').focus();$('#design-tools-fields input').select();
  }
  $('#cancel-design-tools').onclick=()=>dialog.close();
  $('#design-tools-fields').addEventListener('input',preview);
  dialog.querySelector('form').onsubmit=event=>{
    event.preventDefault();if($('#apply-design-tools').disabled)return;
    try{
      if(!validSession())throw Error('选区或工程已改变，请关闭后重新操作');
      if(session.tool==='array'){const result=arraySvgSelection(editor,values());notify(`已创建 ${result.copies} 组副本，可一次撤销`);}
      else{placeSvgSelection(editor,{fit:true,...values()});notify('已等比适配当前面板，可撤销');}
      dialog.close();
    }catch(error){showError(error);}
  };
  dialog.addEventListener('close',()=>{session=null;document.querySelector('#edit-menu-toggle')?.focus({preventScroll:true});});
  for(const [key,button]of buttons)button.onclick=()=>{
    try{
      if(key==='same-fill'||key==='same-type'){const count=selectSvgSimilar(editor,key==='same-fill'?'fill':'type');notify(`已选择 ${count} 个对象（当前面，跳过隐藏和锁定对象）`);}
      else if(key==='center'){placeSvgSelection(editor);notify('已居中到当前面板，可撤销');}
      else open(key);
    }catch(error){notify(error.message);}
  };
  return {sync(){
    const state=svgCommandState(editor.api.canvas,editor.api.selected,editor.api.wrapper);
    for(const [key,button]of buttons)button.disabled=!state.can(key==='same-type'||key==='same-fill'?'copy':'duplicate');
  }};
}
