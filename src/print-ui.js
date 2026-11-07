import {colorStatus,configureColorManagement,capturePrintTransform} from './color.js';
import {printSettings,validateIcc,encodeIcc,MAX_ICC_BYTES} from './color-settings.js';
import {renderPrintSurface} from './print-surface.js';
import {exportCmykTiff} from './export-cmyk.js';
import {makeDieline} from './geometry.js';
import {download} from './storage.js';
import './print-ui.css';

export function mountPrintUI(api){
  const $=s=>document.querySelector(s),settings=document.createElement('dialog'),output=document.createElement('dialog');let draft,busy=false,readToken=0;
  settings.id='print-settings-dialog';settings.className='export-dialog print-dialog';
  settings.innerHTML=`<button class="dialog-close" data-close aria-label="关闭印刷设置">×</button><span class="dialog-kicker">ICC COLOR MANAGEMENT</span><h2>印刷色彩设置</h2><p>原稿使用 sRGB 编辑，预览通过 ICC 模拟印刷。导出 CMYK TIFF 时才转换成四色数据。</p><div class="print-fields"><label>印刷 ICC 配置<select id="print-profile"><option value="fogra39l">FOGRA39L Coated · 涂布纸胶印</option></select></label><label class="button subtle print-import">导入印厂 ICC（本机使用）<input id="print-icc-input" type="file" accept=".icc,.icm" /></label><small id="print-profile-info">通用配置适用于 FOGRA39 涂布纸条件；其他纸张或设备请使用印厂提供的 ICC。</small><label>转换意图<select id="print-intent"><option value="1">相对比色 · 保留色域内颜色</option><option value="0">感知 · 压缩整体色域</option><option value="3">绝对比色 · 模拟纸白</option><option value="2">饱和度 · 图表用途</option></select></label><label class="checkbox-label"><input id="print-bpc" type="checkbox" />黑点补偿</label><label class="checkbox-label"><input id="print-proof" type="checkbox" />开启 ICC 印刷软打样</label><p class="field-note">屏幕显示仍是 RGB，最终效果取决于印厂、纸张与显示器校准。SVG 保留原始颜色和可编辑图层；TIFF 为合成后的印刷图，不包含专色、叠印或出血扩展。</p><p id="print-settings-error" class="print-error" role="alert"></p></div><div class="dialog-actions"><button data-close class="button subtle">取消</button><button id="apply-print-settings" class="button primary">应用设置</button></div>`;
  output.id='export-cmyk-dialog';output.className='export-dialog print-dialog';
  output.innerHTML=`<button data-close class="dialog-close" aria-label="关闭 CMYK 导出">×</button><span class="dialog-kicker">CMYK TIFF EXPORT</span><h2>导出 CMYK 印刷图</h2><p id="cmyk-output-profile"></p><div class="print-fields"><label>分辨率<select id="cmyk-dpi"><option value="150">150 DPI</option><option value="300" selected>300 DPI</option><option value="600">600 DPI</option></select></label><p id="cmyk-output-size"></p><p class="field-note">8 位 CMYK 四通道 TIFF，嵌入所选 ICC，按实际毫米尺寸输出。透明区域铺白，不包含刀线或折线。可编辑原稿另存 .fold / SVG。</p><p id="cmyk-output-error" class="print-error" role="alert"></p></div><div class="dialog-actions"><button data-close class="button subtle">取消</button><button id="confirm-export-cmyk" class="button primary">导出 TIFF</button></div>`;
  document.body.append(settings,output);
  $('#color-mode-toggle').insertAdjacentHTML('afterend','<button id="print-settings" class="button ghost" title="ICC 配置、转换意图与印刷软打样">印刷设置</button>');
  $('#export-menu').insertAdjacentHTML('beforeend','<button id="export-cmyk" role="menuitem"><span><strong>CMYK 印刷 TIFF</strong><small>真实四色像素 · 嵌入 ICC · 按 DPI 输出</small></span></button>');
  for(const dialog of [settings,output])for(const button of dialog.querySelectorAll('[data-close]'))button.onclick=()=>{if(!busy)dialog.close();};
  output.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  settings.addEventListener('close',()=>{readToken++;$('#apply-print-settings').disabled=false;});
  function profileOptions(){
    const old=$('#print-profile option[value="custom"]');old?.remove();
    if(draft.profile==='custom'){const option=document.createElement('option');option.value='custom';option.textContent=draft.name;$('#print-profile').append(option);}
    $('#print-profile').value=draft.profile;
  }
  $('#print-settings').onclick=()=>{
    readToken++;$('#apply-print-settings').disabled=false;
    draft=printSettings(api.getState().project.printSettings);profileOptions();$('#print-intent').value=draft.intent;$('#print-bpc').checked=draft.blackPointCompensation;$('#print-proof').checked=api.getState().colorMode==='cmyk';$('#print-settings-error').textContent='';settings.showModal();
  };
  $('#print-icc-input').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    const token=++readToken;$('#apply-print-settings').disabled=true;
    try{if(file.size>MAX_ICC_BYTES)throw Error('ICC 文件不能超过 4 MB');const bytes=validateIcc(new Uint8Array(await file.arrayBuffer()));if(token!==readToken||!settings.open)return;draft={...draft,profile:'custom',name:file.name.slice(0,160),icc:encodeIcc(bytes)};profileOptions();$('#print-settings-error').textContent='';}
    catch(error){if(token===readToken&&settings.open)$('#print-settings-error').textContent=error.message;}
    finally{if(token===readToken)$('#apply-print-settings').disabled=false;}
  };
  $('#apply-print-settings').onclick=()=>{
    try{const next=printSettings({...draft,profile:$('#print-profile').value,intent:Number($('#print-intent').value),blackPointCompensation:$('#print-bpc').checked});configureColorManagement(next);api.apply(next,$('#print-proof').checked?'cmyk':'rgb');settings.close();api.notify(`已应用 ICC：${colorStatus().name}`);}
    catch(error){$('#print-settings-error').textContent=error.message;}
  };
  function outputSize(clearError=true){const {dieline}=api.getState(),dpi=Number($('#cmyk-dpi').value),w=Math.ceil(dieline.width*dpi/25.4),h=Math.ceil(dieline.height*dpi/25.4),invalid=w*h>40000000||w>16000||h>16000;$('#cmyk-output-size').textContent=`${dieline.width.toFixed(1)} × ${dieline.height.toFixed(1)} mm · ${w} × ${h} px · 约 ${(w*h*4/1048576).toFixed(1)} MB`;if(clearError||invalid)$('#cmyk-output-error').textContent=invalid?'超过 4000 万像素，请降低 DPI 或缩小盒型。':'';$('#confirm-export-cmyk').disabled=invalid;}
  $('#cmyk-dpi').onchange=outputSize;
  $('#export-cmyk').onclick=()=>{
    try{api.flush();const state=api.getState();configureColorManagement(state.project.printSettings);$('#export-menu').hidden=true;$('#cmyk-output-profile').textContent=`当前${state.side==='inside'?'内面':'外面'} · ${colorStatus().name}`;outputSize();output.showModal();}catch(error){api.notify(error.message);}
  };
  $('#confirm-export-cmyk').onclick=async()=>{
    let transform;const button=$('#confirm-export-cmyk');busy=true;for(const control of output.querySelectorAll('button,select'))control.disabled=true;
    try{
      api.flush();const state=api.getState(),copy=structuredClone(state.project),side=state.side,dpi=Number($('#cmyk-dpi').value);configureColorManagement(copy.printSettings);transform=capturePrintTransform();button.textContent='正在渲染…';
      const canvas=await renderPrintSurface(copy,makeDieline(copy.type,copy.dimensions),api.images,{side,dpi});
      const blob=await exportCmykTiff(canvas,transform,{dpi,onProgress:p=>{button.textContent=`正在转换 ${Math.round(p*100)}%`;}});
      const name=copy.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,80)||'折间工程';download(blob,`${name}-${side==='inside'?'内面':'外面'}-CMYK-${dpi}dpi.tif`);output.close();api.notify(`已导出 CMYK TIFF（${transform.name}）`);
    }catch(error){$('#cmyk-output-error').textContent=`导出失败：${error.message}`;}
    finally{transform?.dispose();busy=false;for(const control of output.querySelectorAll('button,select'))control.disabled=false;button.textContent='导出 TIFF';if(output.open)outputSize(false);}
  };
}
