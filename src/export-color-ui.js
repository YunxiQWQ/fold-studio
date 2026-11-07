import {configureColorManagement,capturePrintTransform,colorStatus} from './color.js';
import {renderPrintSurface} from './print-surface.js';
import {exportJpeg} from './export-jpeg.js';
import {exportVectorPdf,validatePdfFont} from './export-pdf.js';
import {exportRGBSVG} from './export-svg.js';
import {makeDieline} from './geometry.js';
import {download} from './storage.js';
import {icon} from './icons.js';

export function mountExportColorUI(api){
  const $=s=>document.querySelector(s),dialog=document.createElement('dialog');let format,view,busy=false,fontBytes=null,fontToken=0;
  const item=(id,title,detail)=>`<button id="${id}" role="menuitem">${icon('image')}<span><strong>${title}</strong><small>${detail}</small></span></button>`;
  $('#export-png').insertAdjacentHTML('afterend',item('export-jpg','三维预览 JPG','RGB／真正 CMYK · 当前视角'));
  $('#export-flat').insertAdjacentHTML('afterend',item('export-flat-jpg','平面设计 JPG','RGB／真正 CMYK · 可选刀线'));
  $('#export-svg').insertAdjacentHTML('afterend',item('export-pdf','矢量刀版 PDF','RGB／真正 CMYK · 保留路径和文字'));
  dialog.id='export-color-dialog';dialog.className='export-dialog print-dialog';
  dialog.innerHTML=`<button class="dialog-close" data-close aria-label="关闭导出">×</button><span class="dialog-kicker">COLOR MANAGED EXPORT</span><h2 id="color-export-title"></h2><p id="color-export-surface"></p><div class="print-fields"><label>导出色彩模式<select id="color-export-mode"><option value="rgb">RGB · 屏幕与网络</option><option value="cmyk">CMYK · 印刷（嵌入 ICC）</option></select></label><p id="color-export-profile"></p><label id="color-export-quality-label">JPG 质量<select id="color-export-quality"><option value="85">85 · 较小文件</option><option value="92" selected>92 · 推荐</option><option value="98">98 · 高质量</option></select></label><label id="color-export-lines-label" class="checkbox-label"><input id="color-export-lines" type="checkbox" checked />包含刀线和折线</label><div id="color-export-fonts"><p class="field-note">PDF 文字统一使用所选导出字体，默认内置中文替代。需要原字形时，请加载对应字体文件；路径和图片不受影响。</p><label class="button subtle print-import">加载 PDF 字体（TTF／OTF／WOFF）<input id="color-export-font" type="file" accept=".ttf,.otf,.woff,.woff2" /></label><p id="color-export-font-name">内置中文字体 · 常用简体字</p><p class="field-note">PDF 不会把整张刀版转成图片。不支持的滤镜、遮罩、竖排会明确提示，不导出缺失内容的文件。</p></div><p id="color-export-error" class="print-error" role="alert"></p></div><div class="dialog-actions"><button class="button subtle" data-close>取消</button><button id="confirm-color-export" class="button primary">导出</button></div>`;
  document.body.append(dialog);
  for(const button of dialog.querySelectorAll('[data-close]'))button.onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>{fontToken++;});
  function syncProfile(){$('#color-export-profile').textContent=$('#color-export-mode').value==='cmyk'?`印刷 ICC：${colorStatus().name}`:'sRGB 屏幕色彩';}
  function open(nextFormat,nextView){
    api.flush();format=nextFormat;view=nextView;const s=api.getState();$('#export-menu').hidden=true;
    $('#color-export-title').textContent=format==='pdf'?'导出矢量刀版 PDF':view==='3d'?'导出三维预览 JPG':'导出平面设计 JPG';$('#color-export-surface').textContent=view==='3d'?'当前三维视角':`当前${s.side==='inside'?'内面':'外面'} · ${s.dieline.width.toFixed(1)} × ${s.dieline.height.toFixed(1)} mm`;
    $('#color-export-mode').value=s.colorMode;$('#color-export-error').textContent='';$('#color-export-quality-label').hidden=format==='pdf';$('#color-export-lines-label').hidden=view==='3d';$('#color-export-fonts').hidden=format!=='pdf';$('#confirm-color-export').disabled=false;syncProfile();dialog.showModal();
  }
  $('#export-jpg').onclick=()=>open('jpg','3d');$('#export-flat-jpg').onclick=()=>open('jpg','flat');$('#export-pdf').onclick=()=>open('pdf','flat');$('#color-export-mode').onchange=syncProfile;
  $('#color-export-font').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;const token=++fontToken;$('#confirm-color-export').disabled=true;
    try{if(file.size>24*1024*1024)throw Error('PDF 字体文件不能超过 24 MB');const bytes=new Uint8Array(await file.arrayBuffer());if(token!==fontToken||!dialog.open)return;validatePdfFont(bytes);fontBytes=bytes;$('#color-export-font-name').textContent=file.name;$('#color-export-error').textContent='';}
    catch(error){if(token===fontToken)$('#color-export-error').textContent=error.message;}
    finally{if(token===fontToken)$('#confirm-color-export').disabled=false;}
  };
  $('#confirm-color-export').onclick=async()=>{
    let transform;busy=true;const button=$('#confirm-color-export');for(const control of dialog.querySelectorAll('button,select,input'))control.disabled=true;
    try{
      api.flush();const state=api.getState(),copy=structuredClone(state.project),line=makeDieline(copy.type,copy.dimensions),side=state.side,mode=$('#color-export-mode').value,lines=$('#color-export-lines').checked;
      if(mode==='cmyk'){configureColorManagement(copy.printSettings);transform=capturePrintTransform();}
      button.textContent='正在准备…';const onProgress=p=>{button.textContent=`正在导出 ${Math.round(p*100)}%`;};let blob;
      if(format==='pdf'){
        let source=await exportRGBSVG(copy,line,api.images,{side});if(!lines){const doc=new DOMParser().parseFromString(source,'image/svg+xml');doc.querySelector('#dieline')?.remove();source=new XMLSerializer().serializeToString(doc.documentElement);}
        blob=await exportVectorPdf(source,{widthMm:line.width,heightMm:line.height,mode,transform,fontBytes,onProgress});
      }else{
        const canvas=view==='3d'?await api.captureRgb():await renderPrintSurface(copy,line,api.images,{side,includeLines:lines,max:3072});
        blob=await exportJpeg(canvas,{mode,transform,quality:Number($('#color-export-quality').value),dpi:view==='flat'?canvas.width/line.width*25.4:96,onProgress});
      }
      const name=copy.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,80)||'折间工程';download(blob,`${name}-${view==='3d'?'三维预览':side==='inside'?'内面':'外面'}-${mode.toUpperCase()}.${format}`);dialog.close();api.notify(`已导出 ${mode.toUpperCase()} ${format.toUpperCase()}`);
    }catch(error){$('#color-export-error').textContent=error.message;}
    finally{transform?.dispose();busy=false;for(const control of dialog.querySelectorAll('button,select,input'))control.disabled=false;button.textContent='导出';}
  };
}
