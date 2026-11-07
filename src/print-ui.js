import {colorStatus,configureColorManagement} from './color.js';
import {printSettings,validateIcc,encodeIcc,MAX_ICC_BYTES} from './color-settings.js';
import './print-ui.css';

export function mountPrintUI(api){
  const $=s=>document.querySelector(s),settings=document.createElement('dialog');let draft,readToken=0;
  settings.id='print-settings-dialog';settings.className='export-dialog print-dialog';
  settings.innerHTML=`<button class="dialog-close" data-close aria-label="关闭印刷设置">×</button><span class="dialog-kicker">ICC COLOR MANAGEMENT</span><h2>印刷色彩设置</h2><p>选择 RGB 屏幕或 CMYK 印刷。JPG／PDF 可输出真实 CMYK；SVG 保持可编辑，以 RGB 表达 CMYK 打样色域。</p><div class="print-fields"><label>印刷 ICC 配置<select id="print-profile"><option value="fogra39l">FOGRA39L Coated · 涂布纸胶印</option></select></label><label class="button subtle print-import">导入印厂 ICC（本机使用）<input id="print-icc-input" type="file" accept=".icc,.icm" /></label><small id="print-profile-info">通用配置适用于 FOGRA39 涂布纸条件；其他纸张或设备请使用印厂提供的 ICC。</small><label>转换意图<select id="print-intent"><option value="1">相对比色 · 保留色域内颜色</option><option value="0">感知 · 压缩整体色域</option><option value="3">绝对比色 · 模拟纸白</option><option value="2">饱和度 · 图表用途</option></select></label><label class="checkbox-label"><input id="print-bpc" type="checkbox" />黑点补偿</label><label>工程色彩模式<select id="print-document-mode"><option value="rgb">RGB · 屏幕与网络</option><option value="cmyk">CMYK · 印刷与 ICC 打样</option></select></label><p class="field-note">屏幕显示仍是 RGB，最终效果取决于印厂、纸张与显示器校准。SVG 采用所选色域的显示色；需要真实四色矢量请导出 PDF。PDF 的未提供字体使用内置中文替代；不包含专色、叠印或自动出血。</p><p id="print-settings-error" class="print-error" role="alert"></p></div><div class="dialog-actions"><button data-close class="button subtle">取消</button><button id="apply-print-settings" class="button primary">应用设置</button></div>`;
  document.body.append(settings);
  $('#color-mode-toggle').insertAdjacentHTML('afterend','<button id="print-settings" class="button ghost" title="ICC 配置、转换意图与印刷软打样">印刷设置</button>');
  for(const button of settings.querySelectorAll('[data-close]'))button.onclick=()=>settings.close();
  settings.addEventListener('close',()=>{readToken++;$('#apply-print-settings').disabled=false;});
  function profileOptions(){
    const old=$('#print-profile option[value="custom"]');old?.remove();
    if(draft.profile==='custom'){const option=document.createElement('option');option.value='custom';option.textContent=draft.name;$('#print-profile').append(option);}
    $('#print-profile').value=draft.profile;
  }
  $('#print-settings').onclick=()=>{
    readToken++;$('#apply-print-settings').disabled=false;
    draft=printSettings(api.getState().project.printSettings);profileOptions();$('#print-intent').value=draft.intent;$('#print-bpc').checked=draft.blackPointCompensation;$('#print-document-mode').value=api.getState().colorMode;$('#print-settings-error').textContent='';settings.showModal();
  };
  $('#print-icc-input').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    const token=++readToken;$('#apply-print-settings').disabled=true;
    try{if(file.size>MAX_ICC_BYTES)throw Error('ICC 文件不能超过 4 MB');const bytes=validateIcc(new Uint8Array(await file.arrayBuffer()));if(token!==readToken||!settings.open)return;draft={...draft,profile:'custom',name:file.name.slice(0,160),icc:encodeIcc(bytes)};profileOptions();$('#print-settings-error').textContent='';}
    catch(error){if(token===readToken&&settings.open)$('#print-settings-error').textContent=error.message;}
    finally{if(token===readToken)$('#apply-print-settings').disabled=false;}
  };
  $('#apply-print-settings').onclick=()=>{
    try{const next=printSettings({...draft,profile:$('#print-profile').value,intent:Number($('#print-intent').value),blackPointCompensation:$('#print-bpc').checked});configureColorManagement(next);api.apply(next,$('#print-document-mode').value);settings.close();api.notify(`已应用 ICC：${colorStatus().name}`);}
    catch(error){$('#print-settings-error').textContent=error.message;}
  };
}
