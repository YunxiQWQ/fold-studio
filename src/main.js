import './style.css';
import './editor-ui.css';
import {mountEditorUI} from './editor-ui.js';
import {mountPackagingUI} from './packaging-ui.js';
import './packaging-ui.css';
import {mountColorUI} from './color-ui.js';
import {compactWorkspace} from './compact-workspace.js';
import {initWorkspaceResizers} from './workspace-resizer.js';
import {TEMPLATE_PREVIEWS} from './template-previews.generated.js';
import {expandGroups,layerRect} from './editor-commands.js';
import { BOX_TYPES, makeDieline, creasePaths, cutSegments } from './geometry.js';
import { newProject, History, uid, clone, validateProject, PALETTES, SIDES, sideOf, surfaceOf } from './project.js';
import { encodeLayers, decodeLayers, layersForPaste, CLIPBOARD_MIME } from './clipboard.js';
import { ImageCache, paintArtwork } from './artwork.js';
import { Editor2D } from './editor2d.js';
import { Preview3D } from './preview3d.js';
import { loadDraft, saveDraft, download } from './storage.js';
import { exportGLB } from './export3d.js';
import { icon, escapeHtml as esc } from './icons.js';
import { PACKAGING_SYMBOLS } from './symbols.js';
import { rgbToCmyk, formatCmyk, proofColor } from './color.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>document.querySelectorAll(selector);
const button=(id,glyph,title,extra='')=>`<button id="${id}" class="icon-button ${extra}" title="${title}" aria-label="${title}">${icon(glyph)}</button>`;
let project=newProject(),dieline=makeDieline(project.type,project.dimensions),selected=null,panelId='front',history=new History(project);
let preview,editor,saveTimer,renderRaf,textureDirty=false,saveSequence=0,playing=false,animationRaf=0,lastStatsAt=0;
let geometryTimer,confirmAction=null,activeSide='outside',pasteInPlace=false,lastPasteText='',pasteCount=0;
let colorMode='rgb';
let selectionIds=[],editorUI,packagingUI,colorUI;
const getSelectedIds=()=>selected?(selectionIds.includes(selected)?selectionIds:[selected]).filter(id=>project.layers.some(l=>l.id===id&&sideOf(l)===activeSide)):[];
const dirtySides=new Set();

$('#app').innerHTML=`
<header class="app-header">
  <div class="brand-group">
    <a class="brand" href="#" aria-label="折间工作台"> <span class="brand-mark">${icon('box')}</span><span class="brand-name">折间<span>FOLD STUDIO</span></span></a>
    <div class="brand-badges">
      <span class="version-tag">v0.9.4</span>
      <span class="local-badge"><span class="local-dot"></span>文件留在本地</span>
    </div>
  </div>
  <div class="header-divider"></div><div class="project-heading"><span class="eyebrow">我的工作台</span><div><input id="project-name" aria-label="工程名称" maxlength="80" spellcheck="false"/><span class="file-tag">.fold</span></div></div>
  <span id="save-status" class="save-status">${icon('check')}本机自动保存</span>
  <div class="header-actions"><button id="color-mode-toggle" class="button subtle" title="切换 RGB 屏幕模式 / CMYK 印刷软打样" aria-label="切换色彩模式">${icon('cmyk')}<span id="color-mode-text" class="color-mode-text">RGB 屏幕</span></button><div class="theme-wrap"><button id="theme-toggle" class="button subtle" title="选择界面主题 (快捷键 Shift+T)" aria-label="选择界面主题" aria-haspopup="true" aria-expanded="false">${icon('palette')}<span class="theme-text">工业中灰</span>${icon('down')}</button><div id="theme-menu" class="dropdown theme-dropdown" hidden><button data-theme-value="gray" class="theme-option" type="button"><span class="theme-swatch theme-swatch-gray"></span><div class="theme-opt-info"><div class="theme-opt-title"><strong>工业中灰</strong><span class="theme-tag">推荐</span></div><small>3D与包装推荐 · 中度灰</small></div><span class="theme-check">${icon('check')}</span></button><button data-theme-value="dark" class="theme-option" type="button"><span class="theme-swatch theme-swatch-dark"></span><div class="theme-opt-info"><div class="theme-opt-title"><strong>极夜深色</strong></div><small>沉浸高对比 · 纯净深黑</small></div><span class="theme-check">${icon('check')}</span></button><button data-theme-value="slate" class="theme-option" type="button"><span class="theme-swatch theme-swatch-slate"></span><div class="theme-opt-info"><div class="theme-opt-title"><strong>工程蓝灰</strong></div><small>CAD工程调 · 蓝灰工作台</small></div><span class="theme-check">${icon('check')}</span></button><button data-theme-value="light" class="theme-option" type="button"><span class="theme-swatch theme-swatch-light"></span><div class="theme-opt-info"><div class="theme-opt-title"><strong>经典浅色</strong></div><small>明亮纸白 · 经典清新</small></div><span class="theme-check">${icon('check')}</span></button><button data-theme-value="warm" class="theme-option" type="button"><span class="theme-swatch theme-swatch-warm"></span><div class="theme-opt-info"><div class="theme-opt-title"><strong>暖沙原纸</strong></div><small>温润原色 · 牛皮纸本</small></div><span class="theme-check">${icon('check')}</span></button></div></div><button id="import-project" class="button subtle">${icon('upload')}打开工程</button><button id="save-project" class="button subtle">${icon('save')}保存工程</button><div class="export-wrap"><button id="export-toggle" class="button primary">${icon('download')}导出${icon('down')}</button><div id="export-menu" class="dropdown" hidden><button id="export-glb">${icon('box')}三维模型 GLB</button><button id="export-png">${icon('box')}三维预览 PNG</button><button id="export-svg">${icon('grid')}平面刀版 SVG</button><button id="export-flat">${icon('image')}平面设计 PNG</button></div></div></div>
</header>
<nav class="workspace-nav"><div class="nav-current">${icon('box')}包装设计<span class="nav-dot"></span></div><span class="nav-description">从一张平面，到一个好设计。</span><button id="help" class="help-link">${icon('help')}使用指南</button></nav>
<main class="workspace" id="workspace-main">
  <aside class="left-sidebar">
    <div class="sidebar-title">${icon('settings')}结构与外观</div>
    <section class="sidebar-section template-section collapsible-section">
      <div class="section-heading" title="点击折叠 / 展开"><h2>包装结构</h2><span>${Object.keys(BOX_TYPES).length} 款结构</span><span class="collapse-icon">${icon('down')}</span></div>
      <div class="collapsible-content">
        <div class="current-template-card" id="current-template-card">
          <span class="template-art" id="current-template-art">${boxIllustration(project.type)}</span>
          <div class="current-template-info">
            <strong id="current-template-name">${esc(BOX_TYPES[project.type].name)}</strong>
            <span class="template-eng" id="current-template-eng">${esc(BOX_TYPES[project.type].english)}</span>
            <small id="current-template-desc">${esc(BOX_TYPES[project.type].description)}</small>
          </div>
          <button id="open-templates" class="button subtle small" title="切换包装盒型与容器">${icon('grid')}<span>浏览结构库</span></button>
        </div>
      </div>
    </section>
    <section class="sidebar-section dimension-section collapsible-section">
      <div class="section-heading" title="点击折叠 / 展开"><h2>成品尺寸</h2><span>mm</span><span class="collapse-icon">${icon('down')}</span></div>
      <div class="collapsible-content">
        <div class="dimension-fields">${[['length','长','L'],['depth','宽','W'],['height','高','H']].map(([key,label,letter])=>`<label class="dimension-field"><span>${label}<em>${letter}</em></span><input type="number" id="dim-${key}" data-dimension="${key}" min="15" max="600" step="1" aria-label="成品${label}度"/></label>`).join('')}</div>
        <div id="extra-dimensions" class="extra-dimensions" hidden></div>
        <p class="field-note">调整尺寸，刀版与模型同步更新</p>
      </div>
    </section>
    <section class="sidebar-section paper-section collapsible-section">
      <div class="section-heading" title="点击折叠 / 展开"><h2>纸张与配色</h2>${icon('leaf')}<span class="collapse-icon">${icon('down')}</span></div>
      <div class="collapsible-content">
        <label class="select-label"><select id="material" aria-label="纸张材质"><option value="matte">哑光卡纸</option><option value="gloss">亮面卡纸</option><option value="kraft">牛皮纸</option></select>${icon('down')}</label>
        <div class="palette-row">${PALETTES.map((p,i)=>`<button class="palette ${i===0?'active':''}" data-palette="${i}" title="${p.name}" aria-label="${p.name}" style="--palette:${p.color};--palette-accent:${p.accent}"><i></i></button>`).join('')}</div>
        <div class="paper-color-control"><input id="paper-color" type="color" aria-label="自定义纸张颜色"/></div>
        <div class="color-caption"><span>纸张底色</span><span id="paper-hex"></span></div>
      </div>
    </section>
    <div id="layer-resizer" class="panel-v-resizer" title="上下拖动调整图层面板高度" aria-label="上下拖动调整图层面板高度"></div>
    <section id="layer-section" class="layer-section">
      <div class="section-heading"><h2>${icon('layers')}图层</h2><span id="layer-count"></span></div>
      <div class="layer-help">上方图层覆盖下方图层</div>
      <div id="layer-list" class="layer-list"></div>
    </section>
  </aside>
  <div id="sidebar-resizer" class="workspace-resizer resizer-col" title="左右拖动调整边栏宽度" aria-label="左右拖动调整边栏宽度"></div>
  <section class="center-workspace">
    <div class="design-toolbar"><div class="toolbar-group">${button('tool-select','cursor','选择工具 V','active')}${button('tool-pan','hand','平移工具 H / 按住空格')}</div><span class="toolbar-separator"></span><div class="toolbar-group add-tools"><button id="add-text">${icon('text')}<span>文字</span></button><button id="add-image">${icon('image')}<span>图片</span></button><button id="add-shape">${icon('shape')}<span>图形</span></button><button id="add-barcode">${icon('barcode')}<span>条形码</span></button><button id="add-qrcode">${icon('qrcode')}<span>二维码</span></button><button id="add-symbol">${icon('symbol')}<span>常用标志</span></button></div><div class="toolbar-right">${button('undo','undo','撤销 Ctrl+Z')}${button('redo','redo','重做 Ctrl+Shift+Z')}<span class="toolbar-separator"></span>${button('toggle-guides','grid','显示 / 隐藏刀版辅助线','active')}</div></div>
    <div class="surface-toolbar"><div class="surface-tabs" role="tablist" aria-label="编辑包装内外面"><button id="side-outside" data-side="outside" role="tab" aria-selected="true" class="active">外面<span>1</span></button><button id="side-inside" data-side="inside" role="tab" aria-selected="false">内面<span>2</span></button></div><span id="surface-hint" class="surface-hint">编辑外面图案</span><div class="clipboard-tools">${button('copy-layer','copy','复制图层 Ctrl+C')}${button('cut-layer','cut','剪切图层 Ctrl+X')}${button('paste-layer','paste','粘贴到当前面板 Ctrl+V')}</div><button id="shortcut-help" class="shortcut-link" title="快捷键 ?">快捷键 ${icon('help')}</button></div>
    <div class="canvas-split" id="canvas-split">
      <section class="flat-pane">
        <div class="pane-heading">
          <div class="pane-title-group"><span class="pane-index">01</span><h1>平面画布</h1><span class="pane-tag">2D</span><span id="cmyk-tag-2d" class="pane-color-tag" hidden>CMYK 软打样</span></div>
          <div class="pane-heading-right">
            <div class="line-legend"><span><i></i>裁切</span><span><i class="dashed"></i>压痕</span></div>
            <span id="sheet-size" class="pane-meta"></span>
            <div class="zoom-control">${button('zoom-out','minus','缩小')}<button id="zoom-label" title="适应画布">100%</button>${button('zoom-in','plus','放大')}${button('fit-2d','fit','适应画布')}</div>
            <button id="toggle-expand-editor" class="icon-button subtle" title="展开 / 恢复平面编辑 (M)" aria-label="展开 / 恢复平面编辑 (M)">${icon('expand')}</button>
          </div>
        </div>
        <div id="editor-host" class="editor-host"></div>
        <div class="canvas-hint">${icon('cursor')}拖动编辑 · 滚轮缩放 · 空格平移</div>
      </section>
      <div id="canvas-split-resizer" class="workspace-resizer resizer-col" title="左右拖动调整2D/3D视图比例" aria-label="左右拖动调整2D/3D视图比例"></div>
      <section class="preview-pane">
        <div class="pane-heading">
          <div class="pane-title-group"><span class="pane-index">02</span><h2>折叠预览</h2><span class="live-tag"><i></i>实时</span><span id="cmyk-tag-3d" class="pane-color-tag" hidden>CMYK 软打样</span></div>
          <div class="preview-status-group"><span class="workspace-status-badge"><i></i><span id="workspace-status-text">所有改动实时可见</span></span><span id="performance-status" class="perf-status-badge">按需渲染</span></div>
          <div class="preview-heading-actions">
            <div class="preview-quality-wrap" title="预览清晰度与能耗"><span class="leaf-label">${icon('leaf')}<span>轻量预览</span></span><select id="quality" aria-label="预览清晰度"><option value="economy">节能</option><option value="balanced" selected>均衡</option><option value="crisp">清晰</option></select></div>
            ${button('fit-3d','fit','适应模型')}
          </div>
        </div>
        <div class="preview-stage">
          <div class="stage-grid"></div>
          <div id="preview-host" class="preview-host"></div>
          <div class="preview-views"><button data-view="iso" class="active">透视</button><button data-view="front">正面</button><button data-view="side">侧面</button><button data-view="top">顶部</button></div>
          <span class="preview-instruction">拖动旋转 · 滚轮缩放</span>
          <div id="preview-error" class="preview-error" hidden></div>
        </div>
        <div class="fold-controls">
          <div class="fold-heading"><span>折叠进度</span><strong id="fold-value">100<span>%</span></strong></div>
          <div class="fold-presets" role="group" aria-label="折叠姿态预设">
            <button class="fold-preset-btn" data-fold-preset="0" title="0% 平面展开刀版">0% 展开</button>
            <button class="fold-preset-btn" data-fold-preset="0.45" title="45% 护耳与围框折起">45% 围框</button>
            <button class="fold-preset-btn" data-fold-preset="0.78" title="78% 敞口成型态 (对应参考图左下)">78% 敞口</button>
            <button class="fold-preset-btn active" data-fold-preset="1.0" title="100% 弧顶合拢态 (对应参考图主图)">100% 合拢</button>
          </div>
          <div class="fold-slider-row">${button('play-fold','play','播放折叠动画')}<input id="fold-slider" type="range" min="0" max="100" value="100" aria-label="折叠进度"/></div>
          <div class="fold-labels"><button id="unfold">完全展开</button><button id="fold">折叠成型</button></div>
        </div>
      </section>
    </div>
  </section>
  <div id="inspector-resizer" class="workspace-resizer resizer-col" title="左右拖动调整属性面板宽度" aria-label="左右拖动调整属性面板宽度"></div>
  <aside class="right-sidebar"><div class="sidebar-title">属性<span id="selected-type" class="tiny-badge">面板</span></div><div class="panel-picker"><label for="panel-selector">选择面板</label><select id="panel-selector" aria-label="选择面板"></select></div><div id="inspector"></div><div class="inspector-tip">${icon('help')}<p>点击平面或三维模型选择面板。<br/>插舌和粘耳也可单独选择、检查。</p></div></aside>
</main>
<input id="image-input" type="file" accept="image/png,image/jpeg,image/webp" hidden/><input id="project-input" type="file" accept=".fold,.foldproj,.json,.svg" hidden/>
<div id="toast" class="toast" role="status" hidden></div>
<dialog id="help-dialog"><button id="close-help" class="dialog-close" aria-label="关闭">${icon('close')}</button><span class="dialog-kicker">WELCOME TO FOLD STUDIO</span><h2>让设计，折起来。</h2><p>选择一种盒型或包装容器，调整尺寸，然后在平面画布上添加文字、图片和图形。每一次编辑，都会同步到右侧的三维模型。</p><div class="help-grid"><div><kbd>V</kbd><span>选择工具</span></div><div><kbd>H / 空格</kbd><span>平移画布</span></div><div><kbd>Ctrl Z</kbd><span>撤销编辑</span></div><div><kbd>Delete</kbd><span>删除图层</span></div></div><p class="help-note">图层右下角可拖动缩放；图片按住 Shift 可自由改变比例。工程自动保存至当前浏览器，也可下载 .fold 文件备份。SVG 导出包含工程信息，可重新打开。</p><p class="help-note">当前版本支持 ${Object.keys(BOX_TYPES).length} 款包装结构与瓶罐容器，涵盖卡纸彩盒、精品礼盒、电商物流和瓶罐容器。模型与刀版用于视觉预览及结构草图。</p><button id="dismiss-help" class="button primary">开始设计 ${icon('chevron')}</button></dialog>
<dialog id="shortcuts-dialog"><button id="close-shortcuts" class="dialog-close" aria-label="关闭快捷键">${icon('close')}</button><span class="dialog-kicker">KEYBOARD SHORTCUTS</span><h2>让操作，更顺手。</h2><div class="shortcut-list">${[['Ctrl / ⌘ C','复制选中图层'],['Ctrl / ⌘ X','剪切选中图层'],['Ctrl / ⌘ V','粘贴到当前面板与内外面'],['Ctrl / ⌘ Shift V','粘贴并保留原位置'],['Ctrl / ⌘ D','复制一份图层'],['Ctrl / ⌘ Z','撤销'],['Ctrl / ⌘ Shift Z / Y','重做'],['Ctrl / ⌘ S','下载工程'],['1 / 2','编辑外面 / 内面'],['V / H / 空格','选择 / 平移 / 临时平移'],['T / I / R','添加文字 / 图片 / 矩形'],['M','展开 / 恢复平面画布'],['P','切换 RGB 屏幕 / CMYK 印刷打样'],['Shift T','切换界面主题（中灰/深黑/蓝调/浅色/纸本）'],['F / Shift F','适应平面 / 适应三维'],['G','切换辅助线'],['方向键 / Shift 方向键','移动 1 mm / 5 mm'],['Delete / Esc','删除 / 取消选择'],['?','打开本快捷键表']].map(([key,label])=>`<div><span>${label}</span><kbd>${key}</kbd></div>`).join('')}</div><p class="help-note">复制图层后，可在另一个折间标签页、离线页面或工程中粘贴，图片会一起携带。也可粘贴剪贴板中的普通文字或图片。输入框里的复制粘贴仍按浏览器惯例工作；若粘贴按钮受浏览器限制，请直接按 Ctrl / ⌘ V。</p></dialog>
<dialog id="confirm-dialog"><h2>切换盒型？</h2><p>将建立一份新盒型示例，替换当前设计。你可以先保存工程；切换后也可以撤销。</p><div class="dialog-actions"><button id="cancel-confirm" class="button subtle">保留当前设计</button><button id="accept-confirm" class="button primary">切换盒型</button></div></dialog>
<dialog id="export-glb-dialog" class="export-dialog"><button id="close-export-glb" class="dialog-close" aria-label="关闭导出对话框">${icon('close')}</button><span class="dialog-kicker">3D MODEL EXPORT</span><h2>导出三维模型 GLB</h2><p>生成内嵌几何网格、PBR 材质与内外贴图的自包含三维模型，可直接导入 Blender、C4D、KeyShot 或网页 3D/AR 查看器中渲染。</p><div class="export-options"><div class="export-group"><label class="export-label">折叠形态</label><div class="export-radios"><label><input type="radio" name="glb-fold" value="current" checked /><span id="glb-fold-current-label">当前折叠状态</span></label><label><input type="radio" name="glb-fold" value="closed" /><span>100% 完全闭合成型</span></label><label><input type="radio" name="glb-fold" value="flat" /><span>0% 平铺展开刀版</span></label></div></div><div class="export-group"><label class="export-label" for="glb-resolution">贴图烘焙分辨率</label><select id="glb-resolution"><option value="2048" selected>2048 × 2048（推荐 · 细节清晰）</option><option value="4096">4096 × 4096（超清 · 适合近景特写）</option><option value="1024">1024 × 1024（轻量 · 适合 Web/AR）</option></select></div><div class="export-group"><label class="checkbox-label"><input type="checkbox" id="glb-inside" checked /><span>包含内面印刷图案与底色</span></label></div></div><div class="dialog-actions"><button id="cancel-export-glb" class="button subtle">取消</button><button id="confirm-export-glb" class="button primary">${icon('download')}开始导出 GLB</button></div></dialog>
<dialog id="templates-dialog" class="templates-dialog">
  <button id="close-templates" class="dialog-close" aria-label="关闭包装结构库">${icon('close')}</button>
  <div class="dialog-header">
    <span class="dialog-kicker">PACKAGING STRUCTURE LIBRARY</span>
    <h2>包装结构与盒型库</h2>
    <p>选择工业标准纸盒或瓶罐容器结构，一键生成刀版与拟真三维模型</p>
  </div>
  <div class="template-filter-tabs" role="tablist" aria-label="包装结构分类">
    <button class="filter-tab active" data-filter="all">全部 <span>${Object.keys(BOX_TYPES).length}</span></button>
    <button class="filter-tab" data-filter="carton">卡纸彩盒 <span>${Object.values(BOX_TYPES).filter(t=>t.category==='carton').length}</span></button>
    <button class="filter-tab" data-filter="gift">精品礼盒 <span>${Object.values(BOX_TYPES).filter(t=>t.category==='gift').length}</span></button>
    <button class="filter-tab" data-filter="shipping">电商物流 <span>${Object.values(BOX_TYPES).filter(t=>t.category==='shipping').length}</span></button>
    <button class="filter-tab" data-filter="container">瓶罐容器 <span>${Object.values(BOX_TYPES).filter(t=>t.category==='container').length}</span></button>
  </div>
  <div id="box-templates" class="box-templates dialog-template-grid">
    ${Object.entries(BOX_TYPES).map(([id,t])=>`<button class="template-card ${id===project.type?'active':''}" data-template="${id}" data-category="${t.category}" aria-pressed="${id===project.type}"><span class="template-card-badge">${categoryLabel(t.category)}</span><span class="template-art ${id}">${boxIllustration(id)}</span><div class="template-card-info"><strong>${t.name}</strong><span class="template-eng">${t.english}</span><small>${t.description}</small><span class="template-dim">${t.defaults.length} × ${t.defaults.depth} × ${t.defaults.height} mm</span></div><span class="template-check">${icon('check')}</span></button>`).join('')}
  </div>
</dialog>`;

function categoryLabel(cat){
  const map={carton:'卡纸彩盒',gift:'精品礼盒',shipping:'电商物流',container:'瓶罐容器'};
  return map[cat]??'包装结构';
}

function boxIllustration(type){
  const item=TEMPLATE_PREVIEWS[type];if(!item)return '';
  return '<span class="model-thumbnail"><img src="'+item.src+'" alt="'+esc(BOX_TYPES[type].name)+'实际模型预览" width="384" height="288"/><small>'+(item.fold<1?'模型结构预览':'成型结构预览')+'</small></span>';
}


const images=new ImageCache(src=>{for(const layer of project.layers)if(layer.type==='image'&&layer.src===src)dirtySides.add(sideOf(layer));schedule();});
editor=new Editor2D($('#editor-host'),images,{
  select:selectLayer,begin:()=>{},change:()=>{textureDirty=true;schedule();},commit:()=>{commit();renderInspector();},context:e=>editorUI?.context(e),
  zoom:scale=>$('#zoom-label').textContent=`${Math.round(scale*100)}%`,
  editText:id=>{selectLayer(id,project.layers.find(l=>l.id===id).panel);$('#prop-text')?.focus();$('#prop-text')?.select();},
});
try{preview=new Preview3D($('#preview-host'),images,(id,side)=>{stopAnimation();activeSide=side;selectLayer(null,id);},stats=>{
  if(performance.now()-lastStatsAt<400)return;lastStatsAt=performance.now();
  $('#performance-status').textContent=`${stats.drawCalls??0} 次绘制 · ${stats.atlas[0]} px 贴图`;
});}catch(error){$('#preview-error').hidden=false;$('#preview-error').textContent=`三维预览无法启动：${error.message}。请使用支持 WebGL 2 的浏览器，并启用硬件加速。`;}

function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').hidden=true,3300);}
function schedule(){if(textureDirty){dirtySides.add(activeSide);textureDirty=false;}if(renderRaf)return;renderRaf=requestAnimationFrame(()=>{renderRaf=0;editor.update(project,dieline,selected,panelId,activeSide,getSelectedIds());if(dirtySides.size){preview?.paint(project,[...dirtySides]);dirtySides.clear();}updateLayerProperties();});}
function markSaving(){ $('#save-status').innerHTML='<span class="pending-dot"></span>保存中…'; }
function commit(){history.push(project);renderHistory();renderLayers();scheduleSave();}
function scheduleSave(){markSaving();clearTimeout(saveTimer);saveTimer=setTimeout(persist,550);}
async function persist(){const sequence=++saveSequence;try{await saveDraft(clone(project));if(sequence===saveSequence)$('#save-status').innerHTML=`${icon('check')}已在本机保存`;}catch{$('#save-status').textContent='本机保存失败，请下载工程备份';}}
function renderHistory(){$('#undo').disabled=!history.canUndo;$('#redo').disabled=!history.canRedo;}
function selectLayer(id,nextPanel,ids){if(nextPanel&&!dieline.panels.some(p=>p.id===nextPanel))return;if(editor?.isEditing&&id!==editor.selected)editor.up();selected=id;selectionIds=id?(ids??expandGroups(project,[id])):[];panelId=nextPanel??panelId;if(id){const layer=project.layers.find(l=>l.id===id);if(layer)activeSide=sideOf(layer);}renderSurface();renderLayers();renderInspector();schedule();}
function renderSurface(){
  const surface=surfaceOf(project,activeSide);
  document.querySelectorAll('[data-side]').forEach(b=>{b.classList.toggle('active',b.dataset.side===activeSide);b.setAttribute('aria-selected',b.dataset.side===activeSide);});
  $('#surface-hint').textContent=activeSide==='inside'?'翻到背面 · 文字按内面阅读方向排版':'编辑外面图案';
  $('#paper-color').value=surface.paper;
  const paperCmyk=colorMode==='cmyk'?` · ${formatCmyk(surface.paper)}`:'';
  $('#paper-hex').textContent=`${surface.paper.toUpperCase()}${paperCmyk}`;
  document.querySelectorAll('[data-palette]').forEach(b=>b.classList.toggle('active',PALETTES[+b.dataset.palette].color===surface.paper));
  $('#copy-layer').disabled=!selected;$('#cut-layer').disabled=!selected;
  $('#panel-selector').innerHTML=dieline.panels.map(p=>`<option value="${p.id}" ${p.id===panelId?'selected':''}>${esc(p.label)}</option>`).join('');
  if(preview?.isolatedPanel)preview.inspectPanel(panelId,activeSide,true);
  colorUI?.sync();
}
function setSide(side){if(!Object.hasOwn(SIDES,side)||side===activeSide)return;editor.up();activeSide=side;selected=null;renderSurface();renderLayers();renderInspector();schedule();}
function refresh({fit=false,build=true}={}){
  dieline=makeDieline(project.type,project.dimensions);
  if(!dieline.panels.some(p=>p.id===panelId))panelId=BOX_TYPES[project.type].printPanel;
  if(!project.layers.some(l=>l.id===selected))selected=null;
  if(selected)activeSide=sideOf(project.layers.find(l=>l.id===selected));
  editor.update(project,dieline,selected,panelId,activeSide,getSelectedIds());
  if(build){preview?.setQuality(project.quality);preview?.build(project,dieline);}
  if(fit)editor.fit();
  $('#project-name').value=project.name;
  for(const key of ['length','depth','height'])$(`#dim-${key}`).value=project.dimensions[key];
  const paperCmyk=colorMode==='cmyk'?` · ${formatCmyk(project.paper)}`:'';
  $('#paper-color').value=project.paper;$('#paper-hex').textContent=`${project.paper.toUpperCase()}${paperCmyk}`;$('#material').value=project.material;$('#quality').value=project.quality;
  $('#sheet-size').textContent=`${dieline.width.toFixed(0)} × ${dieline.height.toFixed(0)} mm`;
  $('#current-template-art').innerHTML=boxIllustration(project.type);
  $('#current-template-name').textContent=BOX_TYPES[project.type].name;
  $('#current-template-eng').textContent=BOX_TYPES[project.type].english;
  $('#current-template-desc').textContent=BOX_TYPES[project.type].description;
  document.querySelectorAll('[data-template]').forEach(b=>{b.classList.toggle('active',b.dataset.template===project.type);b.setAttribute('aria-pressed',b.dataset.template===project.type);});
  document.querySelectorAll('[data-palette]').forEach(b=>b.classList.toggle('active',PALETTES[+b.dataset.palette].color===project.paper));
  renderExtraDimensions();
  setFoldUI();renderHistory();renderSurface();renderLayers();renderInspector();
}
function renderExtraDimensions(){
  const container=$('#extra-dimensions');
  if(!container)return;
  if(project.type==='arch-handle-tote'){
    container.hidden=false;
    const archH=project.dimensions.archH??87;
    const flare=project.dimensions.flare??28;
    const handleW=project.dimensions.handleW??92;
    container.innerHTML=`<div class="extra-dim-heading"><span>结构参数微调</span><span class="extra-dim-sub">一体成型提手盒</span></div><div class="extra-dim-row"><div class="extra-dim-label"><span>弧顶提手高度</span><strong id="val-archH">${archH} mm</strong></div><div class="extra-dim-control"><input type="range" class="extra-dim-slider" data-extra-dim="archH" min="55" max="130" step="1" value="${archH}" aria-label="弧顶提手高度"/><input type="number" class="extra-dim-num" data-extra-dim="archH" min="55" max="130" step="1" value="${archH}" aria-label="弧顶提手高度数值"/></div></div><div class="extra-dim-row"><div class="extra-dim-label"><span>两侧梯形外扩</span><strong id="val-flare">${flare} mm</strong></div><div class="extra-dim-control"><input type="range" class="extra-dim-slider" data-extra-dim="flare" min="0" max="50" step="1" value="${flare}" aria-label="两侧梯形外扩量"/><input type="number" class="extra-dim-num" data-extra-dim="flare" min="0" max="50" step="1" value="${flare}" aria-label="两侧梯形外扩量数值"/></div></div><div class="extra-dim-row"><div class="extra-dim-label"><span>提手镂空宽度</span><strong id="val-handleW">${handleW} mm</strong></div><div class="extra-dim-control"><input type="range" class="extra-dim-slider" data-extra-dim="handleW" min="50" max="120" step="1" value="${handleW}" aria-label="提手镂空孔宽度"/><input type="number" class="extra-dim-num" data-extra-dim="handleW" min="50" max="120" step="1" value="${handleW}" aria-label="提手镂空孔宽度数值"/></div></div>`;
  }else{
    container.hidden=true;
    container.innerHTML='';
  }
}
function renderLayers(){
  const layers=project.layers.filter(l=>sideOf(l)===activeSide);
  $('#layer-count').textContent=`${SIDES[activeSide]} · ${layers.length}`;
  const typeGlyph=type=>type==='text'?'text':type==='image'?'image':type==='barcode'?'barcode':type==='qrcode'?'qrcode':type==='symbol'?'symbol':'shape';
  $('#layer-list').innerHTML=[...layers].reverse().map(l=>`<div class="layer-row ${l.id===selected?'selected':''} ${!l.visible?'is-hidden':''}" data-layer="${l.id}"><button class="layer-main" data-select="${l.id}"><span class="layer-type">${icon(typeGlyph(l.type))}</span><span><strong>${esc(l.name)}</strong><small>${esc(dieline.panels.find(p=>p.id===l.panel)?.label??'')} · ${SIDES[activeSide]}</small></span></button><button class="layer-eye" data-visibility="${l.id}" title="${l.visible?'隐藏':'显示'}图层" aria-label="${l.visible?'隐藏':'显示'}${esc(l.name)}">${icon(l.visible?'eye':'hidden')}</button></div>`).join('')||`<div class="empty-layers">${icon('layers')}<strong>${SIDES[activeSide]}还没有图层</strong><span>添加图文，或按 Ctrl+V 粘贴</span></div>`;
  $('#copy-layer').disabled=!selected;$('#cut-layer').disabled=!selected;
  editorUI?.decorateLayers();
}

function numberField(key,label,value,{min=-10000,max=10000,step=1,unit=''}={}){return `<label class="property-field"><span>${label}</span><div><input id="prop-${key}" data-property="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" aria-label="${label}"/>${unit?`<em>${unit}</em>`:''}</div></label>`;}
function renderInspector(){
  const layer=project.layers.find(l=>l.id===selected),panel=dieline.panels.find(p=>p.id===panelId);
  const surface=surfaceOf(project,activeSide);
  const typeMap={text:'文字',image:'图片',shape:'图形',barcode:'条形码',qrcode:'二维码',symbol:'包装标志'};
  $('#selected-type').textContent=SIDES[activeSide]+' · '+(layer?(typeMap[layer.type]??'图层'):'面板');
  if(!panel)return;
  if(getSelectedIds().length>1){editorUI?.renderMultiInspector($('#inspector'));return;}
  if(!layer){
    const panelColor=surface.colors[panel.id]??surface.paper;
    const panelCmyk=colorMode==='cmyk'?`<span class="cmyk-badge" title="CMYK 印刷打样色值">${formatCmyk(panelColor)}</span>`:'';
    $('#inspector').innerHTML=`<section class="inspector-section panel-summary"><span class="inspector-overline">${activeSide==='inside'?'INSIDE':'OUTSIDE'} PANEL</span><div class="panel-preview">${boxIllustration(project.type)}</div><h3>${esc(panel.label)} · ${SIDES[activeSide]}</h3><span>${panel.w.toFixed(1)} × ${panel.h.toFixed(1)} mm</span></section><section class="inspector-section"><div class="section-heading"><h2>面板填色</h2><button id="reset-panel-color" class="text-button">重置</button></div><label class="color-field"><input id="panel-color" type="color" value="${panelColor}" aria-label="面板背景颜色"/><span>${panelColor.toUpperCase()}</span>${panelCmyk}${icon('down')}</label></section><section class="inspector-section"><h2>在这个面上添加</h2><div class="panel-add-grid"><button class="wide-button" id="panel-add-text">${icon('text')}添加文字${icon('plus')}</button><button class="wide-button" id="panel-add-image">${icon('image')}添加图片${icon('plus')}</button><button class="wide-button" id="panel-add-shape">${icon('shape')}添加图形${icon('plus')}</button><button class="wide-button" id="panel-add-barcode">${icon('barcode')}添加条码${icon('plus')}</button><button class="wide-button" id="panel-add-qrcode">${icon('qrcode')}添加二维码${icon('plus')}</button><button class="wide-button" id="panel-add-symbol">${icon('symbol')}常用标志${icon('plus')}</button></div><p class="field-note">图文默认可跨面板连续排版。<br/>直接拖过折线即可延伸到相邻面。</p></section><section class="inspector-section selection-note"><span class="tiny-badge">${panel.kind==='glue'?'粘合区':'当前盒型'}</span><p>${BOX_TYPES[project.type].name}<br/><span>${BOX_TYPES[project.type].english}</span></p></section>`;
    return;
  }
  const layerCmyk=colorMode==='cmyk'&&layer.type!=='image'?`<span class="cmyk-badge" title="CMYK 印刷打样色值">${formatCmyk(layer.color)}</span>`:'';
  $('#inspector').innerHTML=`<section class="inspector-section"><label class="layer-name-label">图层名称<input id="layer-name" value="${esc(layer.name)}" maxlength="60"/></label><label class="property-label">基准面板<select id="layer-panel">${dieline.panels.filter(p=>p.kind!=='glue').map(p=>`<option value="${p.id}" ${p.id===layer.panel?'selected':''}>${p.label}</option>`).join('')}</select></label><label class="property-label">印刷面<select id="layer-side"><option value="outside" ${activeSide==='outside'?'selected':''}>外面</option><option value="inside" ${activeSide==='inside'?'selected':''}>内面</option></select></label></section>
  ${layer.type==='text'?`<section class="inspector-section"><h2>文字内容</h2><textarea id="prop-text" rows="4" maxlength="5000" spellcheck="false" aria-label="文字内容">${esc(layer.text)}</textarea><div class="text-style-row"><select id="prop-font" aria-label="字体"><option value="sans" ${layer.font==='sans'?'selected':''}>简洁黑体</option><option value="serif" ${layer.font==='serif'?'selected':''}>经典宋体</option></select><button id="toggle-bold" class="icon-button ${layer.bold?'active':''}" title="粗体" aria-label="粗体"><b>B</b></button></div>${numberField('size','字号',layer.size,{min:1,max:100,step:.5,unit:'mm'})}</section>`:''}
  ${layer.type==='shape'?`<section class="inspector-section"><h2>图形样式</h2><select id="prop-shape" aria-label="图形样式"><option value="rect" ${layer.shape==='rect'?'selected':''}>矩形</option><option value="ellipse" ${layer.shape==='ellipse'?'selected':''}>椭圆</option><option value="botanical" ${layer.shape==='botanical'?'selected':''}>植物图形</option></select></section>`:''}
  ${layer.type==='barcode'?`<section class="inspector-section"><h2>条形码设置</h2><label class="property-label">条码制式<select id="prop-barcode-format" aria-label="条码制式"><option value="ean13" ${(layer.format||'ean13')==='ean13'?'selected':''}>EAN-13 商品零售码</option><option value="code128" ${(layer.format||'ean13')==='code128'?'selected':''}>Code 128 物流通用码</option></select></label><label class="property-label">条码编码 / 内容<input id="prop-barcode-code" value="${esc(layer.code||'')}" maxlength="80" spellcheck="false" placeholder="${(layer.format||'ean13')==='ean13'?'如 6901234567892':'如 FOLDSTUDIO'}" style="width:100%;padding:8px;border:1px solid #e4e8db;border-radius:var(--radius-sm);background:#fff;font-size:11px;font-family:monospace"/></label><div style="display:flex;align-items:center;margin-top:10px"><label class="checkbox-label" style="display:flex;align-items:center;gap:6px;font-size:11px;color:#8c9980;cursor:pointer"><input type="checkbox" id="prop-barcode-text" ${layer.showText!==false?'checked':''}/><span>显示下方识别文字</span></label></div><label class="property-label" style="margin-top:10px">白底护衬（防止透底）<select id="prop-barcode-bg" aria-label="条码底色"><option value="#ffffff" ${(layer.bgColor||'#ffffff')==='#ffffff'?'selected':''}>纯白底衬（工业推荐）</option><option value="transparent" ${layer.bgColor==='transparent'?'selected':''}>透明底（透出纸张）</option></select></label><small class="field-note" style="display:block;margin-top:6px">${(layer.format||'ean13')==='ean13'?'EAN-13 需 12~13 位数字，第 13 位自动计算校验':'Code 128 支持英文字母、数字与常用符号'}</small></section>`:''}
  ${layer.type==='qrcode'?`<section class="inspector-section"><h2>二维码设置</h2><label class="property-label">文本或网址链接<textarea id="prop-qrcode-text" rows="3" maxlength="2000" spellcheck="false" placeholder="输入网址或文字内容" style="width:100%;padding:8px;border:1px solid #e4e8db;border-radius:var(--radius-sm);background:#fff;font-size:11px">${esc(layer.text||'')}</textarea></label><label class="property-label" style="margin-top:10px">白底护衬（手机快速扫码）<select id="prop-qrcode-bg" aria-label="二维码底色"><option value="#ffffff" ${(layer.bgColor||'#ffffff')==='#ffffff'?'selected':''}>纯白底衬（推荐）</option><option value="transparent" ${layer.bgColor==='transparent'?'selected':''}>透明底（透出纸张）</option></select></label><small class="field-note" style="display:block;margin-top:6px">支持网址与中英文，扫码即开</small></section>`:''}
  ${layer.type==='symbol'?`<section class="inspector-section"><h2>包装标志</h2><label class="property-label">标志类型<select id="prop-symbol" aria-label="选择包装标志">${PACKAGING_SYMBOLS.map(s=>`<option value="${s.id}" ${(layer.symbol||'recycle')===s.id?'selected':''}>${s.name}</option>`).join('')}</select></label><small class="field-note" style="display:block;margin-top:6px">标准工业矢量标志，任意缩放保持高清</small></section>`:''}
  <section class="inspector-section"><h2>位置与尺寸</h2><div class="property-grid">${numberField('x','X',+(layer.x*panel.w).toFixed(1),{step:.5,unit:'mm'})}${numberField('y','Y',+(layer.y*panel.h).toFixed(1),{step:.5,unit:'mm'})}${numberField('w','宽度',+(layer.w*panel.w).toFixed(1),{min:1,max:10000,step:.5,unit:'mm'})}${numberField('h','高度',+(layer.h*panel.h).toFixed(1),{min:1,max:10000,step:.5,unit:'mm'})}</div>${numberField('rotation','旋转',layer.rotation,{min:-360,max:360,unit:'°'})}<div class="align-buttons"><button data-align="x">水平居中</button><button data-align="y">垂直居中</button></div></section>
  <section class="inspector-section"><h2>外观</h2>${layer.type!=='image'?`<label class="color-field"><input id="layer-color" type="color" value="${layer.color}" aria-label="图层颜色"/><span>${layer.color.toUpperCase()}</span>${layerCmyk}${icon('down')}</label>`:''}<label class="opacity-field">不透明度<span id="opacity-value">${Math.round(layer.opacity*100)}%</span><input id="prop-opacity" type="range" min="0" max="100" value="${Math.round(layer.opacity*100)}" aria-label="图层不透明度"/></label></section>
  <section class="inspector-section layer-actions"><button id="duplicate-layer" class="wide-button">${icon('copy')}复制图层<span>Ctrl D</span></button><div class="reorder-buttons"><button id="layer-up">上移一层</button><button id="layer-down">下移一层</button></div><button id="delete-layer" class="wide-button danger">${icon('trash')}删除图层<span>Del</span></button></section>`;
  editorUI?.decorateInspector();
  packagingUI?.decorate();
  colorUI?.sync();
}
function updateLayerProperties(){
  if(!editor.drag||editor.drag.type==='pan')return;
  const layer=project.layers.find(l=>l.id===selected),panel=dieline.panels.find(p=>p.id===layer?.panel);if(!layer||!panel)return;
  for(const key of ['x','y','w','h']){const input=$(`#prop-${key}`);if(input&&document.activeElement!==input)input.value=+(layer[key]*(key==='x'||key==='w'?panel.w:panel.h)).toFixed(1);}
}
function setFoldUI(){
  $('#fold-slider').value=Math.round(project.fold*100);
  $('#fold-value').innerHTML=`${Math.round(project.fold*100)}<span>%</span>`;
  $('#fold-slider').style.setProperty('--progress',`${project.fold*100}%`);
  document.querySelectorAll('.fold-preset-btn').forEach(btn=>{
    const target=+btn.dataset.foldPreset;
    btn.classList.toggle('active',Math.abs(project.fold-target)<0.03);
  });
}
function setFold(value,save=false){project.fold=value;preview?.setFold(value);setFoldUI();if(save)commit();}
function stopAnimation(){playing=false;cancelAnimationFrame(animationRaf);$('#play-fold').innerHTML=icon('play');$('#play-fold').setAttribute('aria-label','播放折叠动画');}
function playAnimation(){
  if(playing){stopAnimation();commit();return;}
  playing=true;$('#play-fold').innerHTML=icon('pause');$('#play-fold').setAttribute('aria-label','暂停折叠动画');
  const initial=project.fold>=.99?0:project.fold,start=performance.now(),duration=(1-initial)*1800;
  if(initial===0){setFold(0);preview?.fit();}
  function step(now){const t=Math.min(1,(now-start)/duration);setFold(initial+(1-initial)*(t*t*(3-2*t)));if(t<1)animationRaf=requestAnimationFrame(step);else{stopAnimation();preview?.fit();commit();}}
  animationRaf=requestAnimationFrame(step);
}
function addLayer(type,shape='rect',symbol='recycle'){
  if(project.layers.length>=120){notify('当前工程最多支持 120 个图层');return;}
  let panel=dieline.panels.find(p=>p.id===panelId);
  if(!panel||panel.kind==='glue'||panel.kind==='corner'){
    panel=dieline.panels.find(p=>p.id===BOX_TYPES[project.type].printPanel)||dieline.panels.find(p=>p.kind==='body')||dieline.panels[0];
    panelId=panel.id;
  }
  const pw=panel?panel.w:100,ph=panel?panel.h:100;
  let name='新图层',w=0.5,h=0.3,color=project.accent;
  if(type==='text'){name='新文字';w=0.7;h=0.2;}
  else if(type==='shape'){name=shape==='rect'?'新矩形':shape==='ellipse'?'新椭圆':'植物图形';w=0.5;h=0.3;color=project.highlight;}
  else if(type==='barcode'){name='商品条形码';w=Math.min(0.85,Math.max(0.2,38/pw));h=Math.min(0.8,Math.max(0.15,24/ph));color='#000000';}
  else if(type==='qrcode'){name='二维码';const s=Math.min(26,pw*0.7,ph*0.7);w=Math.max(0.15,s/pw);h=Math.max(0.15,s/ph);color='#000000';}
  else if(type==='symbol'){const symObj=PACKAGING_SYMBOLS.find(s=>s.id===symbol);name=symObj?symObj.name.split(' ')[0]:'包装标志';const s=Math.min(20,pw*0.6,ph*0.6);w=Math.max(0.12,s/pw);h=Math.max(0.12,s/ph);color=project.accent;}
  const layer={id:uid(),type,name,panel:panelId,side:activeSide,x:.5,y:.5,w,h,rotation:0,opacity:1,visible:true,color};
  if(type==='text')Object.assign(layer,{text:'在这里，写下灵感',size:6,font:'sans',bold:false});
  else if(type==='shape')Object.assign(layer,{shape});
  else if(type==='barcode')Object.assign(layer,{code:'6901234567892',format:'ean13',showText:true,bgColor:'#ffffff'});
  else if(type==='qrcode')Object.assign(layer,{text:'https://fold.studio',bgColor:'#ffffff'});
  else if(type==='symbol')Object.assign(layer,{symbol:symbol||'recycle'});
  project.layers.push(layer);selected=layer.id;textureDirty=true;schedule();commit();renderInspector();
  if(type==='text'){$('#prop-text')?.focus();$('#prop-text')?.select();}return layer;
}
function deleteLayer(){editorUI?.run('delete');}
function duplicateLayer(){editorUI?.run('duplicate');}
function restore(direction){stopAnimation();editor.up();clearTimeout(geometryTimer);const restored=history[direction]();if(!restored)return;if(restored.type!==project.type)panelId=BOX_TYPES[restored.type].printPanel;project=restored;selected=null;selectionIds=[];refresh();scheduleSave();}
function setTool(tool){editor.tool=tool;editor.canvas.style.cursor=tool==='pan'?'grab':'default';$('#tool-select').classList.toggle('active',tool==='select');$('#tool-pan').classList.toggle('active',tool==='pan');}
document.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>setSide(b.dataset.side));
$('#shortcut-help').onclick=()=>$('#shortcuts-dialog').showModal();$('#close-shortcuts').onclick=()=>$('#shortcuts-dialog').close();
const inspectSide=document.createElement('button');inspectSide.id='inspect-surface';inspectSide.className='inspect-surface';inspectSide.textContent='展开查看当前面';
inspectSide.onclick=()=>{stopAnimation();setFold(0,true);preview?.showAll();preview?.inspectPanel(panelId,activeSide);};
$('.preview-stage').appendChild(inspectSide);
const inspectPanel=document.createElement('button');inspectPanel.id='inspect-panel';inspectPanel.className='inspect-panel';inspectPanel.textContent='单面检查';
inspectPanel.onclick=()=>{if(preview?.isolatedPanel)preview.fit();else preview?.inspectPanel(panelId,activeSide,true);};
$('.preview-stage').appendChild(inspectPanel);
if(preview)preview.onIsolation=active=>{inspectPanel.textContent=active?'返回整盒':'单面检查';};
$('#panel-selector').onchange=e=>selectLayer(null,e.target.value);

$('#open-templates').onclick=()=>{
  const dialog=$('#templates-dialog');
  setTemplateFilter('all');dialog.showModal();
  $('#box-templates .template-card.active')?.scrollIntoView({block:'nearest'});
};
$('#close-templates').onclick=()=>$('#templates-dialog').close();
let templateBackdropDown=false;
function outsideDialog(e){const r=$('#templates-dialog').getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;}
$('#templates-dialog').addEventListener('pointerdown',e=>{templateBackdropDown=e.target===$('#templates-dialog')&&outsideDialog(e);});
$('#templates-dialog').addEventListener('click',e=>{if(templateBackdropDown&&e.target===$('#templates-dialog')&&outsideDialog(e))$('#templates-dialog').close();templateBackdropDown=false;});
function setTemplateFilter(filter){
  document.querySelectorAll('.filter-tab').forEach(tab=>{
    const active=tab.dataset.filter===filter;
    tab.classList.toggle('active',active);tab.setAttribute('aria-selected',active);tab.setAttribute('role','tab');tab.tabIndex=active?0:-1;
  });
  document.querySelectorAll('#box-templates .template-card').forEach(card=>{card.hidden=filter!=='all'&&card.dataset.category!==filter;});
  $('#box-templates').scrollTop=0;
}
document.querySelectorAll('.filter-tab').forEach(tab=>{
  tab.onclick=()=>setTemplateFilter(tab.dataset.filter);
  tab.onkeydown=e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const tabs=[...document.querySelectorAll('.filter-tab')],index=tabs.indexOf(tab);
    const next=tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];
    setTemplateFilter(next.dataset.filter);next.focus();
  };
});

$('#box-templates').addEventListener('click',e=>{
  const btn=e.target.closest('[data-template]');if(!btn)return;
  if(btn.dataset.template===project.type){
    $('#templates-dialog').close();
    return;
  }
  const type=btn.dataset.template;
  confirmAction=()=>{stopAnimation();clearTimeout(geometryTimer);editor.up();project=newProject(type);panelId=BOX_TYPES[type].printPanel;activeSide='outside';selected=null;dirtySides.clear();refresh({fit:true});commit();notify(`已切换为${BOX_TYPES[type].name}`);$('#templates-dialog').close();};
  $('#confirm-dialog').showModal();
});
$('#cancel-confirm').onclick=()=>$('#confirm-dialog').close();
$('#confirm-dialog').addEventListener('close',()=>{confirmAction=null;});
$('#accept-confirm').onclick=()=>{const action=confirmAction;confirmAction=null;$('#confirm-dialog').close();action?.();};
for(const input of document.querySelectorAll('[data-dimension]')){
  input.addEventListener('input',()=>{
    const value=+input.value;if(!Number.isFinite(value)||value<15||value>600){input.setAttribute('aria-invalid','true');return;}
    input.removeAttribute('aria-invalid');project.dimensions[input.dataset.dimension]=value;
    if(BOX_TYPES[project.type].family==='container'||BOX_TYPES[project.type].square){
      const dim=input.dataset.dimension;
      if(dim==='length'){
        project.dimensions.depth=value;
        const other=document.querySelector('[data-dimension="depth"]');
        if(other)other.value=value;
      }else if(dim==='depth'){
        project.dimensions.length=value;
        const other=document.querySelector('[data-dimension="length"]');
        if(other)other.value=value;
      }
    }
    clearTimeout(geometryTimer);geometryTimer=setTimeout(()=>refresh({fit:true}),100);
  });
  input.addEventListener('change',()=>{
    clearTimeout(geometryTimer);
    if(!input.checkValidity()){input.value=project.dimensions[input.dataset.dimension];input.removeAttribute('aria-invalid');return;}
    if(BOX_TYPES[project.type].family==='container'||BOX_TYPES[project.type].square){
      const dim=input.dataset.dimension;
      if(dim==='length'){
        project.dimensions.depth=+input.value;
        const other=document.querySelector('[data-dimension="depth"]');
        if(other)other.value=input.value;
      }else if(dim==='depth'){
        project.dimensions.length=+input.value;
        const other=document.querySelector('[data-dimension="length"]');
        if(other)other.value=input.value;
      }
    }
    refresh({fit:true});commit();
  });
}
$('#project-name').addEventListener('input',e=>{project.name=e.target.value;scheduleSave();});$('#project-name').addEventListener('change',commit);
$('#material').onchange=e=>{project.material=e.target.value;if(project.material==='kraft')project[activeSide==='inside'?'insidePaper':'paper']='#c8af83';dirtySides.add('outside');dirtySides.add('inside');renderSurface();schedule();commit();};
$('#paper-color').oninput=e=>{
  project[activeSide==='inside'?'insidePaper':'paper']=e.target.value;
  const paperCmyk=colorMode==='cmyk'?` · ${formatCmyk(e.target.value)}`:'';
  $('#paper-hex').textContent=`${e.target.value.toUpperCase()}${paperCmyk}`;
  textureDirty=true;
  schedule();
};
$('#paper-color').onchange=()=>{commit();renderInspector();};
document.querySelectorAll('[data-palette]').forEach(b=>b.onclick=()=>{
  const palette=PALETTES[+b.dataset.palette],oldAccent=project.accent,oldPaper=surfaceOf(project,activeSide).paper;
  for(const l of project.layers.filter(l=>sideOf(l)===activeSide)){if(l.color===oldAccent)l.color=palette.accent;else if(l.color===oldPaper)l.color=palette.color;}
  Object.assign(project,{[activeSide==='inside'?'insidePaper':'paper']:palette.color,accent:palette.accent,highlight:palette.highlight});refresh({build:false});textureDirty=true;schedule();commit();
});
$('#layer-list').addEventListener('click',e=>{const visibility=e.target.closest('[data-visibility]');if(visibility){const layer=project.layers.find(l=>l.id===visibility.dataset.visibility);layer.visible=!layer.visible;textureDirty=true;schedule();commit();return;}const row=e.target.closest('[data-select]');if(row){const l=project.layers.find(l=>l.id===row.dataset.select);if(e.shiftKey||e.ctrlKey||e.metaKey){const group=expandGroups(project,[l.id]),ids=getSelectedIds(),next=ids.includes(l.id)?ids.filter(id=>!group.includes(id)):[...new Set([...ids,...group])];selectLayer(next.at(-1)??null,l.panel,next);}else selectLayer(l.id,l.panel);}});
$('#inspector').addEventListener('input',e=>{
  const layer=project.layers.find(l=>l.id===selected),input=e.target,panel=dieline.panels.find(p=>p.id===panelId);
  if(input.id==='panel-color'){
    surfaceOf(project,activeSide).colors[panelId]=input.value;
    const hexSpan=input.parentElement.querySelector('span');
    if(hexSpan)hexSpan.textContent=input.value.toUpperCase();
    const badge=input.parentElement.querySelector('.cmyk-badge');
    if(badge)badge.textContent=formatCmyk(input.value);
  }
  else if(!layer)return;
  else if(input.id==='prop-text')layer.text=input.value;
  else if(input.id==='prop-barcode-code')layer.code=input.value;
  else if(input.id==='prop-qrcode-text')layer.text=input.value;
  else if(input.id==='layer-name')layer.name=input.value;
  else if(input.id==='layer-color'){
    layer.color=input.value;
    const hexSpan=input.parentElement.querySelector('span');
    if(hexSpan)hexSpan.textContent=input.value.toUpperCase();
    const badge=input.parentElement.querySelector('.cmyk-badge');
    if(badge)badge.textContent=formatCmyk(input.value);
  }
  else if(input.id==='prop-opacity'){layer.opacity=+input.value/100;$('#opacity-value').textContent=`${input.value}%`;}
  else if(input.dataset.property){const key=input.dataset.property,value=+input.value;if(!input.checkValidity()||!Number.isFinite(value))return;layer[key]=['x','w'].includes(key)?value/panel.w:['y','h'].includes(key)?value/panel.h:value;}
  else return;
  textureDirty=true;schedule();scheduleSave();
});
$('#inspector').addEventListener('change',e=>{
  const layer=project.layers.find(l=>l.id===selected);
  if(e.target.id==='layer-panel'&&layer){layer.panel=e.target.value;panelId=layer.panel;}
  if(e.target.id==='layer-side'&&layer){dirtySides.add(activeSide);layer.side=e.target.value;activeSide=layer.side;renderSurface();renderLayers();}
  if(e.target.id==='prop-font'&&layer)layer.font=e.target.value;
  if(e.target.id==='prop-shape'&&layer)layer.shape=e.target.value;
  if(e.target.id==='prop-barcode-format'&&layer){
    layer.format=e.target.value;
  }
  if(e.target.id==='prop-barcode-text'&&layer)layer.showText=e.target.checked;
  if(e.target.id==='prop-barcode-bg'&&layer)layer.bgColor=e.target.value;
  if(e.target.id==='prop-qrcode-bg'&&layer)layer.bgColor=e.target.value;
  if(e.target.id==='prop-qrcode-level'&&layer)layer.errorCorrectionLevel=e.target.value;
  if(e.target.id==='prop-symbol'&&layer){
    layer.symbol=e.target.value;
    const sObj=PACKAGING_SYMBOLS.find(s=>s.id===layer.symbol);
    if(sObj&&(layer.name.startsWith('新标志')||layer.name.startsWith('包装标志')||PACKAGING_SYMBOLS.some(s=>s.name.startsWith(layer.name)))){
      layer.name=sObj.name.split(' ')[0];
    }
  }
  textureDirty=true;schedule();commit();
  if(['layer-panel','layer-side','prop-font','prop-shape','prop-barcode-format','prop-symbol'].includes(e.target.id))renderInspector();
});
$('#inspector').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const layer=project.layers.find(l=>l.id===selected);
  if(b.id==='panel-add-text')return addLayer('text');
  if(b.id==='panel-add-image')return $('#image-input').click();
  if(b.id==='panel-add-shape')return addLayer('shape');
  if(b.id==='panel-add-barcode')return addLayer('barcode');
  if(b.id==='panel-add-qrcode')return addLayer('qrcode');
  if(b.id==='panel-add-symbol')return addLayer('symbol');
  if(b.id==='reset-panel-color'){delete surfaceOf(project,activeSide).colors[panelId];textureDirty=true;schedule();commit();renderInspector();}
  if(!layer)return;
  if(b.id==='duplicate-layer')return duplicateLayer();if(b.id==='delete-layer')return deleteLayer();
  if(b.id==='toggle-bold'){layer.bold=!layer.bold;b.classList.toggle('active',layer.bold);}
  if(b.dataset.align)layer[b.dataset.align]=.5;
  if(['layer-up','layer-down'].includes(b.id)){const i=project.layers.indexOf(layer),j=i+(b.id==='layer-up'?1:-1);if(j>=0&&j<project.layers.length)[project.layers[i],project.layers[j]]=[project.layers[j],project.layers[i]];}
  textureDirty=true;schedule();commit();if(b.dataset.align)renderInspector();
});
$('#add-text').onclick=()=>addLayer('text');
$('#add-shape').onclick=()=>addLayer('shape');
$('#add-image').onclick=()=>$('#image-input').click();
$('#add-barcode').onclick=()=>addLayer('barcode');
$('#add-qrcode').onclick=()=>addLayer('qrcode');
$('#add-symbol').onclick=()=>addLayer('symbol');

let isEditorExpanded=false;
function toggleExpandEditor(){
  isEditorExpanded=!isEditorExpanded;
  $('.canvas-split').classList.toggle('expanded-editor',isEditorExpanded);
  const btn=$('#toggle-expand-editor');
  if(btn){
    btn.innerHTML=icon(isEditorExpanded?'collapse':'expand');
    const label=isEditorExpanded?'恢复双屏预览 (M)':'展开平面编辑 (M)';
    btn.title=label;btn.setAttribute('aria-label',label);
  }
  requestAnimationFrame(()=>{
    editor.resize();
    editor.fit();
    if(!isEditorExpanded){preview?.resize?.();preview?.fit?.();}
  });
  notify(isEditorExpanded?'已全宽展开平面编辑 (按 M 恢复)':'已恢复双屏并排预览');
}
$('#toggle-expand-editor').onclick=toggleExpandEditor;

$('#tool-select').onclick=()=>setTool('select');$('#tool-pan').onclick=()=>setTool('pan');
$('#undo').onclick=()=>restore('undo');$('#redo').onclick=()=>restore('redo');
$('#toggle-guides').onclick=()=>{editor.guides=!editor.guides;$('#toggle-guides').classList.toggle('active',editor.guides);editor.invalidate();};
$('#zoom-in').onclick=()=>editor.zoom(1.2);$('#zoom-out').onclick=()=>editor.zoom(1/1.2);$('#fit-2d').onclick=()=>editor.fit();$('#zoom-label').onclick=()=>editor.fit();$('#fit-3d').onclick=()=>preview?.fit();
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{preview?.fit(b.dataset.view);document.querySelectorAll('[data-view]').forEach(v=>v.classList.toggle('active',v===b));});
$('#fold-slider').oninput=e=>{stopAnimation();setFold(+e.target.value/100);};$('#fold-slider').onchange=commit;
$('#unfold').onclick=()=>{stopAnimation();setFold(0,true);preview?.fit();};$('#fold').onclick=()=>{stopAnimation();setFold(1,true);preview?.fit();};$('#play-fold').onclick=playAnimation;
document.querySelectorAll('.fold-preset-btn').forEach(btn=>{
  btn.onclick=()=>{stopAnimation();setFold(+btn.dataset.foldPreset,true);preview?.fit();commit();};
});
$('#extra-dimensions').addEventListener('input',e=>{
  const input=e.target,key=input.dataset.extraDim;
  if(!key)return;
  const val=+input.value;
  if(!Number.isFinite(val))return;
  project.dimensions[key]=val;
  document.querySelectorAll(`#extra-dimensions [data-extra-dim="${key}"]`).forEach(el=>{if(el!==input)el.value=val;});
  const badge=$(`#val-${key}`);
  if(badge)badge.textContent=`${val} mm`;
  clearTimeout(geometryTimer);
  geometryTimer=setTimeout(()=>refresh({fit:true}),80);
});
$('#extra-dimensions').addEventListener('change',()=>commit());
$('#quality').onchange=e=>{project.quality=e.target.value;preview?.setQuality(project.quality);preview?.paint(project);commit();};
$('#image-input').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(file)await importImage(file);};

async function importImage(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){notify('请选择 PNG、JPG 或 WebP 图片');return;}
  if(file.size>15*1024*1024){notify('图片请小于 15 MB');return;}
  let bitmap;
  try{
    bitmap=await createImageBitmap(file);const scale=Math.min(1,1536/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();bitmap=null;
    if(project.layers.length>=120)throw new Error('当前工程最多支持 120 个图层');
    const panel=dieline.panels.find(p=>p.id===panelId),w=.7,h=Math.min(.8,w*panel.w*canvas.height/canvas.width/panel.h);
    const layer={id:uid(),type:'image',name:file.name.slice(0,60),panel:panelId,side:activeSide,x:.5,y:.5,w:h*panel.h*canvas.width/canvas.height/panel.w,h,rotation:0,opacity:1,visible:true,src:canvas.toDataURL('image/png')};
    project.layers.push(layer);selected=layer.id;images.get(layer.src);textureDirty=true;schedule();commit();renderInspector();notify('图片已添加，可以拖动与缩放');
  }catch(error){bitmap?.close();notify(error.message??'图片导入失败');}
}
$('#editor-host').addEventListener('dragover',e=>{e.preventDefault();$('#editor-host').classList.add('drag-over');});
$('#editor-host').addEventListener('dragleave',()=>$('#editor-host').classList.remove('drag-over'));
$('#editor-host').addEventListener('drop',e=>{e.preventDefault();$('#editor-host').classList.remove('drag-over');const file=e.dataTransfer.files[0];if(file)importImage(file);});

$('#save-project').onclick=()=>{download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),`${safeName()}.fold`);persist();notify('工程已下载，包含全部图文与尺寸');};
$('#import-project').onclick=()=>$('#project-input').click();
$('#project-input').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(file.size>45*1024*1024){notify('工程文件请小于 45 MB');return;}
  try{
    const content=await file.text();let input,importSide='outside';
    if(file.name.toLowerCase().endsWith('.svg')){
      const doc=new DOMParser().parseFromString(content,'image/svg+xml'),metadata=doc.querySelector('metadata[data-fold-studio]');
      if(!metadata)throw new Error('此 SVG 没有折间工程信息。当前版本仅支持重新打开折间导出的 SVG；外部刀版结构识别尚未提供。');
      input=JSON.parse(metadata.textContent);
      if(metadata.getAttribute('data-surface')==='inside')importSide='inside';
    }else input=JSON.parse(content);
    const next=validateProject(input);await images.preload(next.layers);stopAnimation();clearTimeout(geometryTimer);project=next;selected=null;activeSide=importSide;panelId=BOX_TYPES[project.type].printPanel;refresh({fit:true});commit();notify('工程已打开');
  }catch(error){notify(`打开失败：${error.message}`);}
};
function safeName(){return project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,80)||'折间工程';}
$('#export-toggle').onclick=()=>$('#export-menu').hidden=!$('#export-menu').hidden;
document.addEventListener('click',e=>{if(!e.target.closest('.export-wrap'))$('#export-menu').hidden=true;});
async function flatCanvas(max=3072,side=activeSide){
  await images.preload(project.layers);await document.fonts.ready;
  const canvas=document.createElement('canvas'),scale=max/Math.max(dieline.width,dieline.height);canvas.width=Math.ceil(dieline.width*scale);canvas.height=Math.ceil(dieline.height*scale);
  const ctx=canvas.getContext('2d');
  if(side==='inside')ctx.setTransform(-scale,0,0,scale,dieline.maxX*scale,-dieline.minY*scale);
  else ctx.setTransform(scale,0,0,scale,-dieline.minX*scale,-dieline.minY*scale);
  paintArtwork(ctx,project,dieline,images,side,colorMode);return canvas;
}
$('#export-glb').onclick=()=>{
  $('#export-menu').hidden=true;
  $('#glb-fold-current-label').textContent=`当前折叠状态 (${Math.round(project.fold*100)}%)`;
  $('#export-glb-dialog').showModal();
};
$('#close-export-glb').onclick=()=>$('#export-glb-dialog').close();
$('#cancel-export-glb').onclick=()=>$('#export-glb-dialog').close();
$('#confirm-export-glb').onclick=async()=>{
  const foldChoice=$('input[name="glb-fold"]:checked')?.value||'current';
  const foldValue=foldChoice==='closed'?1:foldChoice==='flat'?0:project.fold;
  const foldName=foldChoice==='closed'?'闭合':foldChoice==='flat'?'平铺':`${Math.round(project.fold*100)}%折叠`;
  const resolution=parseInt($('#glb-resolution').value,10)||2048;
  const includeInside=$('#glb-inside').checked;
  const btn=$('#confirm-export-glb'),oldText=btn.innerHTML;
  btn.disabled=true;btn.innerHTML='正在生成 3D 模型...';
  try{
    const glbBuffer=await exportGLB(project,dieline,images,{fold:foldValue,resolution,includeInside});
    const blob=new Blob([glbBuffer],{type:'model/gltf-binary'});
    download(blob,`${safeName()}-${foldName}.glb`);
    $('#export-glb-dialog').close();
    const sizeMB=(blob.size/(1024*1024)).toFixed(2);
    notify(`已导出三维模型：${safeName()}-${foldName}.glb（${sizeMB} MB）`);
  }catch(err){
    notify(`导出三维模型失败：${err.message}`);
  }finally{
    btn.disabled=false;btn.innerHTML=oldText;
  }
};
$('#export-png').onclick=async()=>{if(!preview){notify('三维预览尚未启动');return;}await images.preload(project.layers);preview.paint(project);const blob=await preview.capture();if(blob)download(blob,`${safeName()}-3D.png`);$('#export-menu').hidden=true;};
$('#export-flat').onclick=async()=>{try{const side=activeSide,canvas=await flatCanvas(3072,side);canvas.toBlob(blob=>{if(blob)download(blob,`${safeName()}-${SIDES[side]}-平面.png`);});$('#export-menu').hidden=true;}catch{notify('平面图片导出失败');}};
$('#export-svg').onclick=async()=>{
  try{
    const side=activeSide,canvas=await flatCanvas(3072,side);
    const outlines=cutSegments(dieline).map(([a,b])=>`<path d="M${a.join(' ')}L${b.join(' ')}"/>`).join('');
    const folds=creasePaths(dieline).map(p=>`<path data-crease="${p.id}" d="${p.d}"/>`).join('');
    const metadata=esc(JSON.stringify(project));
    const mirror=side==='inside'?`transform="translate(${dieline.minX+dieline.maxX} 0) scale(-1 1)"`:'';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${dieline.width}mm" height="${dieline.height}mm" viewBox="${dieline.minX} ${dieline.minY} ${dieline.width} ${dieline.height}"><title>${esc(project.name)} · ${SIDES[side]}结构草图</title><metadata data-fold-studio="1" data-surface="${side}">${metadata}</metadata><image id="artwork" x="${dieline.minX}" y="${dieline.minY}" width="${dieline.width}" height="${dieline.height}" xlink:href="${canvas.toDataURL('image/png')}"/><g ${mirror}><g id="cut" fill="none" stroke="#d54a48" stroke-width="0.15">${outlines}</g><g id="crease" fill="none" stroke="#368258" stroke-width="0.2" stroke-dasharray="2 1">${folds}</g></g></svg>`;
    download(new Blob([svg],{type:'image/svg+xml'}),`${safeName()}-${SIDES[side]}-刀版.svg`);$('#export-menu').hidden=true;notify(`已导出${SIDES[side]} SVG；工程数据包含内外两面`);
  }catch(error){notify(`导出失败：${error.message}`);}
};
$('#help').onclick=()=>$('#help-dialog').showModal();$('#close-help').onclick=()=>$('#help-dialog').close();$('#dismiss-help').onclick=()=>$('#help-dialog').close();
const editingText=target=>(target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable="true"]'));
function selectedClipboard(){
  const layers=project.layers.filter(l=>getSelectedIds().includes(l.id));if(!layers.length)return null;
  let placement,anchor;
  if(layers.length>1){
    const rects=layers.map(l=>layerRect(l,dieline)),cx=(Math.min(...rects.map(r=>r.left))+Math.max(...rects.map(r=>r.right)))/2,cy=(Math.min(...rects.map(r=>r.top))+Math.max(...rects.map(r=>r.bottom)))/2,p=rects[0].panel;
    anchor={x:(cx-p.x)/p.w,y:(cy-p.y)/p.h};
    placement=Object.fromEntries(layers.map((l,i)=>[l.id,{x:rects[i].x-cx,y:rects[i].y-cy,w:l.w*rects[i].panel.w,h:l.h*rects[i].panel.h}]));
  }
  return encodeLayers(layers,dieline.panels.find(p=>p.id===layers[0].panel),placement,anchor);
}
function nativeCopy(event,cut=false){
  if(editingText(event.target)||$('dialog[open]'))return;
  const text=selectedClipboard();if(!text||!event.clipboardData)return;
  try{event.clipboardData.setData('text/plain',text);try{event.clipboardData.setData(CLIPBOARD_MIME,text);}catch{}event.preventDefault();if(cut)deleteLayer();notify(cut?'已剪切图层，可跨页面粘贴':'已复制图层，可跨页面粘贴');}catch{notify('复制未完成，请重试 Ctrl / ⌘ C');}
}
document.addEventListener('copy',e=>nativeCopy(e));document.addEventListener('cut',e=>nativeCopy(e,true));
async function writeLayerClipboard(cut=false){
  const text=selectedClipboard();if(!text){notify('请先选择一个图层');return;}
  const source=project,sourceId=selected,sourceSelection=getSelectedIds().join(',');
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
    else throw new Error('fallback');
  }catch{
    const previous=document.activeElement,textarea=document.createElement('textarea');textarea.value=text;textarea.className='clipboard-bridge';document.body.appendChild(textarea);textarea.focus();textarea.select();
    const copied=document.execCommand('copy');textarea.remove();previous?.focus();
    if(!copied){notify('浏览器限制了按钮复制，请直接按 Ctrl / ⌘ C');return;}
  }
  if(cut&&project===source&&selected===sourceId&&getSelectedIds().join(',')===sourceSelection)deleteLayer();notify(cut?'已剪切图层，可跨页面粘贴':'已复制图层，可跨页面粘贴');
}
async function pasteText(text,inPlace=false){
  if(!text)return;
  const targetProject=project,targetPanel=panelId,targetSide=activeSide;
  try{
    const payload=decodeLayers(text);let layers;
    if(payload){
      if(lastPasteText===text)pasteCount++;else{lastPasteText=text;pasteCount=1;}
      layers=layersForPaste(project,payload,dieline.panels.find(p=>p.id===panelId),activeSide,inPlace?0:3*pasteCount);
      await images.preload(layers);
    }else{
      if(text.length>5000)throw new Error('普通文字最多支持 5000 字，请分段粘贴');
      if(project.layers.length>=120)throw new Error('当前工程最多支持 120 个图层');
      layers=[{id:uid(),type:'text',name:'粘贴文字',text,panel:panelId,side:activeSide,x:.5,y:.5,w:.85,h:.3,size:5,font:'sans',bold:false,color:project.accent,rotation:0,opacity:1,visible:true}];
    }
    if(project!==targetProject||panelId!==targetPanel||activeSide!==targetSide)throw new Error('粘贴期间目标已改变，请在目标面板重新粘贴');
    if(project.layers.length+layers.length>120)throw new Error('粘贴后超出 120 个图层的上限');
    project.layers.push(...layers);selected=layers.at(-1).id;selectionIds=layers.map(l=>l.id);textureDirty=true;schedule();commit();renderSurface();renderInspector();
    notify(`已粘贴到${dieline.panels.find(p=>p.id===panelId).label} · ${SIDES[activeSide]}`);
  }catch(error){notify(`粘贴失败：${error.message}`);}
}
document.addEventListener('paste',e=>{
  if(editingText(e.target)||$('dialog[open]'))return;
  const inPlace=pasteInPlace;pasteInPlace=false;
  const data=e.clipboardData;if(!data)return;
  const encoded=data.getData(CLIPBOARD_MIME),text=data.getData('text/plain');
  if(encoded){e.preventDefault();pasteText(encoded,inPlace);return;}
  const image=[...data.items].find(item=>item.kind==='file'&&/^image\/(png|jpeg|webp)$/.test(item.type));
  if(image){e.preventDefault();const file=image.getAsFile();if(file)importImage(file);return;}
  if(text){e.preventDefault();pasteText(text,inPlace);}
});
$('#copy-layer').onclick=()=>writeLayerClipboard();$('#cut-layer').onclick=()=>writeLayerClipboard(true);
$('#paste-layer').onclick=async()=>{
  try{
    if(navigator.clipboard?.read){
      const items=await navigator.clipboard.read();
      for(const item of items)if(item.types.includes('text/plain')){await pasteText(await(await item.getType('text/plain')).text());return;}
      for(const item of items){const type=item.types.find(t=>/^image\/(png|jpeg|webp)$/.test(t));if(type){await importImage(new File([await item.getType(type)],'剪贴板图片.png',{type}));return;}}
      notify('剪贴板里没有支持的图层、文字或图片');
    }else if(navigator.clipboard?.readText)await pasteText(await navigator.clipboard.readText());
    else notify('请直接按 Ctrl / ⌘ V 粘贴');
  }catch{notify('浏览器限制了按钮读取，请直接按 Ctrl / ⌘ V 粘贴');}
};
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!$('dialog[open]'))$('#save-project').click();return;}
  if(editingText(e.target)||$('dialog[open]')||e.isComposing)return;
  const modifier=e.ctrlKey||e.metaKey;
  if(modifier){
    const key=e.key.toLowerCase();
    if(key==='a'){e.preventDefault();editorUI.run('select-all');}
    if(key==='g'){e.preventDefault();editorUI.run(e.shiftKey?'ungroup':'group');}
    if(['b','i','u'].includes(key)){e.preventDefault();editorUI.run({b:'bold',i:'italic',u:'underline'}[key]);}
    if(key==='l'){e.preventDefault();editorUI.run('lock');}
    if(e.code==='BracketRight'||e.code==='BracketLeft'){e.preventDefault();editorUI.run(e.code==='BracketRight'?(e.shiftKey?'front':'up'):(e.shiftKey?'back':'down'));}
    if(e.key.toLowerCase()==='z'){e.preventDefault();restore(e.shiftKey?'redo':'undo');}
    if(e.key.toLowerCase()==='y'){e.preventDefault();restore('redo');}
    if(e.key.toLowerCase()==='d'){e.preventDefault();duplicateLayer();}
    if(e.key.toLowerCase()==='v')pasteInPlace=e.shiftKey;
    return;
  }
  if(e.altKey)return;
  if(e.code==='Space'){e.preventDefault();editor.space=true;editor.canvas.style.cursor='grab';}
  if(e.key.toLowerCase()==='v')setTool('select');if(e.key.toLowerCase()==='h')setTool('pan');
  if(e.key==='1')setSide('outside');if(e.key==='2')setSide('inside');
  if(e.key.toLowerCase()==='t'&&e.shiftKey){e.preventDefault();cycleTheme();return;}
  if(e.key.toLowerCase()==='t'&&!e.shiftKey){e.preventDefault();addLayer('text');}
  if(e.key.toLowerCase()==='i')$('#image-input').click();if(e.key.toLowerCase()==='r')addLayer('shape');
  if(e.key.toLowerCase()==='m'){e.preventDefault();toggleExpandEditor();}
  if(e.key.toLowerCase()==='p'){e.preventDefault();$('#color-mode-toggle')?.click();}
  if(e.key.toLowerCase()==='f'){e.preventDefault();if(e.shiftKey)preview?.fit();else editor.fit();}
  if(e.key.toLowerCase()==='g')$('#toggle-guides').click();
  if(e.key==='?')$('#shortcuts-dialog').showModal();
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteLayer();}
  if(e.key==='Escape')selectLayer(null,panelId);
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&selected){e.preventDefault();const step=e.shiftKey?5:1;editorUI.run('nudge',{x:e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,y:e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0});}
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){editor.space=false;editor.canvas.style.cursor=editor.tool==='pan'?'grab':'default';}});
window.addEventListener('blur',()=>{editor.space=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAnimation();clearTimeout(saveTimer);persist();}});
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);persist();});

const THEMES = [
  { id: 'gray', name: '工业中灰', desc: '3D与包装推荐 · 中度灰', icon: 'palette' },
  { id: 'dark', name: '极夜深色', desc: '沉浸高对比 · 纯净深黑', icon: 'moon' },
  { id: 'slate', name: '工程蓝灰', desc: 'CAD工程调 · 蓝灰工作台', icon: 'layers' },
  { id: 'light', name: '经典浅色', desc: '明亮纸白 · 经典清新', icon: 'sun' },
  { id: 'warm', name: '暖沙原纸', desc: '温润原色 · 牛皮纸本', icon: 'leaf' }
];

const getSavedTheme = () => {
  try {
    const saved = localStorage.getItem('fold-theme');
    if (THEMES.some(t => t.id === saved)) return saved;
  } catch {}
  return 'light';
};

function applyTheme(theme) {
  const tObj = THEMES.find(t => t.id === theme) || THEMES[0];
  document.documentElement.setAttribute('data-theme', tObj.id);
  const btn = $('#theme-toggle');
  if (btn) {
    btn.innerHTML = `${icon(tObj.icon)}<span class="theme-text">${tObj.name}</span>${icon('down')}`;
    btn.setAttribute('title', `选择界面主题 (当前: ${tObj.name} · Shift+T 快速切换)`);
    btn.setAttribute('aria-label', `选择界面主题 (当前: ${tObj.name})`);
  }
  $$('.theme-option').forEach(el => {
    el.classList.toggle('active', el.dataset.themeValue === tObj.id);
  });
  editor?.setTheme?.(tObj.id);
  preview?.setTheme?.(tObj.id);
}

function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const currentIndex = THEMES.findIndex(t => t.id === current);
  const nextTheme = THEMES[(currentIndex + 1) % THEMES.length].id;
  try { localStorage.setItem('fold-theme', nextTheme); } catch {}
  applyTheme(nextTheme);
  const tObj = THEMES.find(t => t.id === nextTheme);
  notify(`已切换至【${tObj?.name}】主题`);
}

$('#theme-toggle')?.addEventListener('click', (e) => {
  e.stopPropagation();
  $('#export-menu')?.setAttribute('hidden', '');
  const menu = $('#theme-menu');
  if (!menu) return;
  menu.hidden = !menu.hidden;
  $('#theme-toggle').setAttribute('aria-expanded', String(!menu.hidden));
});

$('#theme-menu')?.addEventListener('click', (e) => {
  const opt = e.target.closest('[data-theme-value]');
  if (!opt) return;
  const theme = opt.dataset.themeValue;
  try { localStorage.setItem('fold-theme', theme); } catch {}
  applyTheme(theme);
  $('#theme-menu').hidden = true;
  $('#theme-toggle')?.setAttribute('aria-expanded', 'false');
  const tObj = THEMES.find(t => t.id === theme);
  notify(`已切换至【${tObj?.name || theme}】主题`);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.theme-wrap')) {
    const menu = $('#theme-menu');
    if (menu) { menu.hidden = true; $('#theme-toggle')?.setAttribute('aria-expanded', 'false'); }
  }
});

applyTheme(getSavedTheme());

const getSavedColorMode = () => {
  try {
    const saved = localStorage.getItem('fold-color-mode');
    if (saved === 'cmyk' || saved === 'rgb') return saved;
  } catch {}
  return 'rgb';
};

function applyColorMode(mode) {
  colorMode = mode;
  document.documentElement.setAttribute('data-color-mode', mode);
  try { localStorage.setItem('fold-color-mode', mode); } catch {}
  const btn = $('#color-mode-toggle');
  if (btn) {
    btn.innerHTML = `${icon('cmyk')}<span id="color-mode-text" class="color-mode-text">${mode === 'cmyk' ? 'CMYK 软打样' : 'RGB 屏幕'}</span>`;
    btn.classList.toggle('active', mode === 'cmyk');
    btn.setAttribute('title', mode === 'cmyk' ? '当前：CMYK 印刷打样（点击切回 RGB 屏幕模式 P）' : '当前：RGB 屏幕色彩（点击开启 CMYK 工业印刷软打样 P）');
    btn.setAttribute('aria-label', mode === 'cmyk' ? '当前：CMYK 印刷打样（点击切回 RGB 屏幕模式 P）' : '当前：RGB 屏幕色彩（点击开启 CMYK 工业印刷软打样 P）');
  }
  const tag2d = $('#cmyk-tag-2d'), tag3d = $('#cmyk-tag-3d');
  if (tag2d) tag2d.hidden = mode !== 'cmyk';
  if (tag3d) tag3d.hidden = mode !== 'cmyk';
  editor?.setColorMode(mode);
  preview?.setColorMode(mode);
  renderSurface();
  renderInspector();
}

$('#color-mode-toggle')?.addEventListener('click', () => {
  const next = colorMode === 'cmyk' ? 'rgb' : 'cmyk';
  applyColorMode(next);
  notify(next === 'cmyk' ? '已开启 CMYK 工业印刷四色打样仿真 (按 P 切换)' : '已切换为 RGB 屏幕标准色彩 (按 P 切换)');
});

editorUI=mountEditorUI({editor,images,notify,select:selectLayer,getState:()=>({project,dieline,selected,ids:getSelectedIds(),panelId,side:activeSide}),change:({commit:save=true,render=true}={})=>{textureDirty=true;schedule();if(save)commit();else scheduleSave();if(render){renderSurface();renderLayers();renderInspector();}}});
packagingUI=mountPackagingUI(()=>project.layers.find(l=>l.id===selected));
colorUI=mountColorUI({getState:()=>({project,side:activeSide,ids:getSelectedIds(),panelId}),palettes:PALETTES,update:({commit:save=false,render=false}={})=>{textureDirty=true;schedule();if(save)commit();else scheduleSave();renderSurface();if(render){renderLayers();renderInspector();}}});
compactWorkspace();
initWorkspaceResizers();

async function init(){
  try{const draft=await loadDraft();if(draft){const next=validateProject(draft);await images.preload(next.layers);project=next;history=new History(project);panelId=BOX_TYPES[project.type].printPanel;$('#save-status').innerHTML=`${icon('check')}已在本机保存`;}}
  catch{notify('未能恢复本机草稿，已打开示例工程');}
  refresh({fit:true});await document.fonts.ready;textureDirty=true;schedule();
  applyColorMode(getSavedColorMode());
  window.__foldStudio={
    get project(){return clone(project);},
    get stats(){return preview?clone(preview.stats):null;},
    get selection(){return {selected,ids:getSelectedIds(),panelId,side:activeSide};},
    get editorEngine(){return 'Fabric.js 7.4.0';},
    edit:editorUI.run,
    get view(){return {...editor.view,side:activeSide};},
    get geometry(){return clone(dieline);},
    get isExpanded(){return isEditorExpanded;},
    get colorMode(){return colorMode;},
    setColorMode:applyColorMode,
    toggleExpand:toggleExpandEditor,
    addLayer,
    setTheme:applyTheme,
    cycleTheme,
    get theme(){return document.documentElement.getAttribute('data-theme');},
    get themes(){return clone(THEMES);}
  };
  document.documentElement.dataset.ready='true';
}
init();

