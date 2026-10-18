import {PACKAGING_SYMBOLS,drawSymbol} from './symbols.js';
import {barcodeStatus} from './barcode.js';
import {qrStatus} from './qrcode.js';
import {escapeHtml as esc} from './icons.js';

export function mountPackagingUI(getLayer){
  const host=document.querySelector('#inspector'),dialog=document.createElement('dialog');dialog.id='symbol-library';dialog.className='symbol-library';
  dialog.innerHTML=`<div class="symbol-library-heading"><div><h2>常用标志库</h2><p>开源 SVG 图形 · 添加后可修改颜色、尺寸和旋转</p></div><button type="button" id="close-symbol-library" aria-label="关闭标志库">✕</button></div><div class="symbol-library-filters"><input type="search" id="symbol-search" aria-label="搜索常用标志" placeholder="搜索名称，如：易碎、回收、冷冻"/><select id="symbol-category" aria-label="标志分类"><option value="">全部分类</option>${['运输与储存','回收与材质','食品与日用'].map(s=>`<option>${s}</option>`).join('')}</select></div><p id="symbol-count" aria-live="polite"></p><div class="symbol-library-grid"></div><p class="field-note">图形来源：Pictogrammers MDI（Apache-2.0）及兼容旧工程的内置图形。图形本身不代表获得产品认证。</p>`;
  document.body.appendChild(dialog);const search=dialog.querySelector('#symbol-search'),category=dialog.querySelector('#symbol-category'),grid=dialog.querySelector('.symbol-library-grid');let editingId;
  function paint(){
    const query=search.value.trim().toLowerCase(),items=PACKAGING_SYMBOLS.filter(s=>(!category.value||s.category===category.value)&&`${s.name} ${s.id}`.toLowerCase().includes(query));
    dialog.querySelector('#symbol-count').textContent=`${items.length} 款标志`;
    grid.innerHTML=items.length?items.map(s=>`<button type="button" data-symbol-id="${s.id}" aria-label="${esc(s.name)}" aria-pressed="${getLayer()?.symbol===s.id}"><canvas width="100" height="100" aria-hidden="true"></canvas><span>${esc(s.name)}</span><small>${esc(s.category)}</small></button>`).join(''):'<p class="symbol-empty">没有匹配的标志，请调整搜索词。</p>';
    for(const button of grid.querySelectorAll('[data-symbol-id]')){const ctx=button.querySelector('canvas').getContext('2d');ctx.translate(50,50);drawSymbol(ctx,button.dataset.symbolId,84,84,'#263b2c');}
  }
  host.addEventListener('click',e=>{if(!e.target.closest('#browse-symbols'))return;editingId=getLayer()?.id;search.value='';category.value='';paint();dialog.showModal();search.focus();});
  grid.addEventListener('click',e=>{const button=e.target.closest('[data-symbol-id]');if(!button)return;if(getLayer()?.id!==editingId){dialog.close();return;}const select=host.querySelector('#prop-symbol');if(select){select.value=button.dataset.symbolId;select.dispatchEvent(new Event('change',{bubbles:true}));}dialog.close();});
  search.addEventListener('input',paint);category.addEventListener('change',paint);dialog.querySelector('#close-symbol-library').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  function feedback(){
    const layer=getLayer();
    if(layer?.type==='symbol'){const canvas=host.querySelector('.symbol-current canvas');if(canvas){const ctx=canvas.getContext('2d');ctx.setTransform(1,0,0,1,50,50);ctx.clearRect(-50,-50,100,100);drawSymbol(ctx,layer.symbol,84,84,layer.color);}return;}
    if(!layer||!['barcode','qrcode'].includes(layer.type))return;
    const status=layer.type==='barcode'?barcodeStatus(layer):qrStatus(layer.text,layer.errorCorrectionLevel??'M'),input=host.querySelector(layer.type==='barcode'?'#prop-barcode-code':'#prop-qrcode-text'),note=host.querySelector('#code-feedback');
    if(!input||!note)return;input.setAttribute('aria-invalid',String(!!status.error));note.classList.toggle('code-error',!!status.error);
    note.textContent=status.error??(layer.type==='barcode'?`有效编码：${status.digits??status.text}${(layer.format??'ean13')==='ean13'&&layer.code.length===12?'（已自动补齐校验位）':''}`:`版本 ${status.version} · ${status.size} × ${status.size} 模块 · 四模块静区`);
  }
  for(const type of ['input','change'])host.addEventListener(type,()=>queueMicrotask(feedback));
  function decorate(){
    const layer=getLayer();if(!layer)return;
    if(layer.type==='symbol'){
      const select=host.querySelector('#prop-symbol');if(!select)return;const section=select.closest('section'),item=PACKAGING_SYMBOLS.find(s=>s.id===layer.symbol);
      const preview=document.createElement('div');preview.className='symbol-current';preview.innerHTML=`<canvas width="100" height="100" aria-label="当前标志预览"></canvas><span>${esc(item?.name??layer.symbol)}<small>${esc(item?.source??'旧版内置图形')}</small></span>`;const ctx=preview.querySelector('canvas').getContext('2d');ctx.translate(50,50);drawSymbol(ctx,layer.symbol,84,84,layer.color);section.prepend(preview);
      const button=document.createElement('button');button.id='browse-symbols';button.className='wide-button';button.textContent=`浏览标志库 · ${PACKAGING_SYMBOLS.length} 款`;section.appendChild(button);section.querySelector('.field-note').textContent='矢量图形，可缩放与改色。';
    }
    if(['barcode','qrcode'].includes(layer.type)){
      const input=host.querySelector(layer.type==='barcode'?'#prop-barcode-code':'#prop-qrcode-text');if(!input)return;input.removeAttribute('style');input.setAttribute('aria-label',layer.type==='barcode'?'条码内容':'二维码内容');input.setAttribute('aria-describedby','code-feedback');if(layer.type==='barcode')input.maxLength=120;
      const section=input.closest('section'),note=section.querySelector('.field-note');note.id='code-feedback';note.setAttribute('aria-live','polite');
      if(layer.type==='qrcode'){
        const label=document.createElement('label');label.className='property-label';label.innerHTML=`纠错等级<select id="prop-qrcode-level" aria-label="二维码纠错等级">${[['L','L · 7%'],['M','M · 15%'],['Q','Q · 25%'],['H','H · 30%']].map(([v,t])=>`<option value="${v}" ${(layer.errorCorrectionLevel??'M')===v?'selected':''}>${t}</option>`).join('')}</select>`;section.insertBefore(label,note);
      }feedback();
    }
  }
  return {decorate,feedback};
}
