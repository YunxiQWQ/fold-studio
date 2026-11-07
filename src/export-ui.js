import {icon} from './icons.js';
import {configureColorManagement,colorStatus,capturePrintTransform,proofCanvas} from './color.js';
import {renderPrintSurface} from './print-surface.js';
import {exportSVG,exportRGBSVG} from './export-svg.js';
import {proofSvgSource} from './export-svg-color.js';
import {parseSvgDocument,svgDocumentSource} from './import-svg.js';
import {exportJpeg} from './export-jpeg.js';
import {exportVectorPdf,validatePdfFont} from './export-pdf.js';
import {exportCmykTiff} from './export-cmyk.js';
import {exportGLB} from './export3d.js';
import {makeDieline} from './geometry.js';
import {download} from './storage.js';
import './export-ui.css';

const formats={
  flat:[['png','PNG · 透明图片'],['jpg','JPG · 设计预览'],['svg','SVG · 可编辑刀版'],['pdf','PDF · 矢量文件'],['tiff','TIFF · CMYK 印刷图']],
  artwork:[['svg','SVG · 可编辑图文']],
  '3d':[['png','PNG · 当前视角'],['jpg','JPG · 当前视角']],
  model:[['glb','GLB · 三维模型']],
};
const cleanName=value=>value.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,80)||'折间工程';
const stripLines=source=>{const doc=new DOMParser().parseFromString(source,'image/svg+xml');doc.querySelector('#dieline')?.remove();return new XMLSerializer().serializeToString(doc.documentElement);};
const pngBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图片编码失败')),'image/png'));

export function mountExportUI(api){
  const dialog=document.createElement('dialog');dialog.id='export-dialog';dialog.className='export-workspace';dialog.setAttribute('aria-labelledby','export-title');
  dialog.innerHTML=`<header class="export-header"><div><h2 id="export-title">导出文件</h2><p id="export-project-name"></p></div><button class="icon-button" data-export-close aria-label="关闭导出">${icon('close')}</button></header>
    <div class="export-layout"><section class="export-preview" aria-label="内容预览"><div class="export-preview-label"><span id="export-preview-title"></span><span id="export-preview-mode"></span></div><div class="export-preview-stage" aria-busy="true"><img id="export-preview-image" alt="待导出的内容预览" hidden /><span id="export-preview-status" role="status">正在生成预览…</span></div><p id="export-preview-caption"></p></section>
    <section class="export-controls" aria-label="导出设置"><label class="export-field">导出内容<select id="export-target"><option value="flat">平面刀版 · 当前印刷面</option><option value="artwork">图文图层 · 当前印刷面</option><option value="3d">三维预览 · 当前视角</option><option value="model">三维模型</option></select></label>
    <label class="export-field">文件格式<div class="export-format-select"><span id="export-format-icon" aria-hidden="true"></span><select id="export-format"></select></div></label>
    <div id="export-common-settings"><label class="export-field">色彩模式<select id="export-mode"><option value="rgb">RGB · 屏幕与网络</option><option value="cmyk">CMYK · 印刷</option></select></label><p id="export-profile" class="export-hint"></p></div>
    <label id="export-lines-field" class="checkbox-label"><input id="export-lines" type="checkbox" checked /><span>包含刀线和折线</span></label>
    <label id="export-quality-field" class="export-field">图片质量<select id="export-quality"><option value="85">85 · 较小文件</option><option value="92" selected>92 · 推荐</option><option value="98">98 · 高质量</option></select></label>
    <label id="export-dpi-field" class="export-field">分辨率<select id="export-dpi"><option value="150">150 DPI</option><option value="300" selected>300 DPI</option><option value="600">600 DPI</option></select></label>
    <div id="export-model-settings"><label class="export-field">折叠形态<select id="export-fold"><option value="current">当前折叠状态</option><option value="closed">100% · 闭合成型</option><option value="flat">0% · 平铺刀版</option></select></label><label class="export-field">贴图分辨率<select id="export-resolution"><option value="2048">2048 × 2048 · 推荐</option><option value="4096">4096 × 4096 · 超清</option><option value="1024">1024 × 1024 · 轻量</option></select></label><label class="checkbox-label"><input id="export-inside" type="checkbox" checked /><span>包含内面印刷图案与底色</span></label></div>
    <details id="export-font-settings"><summary>PDF 字体与兼容性</summary><p class="export-hint">所有文字统一使用下方导出字体，默认内置中文替代；需要原字形时加载对应字体文件。</p><label class="button subtle export-font-import">${icon('upload')}加载字体<input id="export-font" type="file" accept=".ttf,.otf,.woff,.woff2" /></label><p id="export-font-name" class="export-hint">内置中文字体 · 常用简体字</p><p class="export-hint">路径保留为矢量。滤镜、遮罩、竖排等无法保真的内容会明确报错。</p></details>
    <p id="export-format-note" class="export-hint"></p><p id="export-error" role="alert"></p></section></div>
    <footer class="export-footer"><div class="export-file-summary"><strong id="export-filename"></strong><span id="export-output-size"></span></div><div class="export-footer-actions"><button class="button subtle" data-export-close>取消</button><button id="confirm-export" class="button primary">${icon('download')}<span>导出 PNG</span></button></div></footer>`;
  document.body.append(dialog);
  const $=s=>dialog.querySelector(s);let state,line,artwork,colorError='',preferredMode='rgb',busy=false,fontPending=false,fontBytes=null,fontToken=0,previewToken=0,previewUrl=null,previewQueue=Promise.resolve(),previewTimer;
  const current=()=>({target:$('#export-target').value,format:$('#export-format').value,mode:$('#export-format').value==='tiff'?'cmyk':$('#export-mode').value,lines:$('#export-lines').checked});
  function foldValue(){return $('#export-fold').value==='closed'?1:$('#export-fold').value==='flat'?0:state.project.fold;}
  function releasePreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('#export-preview-image').hidden=true;$('#export-preview-image').removeAttribute('src');}
  function artworkSource(){const doc=new DOMParser().parseFromString(svgDocumentSource(parseSvgDocument(artwork)),'image/svg+xml');doc.documentElement.setAttribute('width',line.width+'mm');doc.documentElement.setAttribute('height',line.height+'mm');return new XMLSerializer().serializeToString(doc.documentElement);}
  function syncFormats(){const selected=$('#export-format').value;$('#export-format').replaceChildren(...formats[$('#export-target').value].map(([value,label])=>new Option(label,value)));if(formats[$('#export-target').value].some(([value])=>value===selected))$('#export-format').value=selected;}
  function sync(){
    $('#export-mode').value=$('#export-format').value==='tiff'?'cmyk':preferredMode;
    const {target,format,mode,lines}=current(),flat=target==='flat',raster=['png','jpg','tiff'].includes(format),vector=['svg','pdf'].includes(format),model=target==='model',side=state.side==='inside'?'内面':'外面';
    $('#export-common-settings').hidden=model;$('#export-mode').disabled=format==='tiff';$('#export-mode option[value="cmyk"]').textContent=['png','svg'].includes(format)?'CMYK 色域 · RGB 打样显示':'CMYK · 印刷';
    $('#export-profile').textContent=mode==='cmyk'?colorError?'ICC 配置不可用':`ICC · ${colorStatus().name}`:'sRGB';
    $('#export-lines-field').hidden=!flat||format==='tiff';$('#export-quality-field').hidden=format!=='jpg';$('#export-dpi-field').hidden=format!=='tiff';$('#export-model-settings').hidden=!model;$('#export-font-settings').hidden=format!=='pdf';
    $('#export-format-icon').innerHTML=icon(model?'box':vector?'file':'image');
    $('#export-preview-title').textContent=target==='artwork'?`${side} · 图文图层`:target==='flat'?`${side} · 平面刀版`:model?'三维模型 · 折叠形态':'三维预览 · 当前视角';
    $('#export-preview-mode').textContent=model?'GLB':mode==='cmyk'?'CMYK 打样':'RGB';
    $('#export-preview-caption').textContent=target==='flat'?`${line.width.toFixed(1)} × ${line.height.toFixed(1)} mm${format==='pdf'?' · 图示为原稿，PDF 字体以右侧设置为准':''}`:target==='artwork'?'仅图文，不包含纸张底色与结构线':model?`折叠 ${Math.round(foldValue()*100)}% · 贴图 ${$('#export-resolution').value} px`:'使用当前相机角度与灯光';
    const notes={png:mode==='cmyk'?'PNG 使用 RGB 表达 CMYK 打样色域。':'保留透明区域，适合屏幕查看与排版。',jpg:'透明区域铺白。CMYK JPG 为真实四通道文件。',tiff:'真实四通道 CMYK，嵌入 ICC，透明区域铺白，不含结构线。',svg:target==='artwork'?'保留可编辑图文，不包含结构线。':'保留可编辑路径、文字和工程数据。',pdf:'保留矢量与实际毫米尺寸。CMYK PDF 嵌入 ICC。',glb:'内嵌网格、材质与贴图，可用于 Blender、C4D 等三维软件。'};
    $('#export-format-note').textContent=notes[format]+(format==='svg'&&mode==='cmyk'?' SVG 使用 RGB 表达 CMYK 打样色域；真实四色矢量请选 PDF。':'');
    const ext=format==='tiff'?'tif':format,part=model?`${Math.round(foldValue()*100)}%折叠`:target==='3d'?'三维预览':`${side}-${target==='artwork'?'图文':vector?'刀版':'平面'}${flat&&lines&&format==='png'?'-带线':''}`;
    $('#export-filename').textContent=`${cleanName(state.project.name)}-${part}${model?'':'-'+(mode==='cmyk'&&['png','svg'].includes(format)?'CMYK打样':mode.toUpperCase())}${format==='tiff'?'-'+$('#export-dpi').value+'dpi':''}.${ext}`;
    let invalid=false;
    if(flat&&raster){const scale=format==='tiff'?Number($('#export-dpi').value)/25.4:3072/Math.max(line.width,line.height),w=Math.ceil(line.width*scale),h=Math.ceil(line.height*scale);invalid=w*h>40000000||w>16000||h>16000;$('#export-output-size').textContent=`${w} × ${h} px${format==='tiff'?' · '+$('#export-dpi').value+' DPI':''}`;}
    else $('#export-output-size').textContent=model?'GLB · 自包含模型':target==='3d'?'当前三维视角':`${line.width.toFixed(1)} × ${line.height.toFixed(1)} mm · 矢量`;
    const needsIcc=mode==='cmyk'&&!model;
    $('#export-error').textContent=needsIcc&&colorError?`ICC 配置不可用：${colorError}。请在印刷设置中更换配置，或选择 RGB 导出。`:invalid?'超过 4000 万像素，请降低 DPI 或缩小盒型。':'';$('#confirm-export').disabled=busy||fontPending||invalid||!!(needsIcc&&colorError);$('#confirm-export span').textContent=`导出 ${format.toUpperCase()}`;
  }
  // Serialize preview captures: changing a selector or closing cannot publish a
  // stale image, or leave the live 3D model at a temporary fold/color setting.
  function requestPreview(){
    clearTimeout(previewTimer);const token=++previewToken,options={...current(),fold:foldValue()};releasePreview();$('.export-preview-stage').setAttribute('aria-busy','true');$('#export-preview-status').hidden=false;$('#export-preview-status').textContent='正在生成预览…';
    previewTimer=setTimeout(()=>{previewQueue=previewQueue.catch(()=>{}).then(async()=>{
      if(token!==previewToken||!dialog.open)return;
      try{
        if(options.mode==='cmyk'&&options.target!=='model'&&colorError)throw Error(`ICC 配置不可用：${colorError}`);
        let canvas;
        if(options.target==='3d'||options.target==='model'){
          canvas=await api.captureRgb(options.target==='model'?options.fold:undefined);if(options.mode==='cmyk'&&options.target!=='model')proofCanvas(canvas);
        }else if(options.target==='artwork'){
          const source=await proofSvgSource(artworkSource(),{mode:options.mode}),image=new Image(),url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));
          try{image.src=url;await image.decode();canvas=document.createElement('canvas');const scale=900/Math.max(line.width,line.height);canvas.width=Math.ceil(line.width*scale);canvas.height=Math.ceil(line.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);}finally{URL.revokeObjectURL(url);}
        }else canvas=await renderPrintSurface(state.project,line,api.images,{side:state.side,max:900,includeLines:options.format!=='tiff'&&options.lines,proof:options.mode==='cmyk'});
        if(options.format==='jpg'||options.format==='tiff'){const ctx=canvas.getContext('2d');ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);}
        const blob=await pngBlob(canvas);if(token!==previewToken||!dialog.open)return;
        releasePreview();previewUrl=URL.createObjectURL(blob);$('#export-preview-image').src=previewUrl;$('#export-preview-image').hidden=false;$('#export-preview-status').hidden=true;
      }catch(error){if(token===previewToken&&dialog.open)$('#export-preview-status').textContent=`预览不可用：${error.message}`;}
      finally{if(token===previewToken)$('.export-preview-stage').setAttribute('aria-busy','false');}
    });},70);
  }
  function close(){if(!busy)dialog.close();}
  for(const button of dialog.querySelectorAll('[data-export-close]'))button.onclick=close;
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{fontToken++;previewToken++;clearTimeout(previewTimer);releasePreview();document.querySelector('#export-toggle').focus();});
  document.querySelector('#export-toggle').onclick=()=>{
    try{api.flush();const live=api.getState();state={project:structuredClone(live.project),side:live.side};line=makeDieline(state.project.type,state.project.dimensions);artwork=api.artworkSource();colorError='';try{configureColorManagement(state.project.printSettings);}catch(error){colorError=error.message;}fontPending=false;preferredMode=live.colorMode;$('#export-fold option[value="current"]').textContent=`当前折叠状态 · ${Math.round(state.project.fold*100)}%`;$('#export-project-name').textContent=state.project.name;sync();dialog.showModal();requestPreview();}catch(error){api.notify(`无法打开导出：${error.message}`);}
  };
  $('#export-target').onchange=()=>{syncFormats();sync();requestPreview();};
  for(const id of ['export-format','export-mode','export-lines','export-fold'])$('#'+id).onchange=()=>{sync();requestPreview();};
  $('#export-mode').onchange=()=>{preferredMode=$('#export-mode').value;sync();requestPreview();};
  for(const id of ['export-dpi','export-resolution'])$('#'+id).onchange=sync;
  $('#export-font').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;const token=++fontToken;fontPending=true;$('#confirm-export').disabled=true;
    try{if(file.size>24*1024*1024)throw Error('PDF 字体文件不能超过 24 MB');const bytes=new Uint8Array(await file.arrayBuffer());if(token!==fontToken||!dialog.open)return;validatePdfFont(bytes);fontBytes=bytes;$('#export-font-name').textContent=file.name;$('#export-error').textContent='';}
    catch(error){if(token===fontToken)$('#export-error').textContent=error.message;}
    finally{if(token===fontToken){fontPending=false;const error=$('#export-error').textContent;sync();if(error)$('#export-error').textContent=error;}}
  };
  $('#confirm-export').onclick=async()=>{
    if(busy||fontPending)return;const options={...current(),quality:Number($('#export-quality').value),dpi:Number($('#export-dpi').value),fold:foldValue(),resolution:Number($('#export-resolution').value),includeInside:$('#export-inside').checked},filename=$('#export-filename').textContent,font=fontBytes;let transform;
    busy=true;previewToken++;clearTimeout(previewTimer);for(const control of dialog.querySelectorAll('button,select,input'))control.disabled=true;$('#export-error').textContent='';$('#confirm-export span').textContent='正在准备…';
    const progress=p=>$('#confirm-export span').textContent=`正在导出 ${Math.round(p*100)}%`;
    try{
      // Wait for any temporary preview fold/color to be restored before capture.
      await previewQueue;let blob;const {format,target,mode}=options;
      if(mode==='cmyk'&&target!=='model')configureColorManagement(state.project.printSettings);
      if(mode==='cmyk'&&['jpg','pdf','tiff'].includes(format))transform=capturePrintTransform();
      if(target==='model')blob=new Blob([await exportGLB(state.project,line,api.images,{fold:options.fold,resolution:options.resolution,includeInside:options.includeInside})],{type:'model/gltf-binary'});
      else if(format==='svg'){
        let source=target==='artwork'?await proofSvgSource(artworkSource(),{mode}):await exportSVG(state.project,line,api.images,{side:state.side,colorMode:mode});if(target==='flat'&&!options.lines)source=stripLines(source);blob=new Blob([source],{type:'image/svg+xml'});
      }else if(format==='pdf'){
        let source=await exportRGBSVG(state.project,line,api.images,{side:state.side});if(!options.lines)source=stripLines(source);blob=await exportVectorPdf(source,{widthMm:line.width,heightMm:line.height,mode,transform,fontBytes:font,onProgress:progress});
      }else{
        const canvas=target==='3d'?await api.captureRgb():await renderPrintSurface(state.project,line,api.images,{side:state.side,includeLines:format!=='tiff'&&options.lines,proof:format==='png'&&mode==='cmyk',...(format==='tiff'?{dpi:options.dpi}:{max:3072})});
        if(format==='png'){if(mode==='cmyk'&&target==='3d')proofCanvas(canvas);blob=await pngBlob(canvas);}
        else if(format==='tiff')blob=await exportCmykTiff(canvas,transform,{dpi:options.dpi,onProgress:progress});
        else blob=await exportJpeg(canvas,{mode,transform,quality:options.quality,dpi:target==='flat'?canvas.width/line.width*25.4:96,onProgress:progress});
      }
      download(blob,filename);dialog.close();api.notify(`已导出 ${filename}`);
    }catch(error){$('#export-error').textContent=`导出失败：${error.message}`;}
    finally{transform?.dispose();busy=false;for(const control of dialog.querySelectorAll('button,select,input'))control.disabled=false;const error=$('#export-error').textContent;sync();if(error)$('#export-error').textContent=error;if(dialog.open)requestPreview();}
  };
  syncFormats();
}
