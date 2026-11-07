import './app.css';
import './editor-ui.css';
import {mountEditorUI} from './editor-ui.js';
import {mountPackagingUI} from './packaging-ui.js';
import './packaging-ui.css';
import {mountColorUI} from './color-ui.js';
import {initWorkspaceResizers} from './workspace-resizer.js';
import {initWorkspaceShell} from './workspace-shell.js';
import {TEMPLATE_PREVIEWS} from './template-previews.generated.js';
import {expandGroups,layerRect} from './editor-commands.js';
import { BOX_TYPES, makeDieline } from './geometry.js';
import {PAPER_BAG_PRESETS} from './paper-bag.js';
import {renderAddedDielineControls} from './dieline-controls.js';
import {triangleSettings,ropeGableSettings} from './reference-cartons.js';
import {slottedHandleSettings} from './slotted-handle-carton.js';
import {candyTwistSettings,triangleSliceSettings} from './rigid-reference-cartons.js';
import { newProject, History, uid, clone, validateProject, PALETTES, SIDES, sideOf, surfaceOf } from './project.js';
import { encodeLayers, decodeLayers, layersForPaste, CLIPBOARD_MIME } from './clipboard.js';
import {ImageCache} from './artwork.js';
import {SvgMainEditor} from './svg-main-editor.js';
import {svgSceneLayers} from './svg-scene.js';
import { Preview3D } from './preview3d.js';
import { download } from './storage.js';
import { createDocument, getActiveDocument, getDocument, getRevision, listDocuments, listRevisions, saveDocument, saveRevision, setActiveDocument } from './project-library-storage.js';
import { mountProjectLibrary } from './project-library-ui.js';
import {resizeTextDimension} from './text-transform.js';
import {CloseProtection} from './close-protection.js';
import {importSvgDocument} from './import-svg.js';
import {MAX_SVG_FILE_BYTES,MAX_PROJECT_FILE_BYTES} from './svg-capacity.js';
import { icon, escapeHtml as esc } from './icons.js';
import { PACKAGING_SYMBOLS } from './symbols.js';
import {formatCmyk} from './color.js';
import {colorReady} from './color-runtime.js';
import {colorStatus,configureColorManagement} from './color.js';
import {mountPrintUI} from './print-ui.js';
import {mountExportUI} from './export-ui.js';
import {repositoryLink} from './repository.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>document.querySelectorAll(selector);
const button=(id,glyph,title,extra='')=>`<button id="${id}" class="icon-button ${extra}" title="${title}" aria-label="${title}">${icon(glyph)}</button>`;
let project=newProject(),dieline=makeDieline(project.type,project.dimensions),selected=null,panelId='front',history=new History(project);
let preview,editor,saveTimer,renderRaf,textureDirty=false,saveSequence=0,playing=false,animationRaf=0,lastStatsAt=0;
let activeProjectId=null,lastSnapshotAt=0,unsaved=false,writeQueue=Promise.resolve();
const closeProtection=new CloseProtection();
const SNAPSHOT_INTERVAL=5*60*1000;
let geometryTimer,confirmAction=null,activeSide='outside',pasteInPlace=false,lastPasteText='',pasteCount=0;
let colorMode='rgb';
let selectionIds=[],editorUI,packagingUI,colorUI;
const getSelectedIds=()=>selected?(selectionIds.includes(selected)?selectionIds:[selected]).filter(id=>project.layers.some(l=>l.id===id&&sideOf(l)===activeSide)):[];
const dirtySides=new Set();

const THEMES = [
  { id: 'light', name: '经典浅色', desc: '明亮纸白 · 默认', icon: 'sun', swatch: ['#fbfbf8', '#4f6b3f'] },
  { id: 'warm', name: '暖沙原纸', desc: '温润原色 · 牛皮纸本', icon: 'leaf', swatch: ['#f6f0e5', '#7a5f3e'] },
  { id: 'gray', name: '工业中灰', desc: '3D 与包装审阅 · 中度灰', icon: 'palette', swatch: ['#2b2e34', '#5fbf8f'] },
  { id: 'slate', name: '工程蓝灰', desc: 'CAD 工程调 · 蓝灰工作台', icon: 'layers', swatch: ['#17212e', '#38bdf8'] },
  { id: 'dark', name: '极夜深色', desc: '沉浸高对比 · 纯净深黑', icon: 'moon', swatch: ['#15171b', '#4ade80'] }
];
const toolButton=(id,glyph,label,shortcut='',extra='')=>`<button id="${id}" class="tool-button ${extra}" title="${label}${shortcut?` · ${shortcut}`:''}" aria-label="${label}">${icon(glyph)}<span class="tool-label">${label}</span></button>`;

$('#app').innerHTML=`
<header class="app-bar">
  <a class="brand" href="#" aria-label="折间 Fold Studio" title="折间 Fold Studio v0.15.0"><span class="brand-mark">${icon('box')}</span><span class="brand-name">折间<small>Fold Studio</small></span></a>
  ${repositoryLink('header-repository')}
  <span class="app-bar-divider" aria-hidden="true"></span>
  <div class="project-heading">
    <input id="project-name" aria-label="工程名称" maxlength="80" spellcheck="false"/>
    <span class="file-tag">.fold</span>
    <span id="save-status" class="save-status" title="工程只保存在当前浏览器，不会上传" aria-live="polite">${icon('check')}本机自动保存</span>
  </div>
  <div class="header-actions">
    <div class="header-group file-actions">
      <button id="open-templates" class="button ghost" title="浏览结构库，切换包装盒型与容器">${icon('grid')}<span>结构库</span></button>
      <button id="import-project" class="button ghost" title="打开 .fold 工程或含工程信息的 SVG">${icon('upload')}<span>打开</span></button>
      <button id="save-project" class="button ghost" title="下载 .fold 工程备份 · Ctrl+S">${icon('save')}<span>保存</span></button>
    </div>
    <span class="app-bar-divider" aria-hidden="true"></span>
    <div class="header-group view-actions">
      <button id="color-mode-toggle" class="button ghost color-mode-button" title="切换 RGB 屏幕 / CMYK 印刷软打样 · P" aria-label="切换色彩模式">${icon('cmyk')}<span id="color-mode-text" class="color-mode-text">RGB 屏幕</span></button>
      <div class="theme-wrap"><button id="theme-toggle" class="button ghost" title="选择界面主题 · Shift+T" aria-label="选择界面主题" aria-haspopup="true" aria-expanded="false">${icon('palette')}<span class="theme-text">经典浅色</span>${icon('down')}</button><div id="theme-menu" class="dropdown theme-dropdown" hidden>${THEMES.map(t=>`<button data-theme-value="${t.id}" class="theme-option" type="button"><span class="theme-swatch" style="--swatch-a:${t.swatch[0]};--swatch-b:${t.swatch[1]}"></span><span class="theme-opt-info"><strong>${t.name}</strong><small>${t.desc}</small></span><span class="theme-check">${icon('check')}</span></button>`).join('')}</div></div>
      <button id="shortcut-help" class="icon-button" title="快捷键 · ?" aria-label="快捷键">${icon('keyboard')}</button>
      <button id="help" class="icon-button" title="使用指南" aria-label="使用指南">${icon('help')}</button>
    </div>
    <button id="export-toggle" class="button primary" aria-haspopup="dialog" aria-controls="export-dialog">${icon('download')}<span>导出</span></button>
  </div>
</header>
<main class="workspace" id="workspace-main">
  <aside class="left-sidebar" id="left-sidebar" aria-label="结构与图层">
    <div class="drawer-head"><strong>结构与图层</strong><button id="close-left-panel" class="icon-button" aria-label="关闭结构与图层">${icon('close')}</button></div>
    <div class="document-settings" id="document-settings" aria-label="包装结构与纸张设置">
    <section class="sidebar-section template-section collapsible-section" data-section="template">
      <div class="section-heading" title="点击折叠 / 展开"><h2>包装结构</h2><span class="section-summary">${Object.keys(BOX_TYPES).length} 款</span><span class="collapse-icon">${icon('down')}</span></div>
      <div class="collapsible-content">
        <button type="button" class="current-template-card" id="current-template-card" title="打开结构库，更换包装盒型与容器">
          <span class="template-art" id="current-template-art">${boxIllustration(project.type)}</span>
          <span class="current-template-info">
            <strong id="current-template-name">${esc(BOX_TYPES[project.type].name)}</strong>
            <span class="template-eng" id="current-template-eng">${esc(BOX_TYPES[project.type].english)}</span>
            <small id="current-template-desc">${esc(BOX_TYPES[project.type].description)}</small>
            <span class="change-hint">${icon('grid')}更换结构</span>
          </span>
        </button>
      </div>
    </section>
    <section class="sidebar-section dimension-section collapsible-section" data-section="dimension">
      <div class="section-heading" title="点击折叠 / 展开"><h2>成品尺寸</h2><span class="section-summary" id="dimension-summary"></span><span class="collapse-icon">${icon('down')}</span></div>
      <div class="collapsible-content">
        <div class="dimension-fields">${[['length','长','L'],['depth','宽','W'],['height','高','H']].map(([key,label,letter])=>`<label class="dimension-field"><span>${label}<em>${letter}</em></span><input type="number" id="dim-${key}" data-dimension="${key}" min="15" max="600" step="1" aria-label="成品${label}度"/></label>`).join('')}</div>
        <div id="extra-dimensions" class="extra-dimensions" hidden></div>
      </div>
    </section>
    <section class="sidebar-section paper-section collapsible-section" data-section="paper">
      <div class="section-heading" title="点击折叠 / 展开"><h2>纸张与配色</h2><span class="section-summary" id="paper-hex"></span><span class="collapse-icon">${icon('down')}</span></div>
      <div class="collapsible-content">
        <label class="select-label"><span class="sr-only">纸张材质</span><select id="material" aria-label="纸张材质"><option value="matte">哑光卡纸</option><option value="gloss">亮面卡纸</option><option value="kraft">牛皮纸</option></select>${icon('down')}</label>
        <div class="palette-row">${PALETTES.map((p,i)=>`<button class="palette ${i===0?'active':''}" data-palette="${i}" title="${p.name}" aria-label="${p.name}" style="--palette:${p.color};--palette-accent:${p.accent}"><i></i></button>`).join('')}</div>
        <div class="paper-color-control"><input id="paper-color" type="color" aria-label="自定义纸张颜色"/></div>
      </div>
    </section>
    </div>
    <div id="layer-resizer" class="panel-v-resizer" title="上下拖动调整图层面板高度" aria-label="上下拖动调整图层面板高度"></div>
    <section id="layer-section" class="layer-section">
      <div class="section-heading"><h2>${icon('layers')}图层</h2><span id="layer-count"></span></div>
      <div id="layer-list" class="layer-list"></div>
    </section>
  </aside>
  <div id="sidebar-resizer" class="workspace-resizer resizer-col" title="左右拖动调整边栏宽度" aria-label="左右拖动调整边栏宽度"></div>
  <section class="center-workspace">
    <div class="design-toolbar" role="toolbar" aria-label="内外面与设计工具">
      <button id="toggle-left-panel" class="icon-button drawer-toggle" title="结构与图层" aria-label="结构与图层" aria-controls="left-sidebar" aria-expanded="false">${icon('panel-left')}</button>
      <div class="surface-tabs" role="tablist" aria-label="编辑包装内外面"><button id="side-outside" data-side="outside" role="tab" aria-selected="true" class="active" title="编辑外面 · 1">外面</button><button id="side-inside" data-side="inside" role="tab" aria-selected="false" title="编辑内面 · 2">内面</button></div>
      <span class="toolbar-separator"></span>
      <div class="toolbar-group">${toolButton('tool-select','cursor','选择','V','active icon-only')}${toolButton('tool-pan','hand','平移','H / 按住空格','icon-only')}</div>
      <span class="toolbar-separator"></span>
      <div class="toolbar-group add-tools">${toolButton('add-text','text','文字','T')}${toolButton('add-image','image','图片 / SVG','I')}${toolButton('add-shape','shape','图形','R')}${toolButton('add-barcode','barcode','条形码')}${toolButton('add-qrcode','qrcode','二维码')}${toolButton('add-symbol','symbol','标志')}</div>
      <span class="toolbar-separator"></span>
      <div class="toolbar-group clipboard-tools">${button('copy-layer','copy','复制图层 Ctrl+C')}${button('cut-layer','cut','剪切图层 Ctrl+X')}${button('paste-layer','paste','粘贴到当前面板 Ctrl+V')}<span id="edit-menu-anchor" hidden></span></div>
      <div class="toolbar-right">${button('undo','undo','撤销 Ctrl+Z')}${button('redo','redo','重做 Ctrl+Shift+Z')}<span class="toolbar-separator"></span>${button('toggle-guides','grid','显示 / 隐藏压痕辅助线 G','active')}<button id="toggle-inspector" class="icon-button drawer-toggle" title="属性" aria-label="属性" aria-controls="right-sidebar" aria-expanded="false">${icon('panel-right')}</button></div>
      <span id="surface-hint" class="sr-only">编辑外面图案</span>
    </div>
    <div class="canvas-split" id="canvas-split">
      <section class="flat-pane" aria-label="平面画布">
        <div class="pane-heading">
          <div class="pane-title-group"><h1>平面刀版</h1><span id="sheet-size" class="pane-meta"></span><span id="cmyk-tag-2d" class="pane-color-tag" hidden>CMYK 软打样</span></div>
          <div class="pane-heading-right">
            <div class="line-legend" aria-label="线型图例"><span><i></i>裁切</span><span><i class="dashed"></i>压痕</span></div>
            <div class="zoom-control">${button('zoom-out','minus','缩小')}<button id="zoom-label" title="适应画布 · F">100%</button>${button('zoom-in','plus','放大')}${button('fit-2d','fit','适应画布 F')}</div>
            <button id="toggle-expand-editor" class="icon-button" title="展开平面编辑 (M)" aria-label="展开平面编辑 (M)">${icon('expand')}</button>
          </div>
        </div>
        <div id="editor-host" class="editor-host"></div>
      </section>
      <div id="canvas-split-resizer" class="workspace-resizer resizer-col" title="左右拖动调整平面 / 三维比例" aria-label="左右拖动调整平面 / 三维比例"></div>
      <section class="preview-pane" aria-label="折叠预览">
        <div class="pane-heading">
          <div class="pane-title-group"><h2>折叠预览</h2><span class="live-tag" title="所有改动实时同步到三维"><i></i>实时</span><span id="cmyk-tag-3d" class="pane-color-tag" hidden>CMYK 软打样</span></div>
          <div class="pane-heading-right">
            <div class="preview-views segmented" role="group" aria-label="预览视角"><button data-view="iso" class="active">透视</button><button data-view="front">正面</button><button data-view="side">侧面</button><button data-view="top">顶部</button></div>
            <label class="preview-quality-wrap" title="预览清晰度与能耗">${icon('leaf')}<select id="quality" aria-label="预览清晰度"><option value="economy">节能</option><option value="balanced" selected>均衡</option><option value="crisp">清晰</option></select></label>
            ${button('fit-3d','fit','适应模型 Shift+F')}
          </div>
        </div>
        <div class="preview-stage">
          <div class="stage-grid"></div>
          <div id="preview-host" class="preview-host"></div>
          <div id="stage-actions" class="stage-actions"></div>
          <div class="stage-status"><span class="workspace-status-badge"><i></i><span id="workspace-status-text">所有改动实时可见</span></span><span id="performance-status" class="perf-status-badge">按需渲染</span></div>
          <span class="preview-instruction">拖动旋转 · 滚轮缩放</span>
          <div id="preview-error" class="preview-error" hidden></div>
        </div>
        <div class="fold-controls">
          ${button('play-fold','play','播放折叠动画')}
          <input id="fold-slider" type="range" min="0" max="100" value="100" aria-label="折叠进度"/>
          <strong id="fold-value" class="fold-value">100<span>%</span></strong>
          <div class="fold-presets" role="group" aria-label="折叠姿态预设">
            <button id="unfold" class="fold-preset-btn" data-fold-preset="0" title="0% 完全展开为平面刀版">展开</button>
            <button class="fold-preset-btn" data-fold-preset="0.45" title="45% 护耳与围框折起">45%</button>
            <button class="fold-preset-btn" data-fold-preset="0.78" title="78% 敞口成型态">78%</button>
            <button id="fold" class="fold-preset-btn active" data-fold-preset="1.0" title="100% 折叠成型">合拢</button>
          </div>
        </div>
      </section>
    </div>
  </section>
  <div id="inspector-resizer" class="workspace-resizer resizer-col" title="左右拖动调整属性面板宽度" aria-label="左右拖动调整属性面板宽度"></div>
  <aside class="right-sidebar" id="right-sidebar" aria-label="属性"><div class="sidebar-title"><h2>属性</h2><span id="selected-type" class="tiny-badge">面板</span><button id="close-inspector" class="icon-button drawer-close" aria-label="关闭属性">${icon('close')}</button></div><div class="panel-picker"><label for="panel-selector">面板</label><label class="select-label"><select id="panel-selector" aria-label="选择面板"></select>${icon('down')}</label></div><div id="inspector"></div><div class="inspector-tip">${icon('help')}<p>点击平面或三维模型选择面板，插舌和粘耳也可单独选择。</p></div></aside>
  <div id="drawer-scrim" class="drawer-scrim" hidden></div>
</main>
<input id="image-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" hidden/><input id="project-input" type="file" accept=".fold,.foldproj,.json,.svg" hidden/>
<div id="toast" class="toast" role="status" hidden></div>
<dialog id="help-dialog" aria-labelledby="help-title"><button id="close-help" class="dialog-close" aria-label="关闭">${icon('close')}</button><span class="dialog-kicker">FOLD STUDIO · <span class="version-tag">v0.15.0</span></span><h2 id="help-title">让设计，折起来。</h2><p>在平面刀版上排版，三维模型实时折叠成型。每一次编辑都会同步到折叠预览。</p><ol class="help-steps"><li><span>1</span><div><strong>选择结构</strong><small>左侧“更换结构”打开 ${Object.keys(BOX_TYPES).length} 款盒型与容器，再调整尺寸和纸张。</small></div></li><li><span>2</span><div><strong>平面排版</strong><small>工具栏添加文字、图片 / SVG、图形、条码与标志；外面、内面分别设计。</small></div></li><li><span>3</span><div><strong>折叠检查与导出</strong><small>拖动折叠进度检查成型效果，导出 GLB、PNG 或带刀线的 SVG。</small></div></li></ol><div class="help-grid"><div><kbd>V</kbd><span>选择工具</span></div><div><kbd>H / 空格</kbd><span>平移画布</span></div><div><kbd>Ctrl Z</kbd><span>撤销编辑</span></div><div><kbd>?</kbd><span>全部快捷键</span></div></div><p class="help-note local-note">${icon('check')}<span><span class="local-badge">文件留在本地</span>：工程自动保存在当前浏览器，不需要账号，也不会上传。重要设计请用“保存”下载 .fold 备份；SVG 导出包含工程信息，可重新打开。模型与刀版用于视觉预览及结构草图。</span></p><div class="dialog-actions"><button id="dismiss-help" class="button primary">开始设计 ${icon('chevron')}</button></div></dialog>
<dialog id="shortcuts-dialog"><button id="close-shortcuts" class="dialog-close" aria-label="关闭快捷键">${icon('close')}</button><span class="dialog-kicker">KEYBOARD SHORTCUTS</span><h2>让操作，更顺手。</h2><div class="shortcut-list">${[['Ctrl / ⌘ C','复制选中图层'],['Ctrl / ⌘ X','剪切选中图层'],['Ctrl / ⌘ V','粘贴到当前面板与内外面'],['Ctrl / ⌘ Shift V','粘贴并保留原位置'],['Ctrl / ⌘ D','复制一份图层'],['Ctrl / ⌘ Z','撤销'],['Ctrl / ⌘ Shift Z / Y','重做'],['Ctrl / ⌘ S','下载工程'],['1 / 2','编辑外面 / 内面'],['V / H / 空格','选择 / 平移 / 临时平移'],['T / I / R','添加文字 / 图片 / 矩形'],['M','展开 / 恢复平面画布'],['P','切换 RGB 屏幕 / CMYK 印刷打样'],['Shift T','切换界面主题（中灰/深黑/蓝调/浅色/纸本）'],['F / Shift F','适应平面 / 适应三维'],['G','切换辅助线'],['方向键 / Shift 方向键','移动 1 mm / 5 mm'],['Delete / Esc','删除 / 取消选择'],['?','打开本快捷键表']].map(([key,label])=>`<div><span>${label}</span><kbd>${key}</kbd></div>`).join('')}</div><p class="help-note">复制图层后，可在另一个折间标签页、离线页面或工程中粘贴，图片会一起携带。也可粘贴剪贴板中的普通文字或图片。输入框里的复制粘贴仍按浏览器惯例工作；若粘贴按钮受浏览器限制，请直接按 Ctrl / ⌘ V。</p></dialog>
<dialog id="confirm-dialog"><h2>切换盒型？</h2><p>将建立一份新盒型示例，替换当前设计。你可以先保存工程；切换后也可以撤销。</p><div class="dialog-actions"><button id="cancel-confirm" class="button subtle">保留当前设计</button><button id="accept-confirm" class="button primary">切换盒型</button></div></dialog>
<dialog id="templates-dialog" class="templates-dialog">
  <button id="close-templates" class="dialog-close" aria-label="关闭包装结构库">${icon('close')}</button>
  <div class="dialog-header">
    <span class="dialog-kicker">PACKAGING STRUCTURE LIBRARY</span>
    <h2>包装结构与盒型库</h2>
    <p>选择工业标准纸盒或瓶罐容器结构，一键生成刀版与拟真三维模型</p>
  </div>
  <p class="template-contribute">没找到想要的盒型？${repositoryLink('template-contribute-link','在 GitHub 上提交 PR 或者贡献！')}</p>
  <div class="template-toolbar">
  <div class="template-filter-tabs" role="tablist" aria-label="包装结构分类">
    <button class="filter-tab active" data-filter="all">全部 <span>${Object.keys(BOX_TYPES).length}</span></button>
    <button class="filter-tab" data-filter="carton">卡纸彩盒 <span>${Object.values(BOX_TYPES).filter(t=>t.category==='carton').length}</span></button>
    <button class="filter-tab" data-filter="gift">精品礼盒 <span>${Object.values(BOX_TYPES).filter(t=>t.category==='gift').length}</span></button>
    <button class="filter-tab" data-filter="shipping">电商物流 <span>${Object.values(BOX_TYPES).filter(t=>t.category==='shipping').length}</span></button>
    <button class="filter-tab" data-filter="container">瓶罐容器 <span>${Object.values(BOX_TYPES).filter(t=>t.category==='container').length}</span></button>
  </div>
  <label class="template-search">${icon('search')}<input id="template-search" type="search" placeholder="搜索名称、英文或特征，如“提手”" aria-label="搜索包装结构" autocomplete="off"/></label>
  </div>
  <p id="template-empty" class="template-empty" role="status" hidden>没有匹配的结构，换个关键词或分类试试。</p>
  <div id="box-templates" class="box-templates dialog-template-grid">
    ${Object.entries(BOX_TYPES).map(([id,t])=>`<button class="template-card ${id===project.type?'active':''}" data-template="${id}" data-category="${t.category}" data-search="${esc([t.name,t.english,t.description,...(t.aliases??[]),categoryLabel(t.category)].join(' ').toLowerCase())}" aria-pressed="${id===project.type}"><span class="template-card-badge">${categoryLabel(t.category)}</span><span class="template-art ${id}">${boxIllustration(id)}</span><div class="template-card-info"><strong>${t.name}</strong><span class="template-eng">${t.english}</span><small>${t.description}</small><span class="template-dim">${t.defaults.length} × ${t.defaults.depth} × ${t.defaults.height} mm</span></div><span class="template-check">${icon('check')}</span></button>`).join('')}
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


const images=new ImageCache(src=>{for(const side of Object.keys(project.svgArtwork??{}))dirtySides.add(side);for(const layer of project.layers)if((layer.type==='image'&&layer.src===src)||layer.type==='svg')dirtySides.add(sideOf(layer));schedule();});
editor=new SvgMainEditor($('#editor-host'),images,{
  select:selectLayer,begin:()=>{},change:()=>{textureDirty=true;schedule();},commit:()=>{commit();renderInspector();},context:e=>editorUI?.context(e),
  notify,command:command=>command==='save'?$('#save-project').click():restore(command),
  draft:()=>{scheduleSave();renderHistory();},
  normalize:()=>{history.entries[history.index]=clone(project);scheduleSave();},
  zoom:scale=>$('#zoom-label').textContent=`${Math.round(scale*100)}%`,
  editText:id=>{selectLayer(id,project.layers.find(l=>l.id===id).panel);$('#prop-text')?.focus();$('#prop-text')?.select();},
});
try{preview=new Preview3D($('#preview-host'),images,(id,side)=>{stopAnimation();activeSide=side;selectLayer(null,id);},stats=>{
  if(performance.now()-lastStatsAt<400)return;lastStatsAt=performance.now();
  $('#performance-status').textContent=`${stats.drawCalls??0} 次绘制 · ${stats.atlas[0]} px 贴图`;
});}catch(error){$('#preview-error').hidden=false;$('#preview-error').textContent=`三维预览无法启动：${error.message}。请使用支持 WebGL 2 的浏览器，并启用硬件加速。`;}

function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').hidden=true,3300);}
function schedule(){if(textureDirty){dirtySides.add(activeSide);textureDirty=false;}if(renderRaf)return;renderRaf=requestAnimationFrame(()=>{renderRaf=0;editor.update(project,dieline,selected,panelId,activeSide,getSelectedIds());if(dirtySides.size){preview?.paint(project,[...dirtySides]);dirtySides.clear();}updateLayerProperties();});}
function markSaving(){unsaved=true;closeProtection.touch(activeProjectId);$('#save-status').innerHTML='<span class="pending-dot"></span>保存中…';}
function commit(){history.push(project);renderHistory();renderLayers();scheduleSave();}
function scheduleSave(){markSaving();clearTimeout(saveTimer);saveTimer=setTimeout(persist,550);}
function persist(){
  if(!activeProjectId)return Promise.resolve(false);
  const id=activeProjectId,copy=clone(project),sequence=++saveSequence;
  const task=writeQueue.then(async()=>{
    try{
      await saveDocument(id,copy);
      if(sequence===saveSequence&&id===activeProjectId){unsaved=false;$('#save-status').innerHTML=`${icon('check')}已在本机保存`;}
      if(id===activeProjectId&&Date.now()-lastSnapshotAt>=SNAPSHOT_INTERVAL){
        try{const revision=await saveRevision(id,copy);lastSnapshotAt=revision.createdAt;}
        catch{notify('工程已保存，但历史版本写入失败；请下载 .fold 备份');}
      }
      return true;
    }catch{if(sequence===saveSequence&&id===activeProjectId)$('#save-status').textContent='本机保存失败，请下载工程备份';return false;}
  });
  writeQueue=task.then(()=>{});
  return task;
}
async function flushSave(){
  editor?.up();
  closeProtection.sync(activeProjectId,project);
  clearTimeout(saveTimer);
  if(unsaved)return persist();
  await writeQueue;
  return true;
}
async function snapshotCurrent(label='手动版本'){
  if(!await flushSave())throw new Error('当前工程尚未保存，请先下载 .fold 备份');
  const revision=await saveRevision(activeProjectId,clone(project),label);
  lastSnapshotAt=revision.createdAt;
  notify('历史版本已保存在当前浏览器');
}
function showDocument(id,next){
  activeProjectId=id;project=next;history=new History(project);selected=null;selectionIds=[];activeSide='outside';
  closeProtection.open(id,next);
  panelId=BOX_TYPES[project.type].printPanel;lastSnapshotAt=0;unsaved=false;
  refresh({fit:true});$('#save-status').innerHTML=`${icon('check')}已在本机保存`;
}
async function openLibraryDocument(id){
  if(id===activeProjectId)return;
  const stored=await getDocument(id);
  if(!stored)throw new Error('此工程已不存在');
  const next=validateProject(stored);await images.preload([...svgSceneLayers(next,makeDieline(next.type,next.dimensions)),...next.layers]);
  if(!await flushSave())throw new Error('当前工程尚未保存，请先下载 .fold 备份');
  await setActiveDocument(id);showDocument(id,next);
  const revisions=await listRevisions(id);lastSnapshotAt=revisions[0]?.createdAt??0;
}
async function newLibraryDocument(source=null,{fromFile=false}={}){
  if(!await flushSave())throw new Error('当前工程尚未保存，请先下载 .fold 备份');
  const next=source??{...newProject(project.type),name:'未命名工程',layers:[]};
  const id=await createDocument(next);showDocument(id,next);
  if(!fromFile)closeProtection.newDocument(id);
  try{const revision=await saveRevision(id,clone(next),'初始版本');lastSnapshotAt=revision.createdAt;}
  catch{notify('新工程已建立，历史版本未能保存；请下载 .fold 备份');}
}
async function restoreLibraryRevision(id,revisionId){
  const revision=await getRevision(revisionId);
  if(!revision||revision.projectId!==id)throw new Error('历史版本不存在');
  const next=validateProject(revision.project);await images.preload([...svgSceneLayers(next,makeDieline(next.type,next.dimensions)),...next.layers]);
  if(!await flushSave())throw new Error('当前工程尚未保存，请先下载 .fold 备份');
  const previous=await getDocument(id);
  if(!previous)throw new Error('原工程已不存在');
  await saveRevision(id,previous,'恢复前版本');
  await saveDocument(id,next);await setActiveDocument(id);showDocument(id,next);
  try{const saved=await saveRevision(id,clone(next),'恢复后的版本');lastSnapshotAt=saved.createdAt;}
  catch{notify('工程已恢复，但新历史版本未能保存；请下载 .fold 备份');return;}
  notify('已恢复历史版本，恢复前的内容也已保留');
}
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
  const canCopy=editor.native?editor.hasSelection:!!selected;
  $('#copy-layer').disabled=!canCopy;$('#cut-layer').disabled=!canCopy;
  $('#panel-selector').innerHTML=dieline.panels.map(p=>`<option value="${p.id}" ${p.id===panelId?'selected':''}>${esc(p.label)}</option>`).join('');
  if(preview?.isolatedPanel)preview.inspectPanel(panelId,activeSide,true);
  colorUI?.sync();
}
function setSide(side){if(!Object.hasOwn(SIDES,side)||side===activeSide)return;editor.up();activeSide=side;selected=null;editor.update(project,dieline,null,panelId,activeSide,[]);renderSurface();renderLayers();renderInspector();schedule();}
function refresh({fit=false,build=true}={}){
  if(colorStatus().ready){try{configureColorManagement(project.printSettings);}catch(error){applyColorMode('rgb',{save:false});notify(`ICC 配置未应用：${error.message}`);}}
  dieline=makeDieline(project.type,project.dimensions);
  if(!dieline.panels.some(p=>p.id===panelId))panelId=BOX_TYPES[project.type].printPanel;
  if(!project.layers.some(l=>l.id===selected))selected=null;
  if(selected)activeSide=sideOf(project.layers.find(l=>l.id===selected));
  editor.update(project,dieline,selected,panelId,activeSide,getSelectedIds());
  if(build){preview?.setQuality(project.quality);preview?.build(project,dieline);}
  if(fit)editor.fit();
  $('#project-name').value=project.name;
  for(const key of ['length','depth','height'])$(`#dim-${key}`).value=project.dimensions[key];
  $('#dimension-summary').textContent=['length','depth','height'].map(key=>project.dimensions[key]).join(' × ');
  const customDimensions=['triangular-prism-carton','rope-gable-carton','slotted-handle-carton','candy-twist-carton','triangle-slice-box'].includes(project.type);
  const dimensionNames=project.type==='triangular-prism-carton'?[['柱长','L'],['底边','B'],['斜边','S']]:['rope-gable-carton','slotted-handle-carton'].includes(project.type)?[['长','L'],['侧宽','W'],['身高','H']]:project.type==='candy-twist-carton'?[['盒身长','L'],['截宽','W'],['截高','H']]:project.type==='triangle-slice-box'?[['底边','L'],['三角高','D'],['盒厚','H']]:[['长','L'],['宽','W'],['高','H']];
  ['length','depth','height'].forEach((key,i)=>{const input=$(`#dim-${key}`),[label,letter]=dimensionNames[i];input.closest('label').querySelector('span').innerHTML=`${label}<em>${letter}</em>`;input.setAttribute('aria-label',customDimensions?label:`成品${label}度`);input.min=key==='height'&&project.type==='triangular-prism-carton'?Math.max(15,Math.floor(project.dimensions.depth/2)+1):15;});
  $('.dimension-section h2').textContent=customDimensions?'结构尺寸':'成品尺寸';
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
  if(colorMode!==(project.documentColorMode??'rgb'))applyColorMode(project.documentColorMode??'rgb',{save:false});
}
function renderExtraDimensions(){
  const container=$('#extra-dimensions');
  if(!container)return;
  if(renderAddedDielineControls(container,project,dieline))return;
  if(['triangular-prism-carton','rope-gable-carton','slotted-handle-carton','candy-twist-carton','triangle-slice-box'].includes(project.type)){
    container.hidden=false;
    const row=(key,label,value,min,max,unit='mm')=>`<div class="extra-dim-row"><div class="extra-dim-label"><span>${label}</span><strong id="val-${key}" data-unit="${unit}">${Number(value.toFixed(1))} ${unit}</strong></div><div class="extra-dim-control"><input type="range" class="extra-dim-slider" data-extra-dim="${key}" min="${Math.ceil(min)}" max="${Math.floor(max)}" step="1" value="${value}" aria-label="${label}"/><input type="number" class="extra-dim-num" data-extra-dim="${key}" min="${Math.ceil(min)}" max="${Math.floor(max)}" step="1" value="${value}" aria-label="${label}数值"/></div></div>`;
    let content;
    if(project.type==='triangular-prism-carton'){
      const b=triangleSettings(project.dimensions);
      content=`<div class="extra-dim-heading"><span>三角柱结构</span></div><p class="field-note reference-note">尺寸为柱长、底边、等腰斜边。实际截面高 ${b.altitude.toFixed(1)} mm，展开 ${dieline.width.toFixed(1)} × ${dieline.height.toFixed(1)} mm。</p><label class="select-label">摆放姿态<select id="reference-orientation" data-reference-option="orientation"><option value="lying" ${b.orientation==='lying'?'selected':''}>平放展示</option><option value="standing" ${b.orientation==='standing'?'selected':''}>竖立展示</option></select></label>${row('glueWidth','接缝粘舌',b.G,2,Math.min(40,b.S*.4))}`;
    }else if(project.type==='rope-gable-carton'){
      const b=ropeGableSettings(project.dimensions);
      content=`<div class="extra-dim-heading"><span>绳提手折顶结构</span></div><p class="field-note reference-note">身高不含折顶和提绳。折顶增加 ${b.rise.toFixed(1)} mm，盒体总高 ${(b.H+b.rise).toFixed(1)} mm；窄顶舌保留穿槽。</p>${row('roofDepth','斜顶展开宽',b.R,b.run+2,Math.max(b.run+3,Math.min(240,b.H)))}${row('topTab','折返顶盖宽',b.F,4,b.D*.8)}${row('bottomFlap','锁底展开深',b.B,b.D/2+2,b.D*.95)}${row('glueWidth','侧粘口',b.G,3,Math.min(65,b.L*.3,b.D*.6))}${row('handleRise','提绳弧高',b.handleRise,10,250)}${row('handleSpan','绳孔间距',b.handleSpan,8,b.L*.8)}`;
    }else if(project.type==='slotted-handle-carton'){
      const b=slottedHandleSettings(project.dimensions);
      content=`<div class="extra-dim-heading"><span>插锁提手结构</span></div><p class="field-note reference-note">身高不含提手和侧翼。顶盖各覆盖一半侧宽，成型总高约 ${b.totalHeight.toFixed(1)} mm；展开 ${dieline.width.toFixed(1)} × ${dieline.height.toFixed(1)} mm。</p>${row('handleHeight','提手片高度',b.T,Math.min(8,b.D*.2),Math.max(8,Math.min(150,b.L*.45,b.D*.9)))}${row('handleWidth','提手孔宽',b.handleWidth,Math.min(8,b.L*.3),b.L*.72)}${row('handleHoleHeight','提手孔高',b.holeHeight,Math.min(3,b.T*.2),b.T*.54)}${row('sideFlapHeight','穿槽侧翼高度',b.wing,Math.min(10,b.D*.3),Math.min(200,b.D*.95))}${row('sideFlapAngle','侧翼内折角度',b.angle,15,65,'°')}${row('bottomFlap','扣底展开深',b.B,b.D*.52,b.D*.98)}${row('glueWidth','侧粘口',b.G,Math.min(3,b.L*.1),Math.min(45,b.L*.2,b.D*.4))}`;
    }else if(project.type==='candy-twist-carton'){
      const b=candyTwistSettings(project.dimensions);
      content=`<div class="extra-dim-heading"><span>糖果扭结结构</span></div><p class="field-note reference-note">盒身长不含两端外伸燕尾；闭合后总长约 ${(b.L+2*b.T).toFixed(1)} mm。扭结锁合为视觉近似，不是生产刀模。</p>${row('neckWidth','收脊颈宽',b.N,4,b.W-4)}${row('endRise','端部收脊长',b.E,4,1.5*Math.min(b.W,b.H))}${row('tailLength','燕尾外伸',b.T,6,.6*b.L)}${row('tailFlare','燕尾外扩',b.F,0,Math.max(0,(b.W-b.N)/2-1))}${row('glueWidth','侧粘口',b.G,3,Math.min(24,.3*b.W))}`;
    }else{
      const b=triangleSliceSettings(project.dimensions);
      content=`<div class="extra-dim-heading"><span>三角切片盒结构</span></div><p class="field-note reference-note">三角高是底边到顶点的垂直距离，不是斜边。闭合厚度约 ${b.H.toFixed(1)} mm，两个盖插舌按摩擦插入近似。</p>${row('lockTab','盖插舌长',b.K,4,b.H-2)}`;
    }
    const markup=`<div data-reference-controls="${project.type}">${content}</div>`;
    if(!container.querySelector(`[data-reference-controls="${project.type}"]`))container.innerHTML=markup;
    else{
      const template=document.createElement('template');template.innerHTML=markup;
      for(const input of container.querySelectorAll('[data-extra-dim]')){const next=template.content.querySelector(`input[type="${input.type}"][data-extra-dim="${input.dataset.extraDim}"]`);input.min=next.min;input.max=next.max;if(input!==document.activeElement)input.value=next.value;}
      for(const label of container.querySelectorAll('[id^="val-"]'))label.textContent=template.content.querySelector('#'+label.id).textContent;
      for(const select of container.querySelectorAll('[data-reference-option]'))select.value=template.content.querySelector('#'+select.id).value;
      container.querySelector('.reference-note').textContent=template.content.querySelector('.reference-note').textContent;
    }
  }else if(project.type==='paper-shopping-bag'||project.type==='paper-bag-basic'){
    container.hidden=false;
    const b=dieline.paperBag;
    const row=(key,label,value,min,max)=>`<div class="extra-dim-row"><div class="extra-dim-label"><span>${label}</span><strong id="val-${key}">${value} mm</strong></div><div class="extra-dim-control"><input type="range" class="extra-dim-slider" data-extra-dim="${key}" min="${min}" max="${max}" step="any" value="${value}" aria-label="${label}"/><input type="number" class="extra-dim-num" data-extra-dim="${key}" min="${min}" max="${max}" step="any" value="${value}" aria-label="${label}数值"/></div></div>`;
    const markup=`<div class="extra-dim-heading"><span>纸袋尺寸预设</span><span class="extra-dim-sub">一个模型 · 三种比例</span></div><div class="bag-size-presets">${Object.entries(PAPER_BAG_PRESETS).map(([id,p])=>`<button type="button" data-bag-preset="${id}" aria-pressed="${['length','depth','height'].every(k=>p[k]===project.dimensions[k])}">${p.name}<small>${p.length}×${p.depth}<br>×${p.height} mm</small></button>`).join('')}</div><p class="field-note">尺寸为袋身长 × 侧宽 × 高，不含提手。可继续输入任意尺寸。</p><label class="select-label">提手材质<select id="bag-handle-style" data-bag-option="handleStyle"><option value="none" ${b.handleStyle==='none'?'selected':''}>不添加提手</option><option value="rope" ${b.handleStyle==='rope'?'selected':''}>圆绳 · 穿孔</option><option value="ribbon" ${b.handleStyle==='ribbon'?'selected':''}>缎带 · 粘贴</option></select></label><label class="select-label">提手姿态<select id="bag-handle-pose" data-bag-option="handlePose"><option value="raised" ${b.handlePose==='raised'?'selected':''}>提起</option><option value="dropped" ${b.handlePose==='dropped'?'selected':''}>垂落</option></select></label>${row('topFold','袋口内折',b.topFold,b.handleStyle==='rope'?2:0,Math.min(100,b.H*.45))}${row('bottomFold','底部折边',b.bottomFold,Math.ceil(b.D/2+Math.min(2,b.D*.1)),Math.floor(b.D*.95))}${row('glueWidth','侧粘口宽度',b.glueWidth,2,Math.min(50,b.L*.3,b.D*.6))}${row('handleRise','提手弧高',b.handleRise,5,Math.min(250,b.H*.8))}${row('handleSpan','提手间距',b.handleSpan,4,b.L*.85)}`;
      if(!container.querySelector('[data-bag-preset]'))container.innerHTML=markup;
    else{
      // Refresh constraints without replacing an input the user is editing.
      const template=document.createElement('template');template.innerHTML=markup;
      for(const input of container.querySelectorAll('[data-extra-dim]')){
        const next=template.content.querySelector(`input[type="${input.type}"][data-extra-dim="${input.dataset.extraDim}"]`);
        input.min=next.min;input.max=next.max;
        if(input!==document.activeElement)input.value=next.value;
      }
      for(const button of container.querySelectorAll('[data-bag-preset]'))button.setAttribute('aria-pressed',template.content.querySelector(`[data-bag-preset="${button.dataset.bagPreset}"]`).getAttribute('aria-pressed'));
      for(const label of container.querySelectorAll('[id^="val-"]'))label.textContent=template.content.querySelector('#'+label.id).textContent;
      for(const select of container.querySelectorAll('[data-bag-option]'))select.value=template.content.querySelector('#'+select.id).value;
    }
    $('#bag-handle-pose').closest('label').hidden=b.handleStyle==='none';
    for(const key of ['handleRise','handleSpan'])container.querySelector(`[data-extra-dim="${key}"]`).closest('.extra-dim-row').hidden=b.handleStyle==='none';
  }else if(project.type==='arch-handle-tote'){
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
  if(editor?.native){editor.renderLayers();return;}
  const layers=project.layers.filter(l=>sideOf(l)===activeSide);
  $('#layer-count').textContent=`${SIDES[activeSide]} · ${layers.length}`;
  const typeGlyph=type=>type==='text'?'text':type==='image'?'image':type==='barcode'?'barcode':type==='qrcode'?'qrcode':type==='symbol'?'symbol':'shape';
  $('#layer-list').innerHTML=[...layers].reverse().map(l=>`<div class="layer-row ${l.id===selected?'selected':''} ${!l.visible?'is-hidden':''}" data-layer="${l.id}"><button class="layer-main" data-select="${l.id}"><span class="layer-type">${icon(typeGlyph(l.type))}</span><span><strong>${esc(l.name)}</strong><small>${esc(dieline.panels.find(p=>p.id===l.panel)?.label??'')} · ${SIDES[activeSide]}</small></span></button><button class="layer-eye" data-visibility="${l.id}" title="${l.visible?'隐藏':'显示'}图层" aria-label="${l.visible?'隐藏':'显示'}${esc(l.name)}">${icon(l.visible?'eye':'hidden')}</button></div>`).join('')||`<div class="empty-layers">${icon('layers')}<strong>${SIDES[activeSide]}还没有图层</strong><span>添加图文，或按 Ctrl+V 粘贴</span></div>`;
  $('#copy-layer').disabled=!selected;$('#cut-layer').disabled=!selected;
  editorUI?.decorateLayers();
}

function numberField(key,label,value,{min=-10000,max=10000,step=1,unit=''}={}){return `<label class="property-field"><span>${label}</span><div><input id="prop-${key}" data-property="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" aria-label="${label}"/>${unit?`<em>${unit}</em>`:''}</div></label>`;}
function renderInspector(){
  if(editor?.native){editor.renderInspector();return;}
  const layer=project.layers.find(l=>l.id===selected),panel=dieline.panels.find(p=>p.id===panelId);
  const surface=surfaceOf(project,activeSide);
  const typeMap={text:'文字',image:'图片',shape:'图形',barcode:'条形码',qrcode:'二维码',symbol:'包装标志',svg:'SVG 图形'};
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
  editor.up();
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
function setTool(tool){editor.tool=tool;}
document.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>setSide(b.dataset.side));
$('#shortcut-help').onclick=()=>$('#shortcuts-dialog').showModal();$('#close-shortcuts').onclick=()=>$('#shortcuts-dialog').close();
const inspectSide=document.createElement('button');inspectSide.id='inspect-surface';inspectSide.className='inspect-surface';inspectSide.textContent='展开查看当前面';
inspectSide.onclick=()=>{stopAnimation();setFold(0,true);preview?.showAll();preview?.inspectPanel(panelId,activeSide);};
$('#stage-actions').appendChild(inspectSide);
const inspectPanel=document.createElement('button');inspectPanel.id='inspect-panel';inspectPanel.className='inspect-panel';inspectPanel.textContent='单面检查';
inspectPanel.onclick=()=>{if(preview?.isolatedPanel)preview.fit();else preview?.inspectPanel(panelId,activeSide,true);};
$('#stage-actions').appendChild(inspectPanel);
if(preview)preview.onIsolation=active=>{inspectPanel.textContent=active?'返回整盒':'单面检查';};
$('#panel-selector').onchange=e=>selectLayer(null,e.target.value);

$('#current-template-card').onclick=()=>$('#open-templates').click();
$('#open-templates').onclick=()=>{
  const dialog=$('#templates-dialog');
  $('#template-search').value='';setTemplateFilter('all');dialog.showModal();
  $('#box-templates .template-card.active')?.scrollIntoView({block:'nearest'});
};
$('#close-templates').onclick=()=>$('#templates-dialog').close();
let templateBackdropDown=false;
function outsideDialog(e){const r=$('#templates-dialog').getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;}
$('#templates-dialog').addEventListener('pointerdown',e=>{templateBackdropDown=e.target===$('#templates-dialog')&&outsideDialog(e);});
$('#templates-dialog').addEventListener('click',e=>{if(templateBackdropDown&&e.target===$('#templates-dialog')&&outsideDialog(e))$('#templates-dialog').close();templateBackdropDown=false;});
let templateFilter='all';
function setTemplateFilter(filter=templateFilter){
  templateFilter=filter;
  const query=$('#template-search').value.trim().toLowerCase();let shown=0;
  document.querySelectorAll('.filter-tab').forEach(tab=>{
    const active=tab.dataset.filter===filter;
    tab.classList.toggle('active',active);tab.setAttribute('aria-selected',active);tab.setAttribute('role','tab');tab.tabIndex=active?0:-1;
  });
  document.querySelectorAll('#box-templates .template-card').forEach(card=>{card.hidden=(filter!=='all'&&card.dataset.category!==filter)||(!!query&&!card.dataset.search.includes(query));if(!card.hidden)shown++;});
  $('#template-empty').hidden=shown>0;
  $('#box-templates').scrollTop=0;
}
$('#template-search').addEventListener('input',()=>setTemplateFilter());
$('#template-search').addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();$('#box-templates .template-card:not([hidden])')?.click();});
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
  confirmAction=async()=>{
    try{await snapshotCurrent('切换盒型前');}
    catch(error){notify(`无法安全切换盒型：${error.message}`);return;}
    stopAnimation();clearTimeout(geometryTimer);editor.up();project=newProject(type);panelId=BOX_TYPES[type].printPanel;activeSide='outside';selected=null;dirtySides.clear();refresh({fit:true});commit();notify(`已切换为${BOX_TYPES[type].name}`);$('#templates-dialog').close();
  };
  $('#confirm-dialog').showModal();
});
$('#cancel-confirm').onclick=()=>$('#confirm-dialog').close();
$('#confirm-dialog').addEventListener('close',()=>{confirmAction=null;});
$('#accept-confirm').onclick=()=>{const action=confirmAction;confirmAction=null;$('#confirm-dialog').close();action?.();};
for(const input of document.querySelectorAll('[data-dimension]')){
  input.addEventListener('input',()=>{
    const value=+input.value;if(!Number.isFinite(value)||value<15||value>600){input.setAttribute('aria-invalid','true');return;}
    if(project.type==='triangular-prism-carton'&&input.dataset.dimension==='height'&&value<=project.dimensions.depth/2){input.setAttribute('aria-invalid','true');return;}
    input.removeAttribute('aria-invalid');project.dimensions[input.dataset.dimension]=value;
    if(project.type==='triangular-prism-carton'&&input.dataset.dimension==='depth'){project.dimensions.height=Math.max(project.dimensions.height,Math.floor(value/2)+1);$('#dim-height').value=project.dimensions.height;}
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
  else if(input.dataset.property){const key=input.dataset.property,value=+input.value;if(!input.checkValidity()||!Number.isFinite(value))return;const normalized=['x','w'].includes(key)?value/panel.w:['y','h'].includes(key)?value/panel.h:value;if(layer.type==='text'&&['w','h'].includes(key))resizeTextDimension(layer,key,normalized,editor.textTransformMode==='scale');else layer[key]=normalized;}
  else return;
  textureDirty=true;schedule();scheduleSave();
});
$('#inspector').addEventListener('change',e=>{
  if(e.composedPath().some(node=>node.id==='properties'))return;
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
  if(b.id==='toggle-bold'){layer.bold=!layer.bold;delete layer.fontWeight;b.classList.toggle('active',layer.bold);}
  if(b.dataset.align)layer[b.dataset.align]=.5;
  if(['layer-up','layer-down'].includes(b.id)){const i=project.layers.indexOf(layer),j=i+(b.id==='layer-up'?1:-1);if(j>=0&&j<project.layers.length)[project.layers[i],project.layers[j]]=[project.layers[j],project.layers[i]];}
  textureDirty=true;schedule();commit();if(b.dataset.align)renderInspector();
});
$('#add-text').onclick=()=>addLayer('text');
$('#add-image').onclick=()=>$('#image-input').click();
$('#add-barcode').onclick=()=>addLayer('barcode');
$('#add-qrcode').onclick=()=>addLayer('qrcode');
$('#add-symbol').onclick=()=>packagingUI.browse(symbol=>addLayer('symbol','rect',symbol));

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
$('#play-fold').onclick=playAnimation;
document.querySelectorAll('.fold-preset-btn').forEach(btn=>{
  btn.onclick=()=>{stopAnimation();setFold(+btn.dataset.foldPreset,true);preview?.fit();};
});
$('#extra-dimensions').addEventListener('input',e=>{
  const input=e.target,key=input.dataset.extraDim;
  if(!key)return;
  if(!input.checkValidity()){input.setAttribute('aria-invalid','true');return;}
  input.removeAttribute('aria-invalid');
  const val=+input.value;
  if(!Number.isFinite(val))return;
  project.dimensions[key]=val;
  document.querySelectorAll(`#extra-dimensions [data-extra-dim="${key}"]`).forEach(el=>{if(el!==input)el.value=val;});
  const badge=$(`#val-${key}`);
  if(badge)badge.textContent=`${val} ${badge.dataset.unit??'mm'}`;
  clearTimeout(geometryTimer);
  geometryTimer=setTimeout(()=>refresh({fit:true}),80);
});
$('#extra-dimensions').addEventListener('change',e=>{
  if(e.target.dataset.bagOption){project.dimensions[e.target.dataset.bagOption]=e.target.value;refresh({fit:true});}
  if(e.target.dataset.referenceOption){project.dimensions[e.target.dataset.referenceOption]=e.target.value;refresh({fit:true});}
  if(e.target.dataset.extraDim&&!e.target.checkValidity()){renderExtraDimensions();return;}
  commit();
});
$('#extra-dimensions').addEventListener('click',e=>{
  const id=e.target.closest('[data-bag-preset]')?.dataset.bagPreset;
  if(!id||!['paper-shopping-bag','paper-bag-basic'].includes(project.type))return;
  stopAnimation();clearTimeout(geometryTimer);editor.up();
  const {name,...dimensions}=PAPER_BAG_PRESETS[id];project.dimensions={...dimensions};refresh({fit:true});commit();notify(`已应用${name}纸袋尺寸`);
});
$('#quality').onchange=e=>{project.quality=e.target.value;preview?.setQuality(project.quality);preview?.paint(project);commit();};
$('#image-input').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(file)await importImage(file);};

async function importSvgArtwork(file){
  if(file.size>MAX_SVG_FILE_BYTES){notify('SVG 文件请小于 32 MB（含内嵌图片）');return;}
  editor.up();const target=project,side=activeSide,panel=dieline.panels.find(p=>p.id===panelId),geometry=JSON.stringify(project.dimensions);
  if(!panel)return;
  try{
    if(editor.native){await editor.update(project,dieline,selected,panelId,side,[]);if(project!==target||activeSide!==side)throw Error('导入期间工程或印刷面已改变，请重新导入');await editor.importSVG(await file.text(),file.name.replace(/\.svg$/i,''));notify('SVG 已放入主画布，可直接选择文字、路径和图形编辑');return;}
    if(project.layers.length>=120)throw Error('当前工程最多支持 120 个图层');
    const layer=importSvgDocument(await file.text(),{panel,side,name:file.name.replace(/\.svg$/i,'')});
    const layers=[layer];
    validateProject({...target,layers:[...target.layers,...layers]});await images.preload(layers);
    if(project!==target||JSON.stringify(project.dimensions)!==geometry)throw Error('工程已切换，请重新导入 SVG');
    if(project.layers.length+layers.length>120)throw Error('当前工程最多支持 120 个图层');
    project.layers.push(...layers);dirtySides.add(side);commit();selectLayer(layers.at(-1).id,panel.id,layers.map(l=>l.id));
    notify('SVG 原稿已导入，原有图层、分组和对象已保留');
  }catch(error){images.retain(project.layers);notify(`SVG 导入失败：${error.message}`);editorUI?.showSvgSupport(error.message);}
}

async function importImage(file){
  if(file.type==='image/svg+xml'||/\.svg$/i.test(file.name))return importSvgArtwork(file);
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){notify('请选择 PNG、JPG 或 WebP 图片');return;}
  if(file.size>15*1024*1024){notify('图片请小于 15 MB');return;}
  let bitmap;
  editor.up();const target=project,side=activeSide,targetPanel=panelId;
  try{
    bitmap=await createImageBitmap(file);const scale=Math.min(1,1536/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();bitmap=null;
    editor.up();
    if(project!==target||activeSide!==side||panelId!==targetPanel)throw Error('导入期间工程、印刷面或面板已改变，请重新导入图片');
    if(project.layers.length>=120)throw new Error('当前工程最多支持 120 个图层');
    const panel=dieline.panels.find(p=>p.id===panelId),w=.7,h=Math.min(.8,w*panel.w*canvas.height/canvas.width/panel.h);
    const layer={id:uid(),type:'image',name:file.name.slice(0,60),panel:panelId,side:activeSide,x:.5,y:.5,w:h*panel.h*canvas.width/canvas.height/panel.w,h,rotation:0,opacity:1,visible:true,src:canvas.toDataURL('image/png')};
    if(editor.native){await editor.importRaster(layer);textureDirty=true;schedule();notify('图片已添加，可以拖动与缩放');return;}
    project.layers.push(layer);selected=layer.id;images.get(layer.src);textureDirty=true;schedule();commit();renderInspector();notify('图片已添加，可以拖动与缩放');
  }catch(error){bitmap?.close();notify(error.message??'图片导入失败');}
}
$('#editor-host').addEventListener('dragover',e=>{e.preventDefault();$('#editor-host').classList.add('drag-over');});
$('#editor-host').addEventListener('dragleave',()=>$('#editor-host').classList.remove('drag-over'));
$('#editor-host').addEventListener('drop',e=>{e.preventDefault();$('#editor-host').classList.remove('drag-over');const file=e.dataTransfer.files[0];if(file)importImage(file);});

$('#save-project').onclick=()=>{editor.flushInput?.();editor.up();const copy=clone(project);download(new Blob([JSON.stringify(copy,null,2)],{type:'application/json'}),`${safeName()}.fold`);closeProtection.saved(activeProjectId,copy);persist();notify('工程已下载，包含全部图文与尺寸');};
$('#import-project').onclick=()=>$('#project-input').click();
$('#project-input').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(file.size>MAX_PROJECT_FILE_BYTES){notify('工程文件请小于 128 MB');return;}
  try{
    const content=await file.text();let input,importSide='outside';
    if(file.name.toLowerCase().endsWith('.svg')){
      const doc=new DOMParser().parseFromString(content,'image/svg+xml'),metadata=doc.querySelector('metadata[data-fold-studio]');
      if(!metadata)return await importSvgArtwork(file);
      input=JSON.parse(metadata.textContent);
      if(metadata.getAttribute('data-surface')==='inside')importSide='inside';
    }else input=JSON.parse(content);
    const next=validateProject(input);await images.preload([...svgSceneLayers(next,makeDieline(next.type,next.dimensions)),...next.layers]);stopAnimation();clearTimeout(geometryTimer);
    await newLibraryDocument(next,{fromFile:true});if(importSide==='inside')setSide('inside');notify('工程已导入为新工程，原工程已保留');
  }catch(error){notify(`打开失败：${error.message}`);}
};
function safeName(){return project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,80)||'折间工程';}
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
  const svgClipboard=editor.native&&text.match(/^FOLD-SVG\r?\n/);
  if(svgClipboard){try{await editor.importSVG(text.slice(svgClipboard[0].length),'粘贴图文',true);}catch(error){notify(`粘贴失败：${error.message}`);}return;}
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
    editor.up();
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
$('#copy-layer').onclick=()=>editor.native?editor.run('copy'):writeLayerClipboard();$('#cut-layer').onclick=()=>editor.native?editor.run('cut'):writeLayerClipboard(true);
$('#paste-layer').onclick=async()=>{
  try{
    if(navigator.clipboard?.read){
      const items=await navigator.clipboard.read();
      for(const item of items)if(item.types.includes('text/plain')){await pasteText(await(await item.getType('text/plain')).text());return;}
      for(const item of items){const type=item.types.find(t=>/^image\/(png|jpeg|webp)$/.test(t));if(type){await importImage(new File([await item.getType(type)],'剪贴板图片.png',{type}));return;}}
      if(editor.native&&editor.api.hasClipboard){editor.run('paste');return;}notify('剪贴板里没有支持的图层、文字或图片');
    }else if(navigator.clipboard?.readText)await pasteText(await navigator.clipboard.readText());
    else notify('请直接按 Ctrl / ⌘ V 粘贴');
  }catch{if(editor.native&&editor.api.hasClipboard)editor.run('paste');else notify('浏览器限制了按钮读取，请直接按 Ctrl / ⌘ V 粘贴');}
};
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!$('dialog[open]'))$('#save-project').click();return;}
  if(editingText(e.target)||$('dialog[open],.native-edit-menu:popover-open')||e.isComposing)return;
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
  if(e.code==='Space'){e.preventDefault();editor.space=true;editor.canvas.style.cursor='grab';editor.api?.refreshCursor();}
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
document.addEventListener('keyup',e=>{if(e.code==='Space'){editor.space=false;editor.canvas.style.cursor=editor.tool==='pan'?'grab':'default';editor.api?.refreshCursor();}});
window.addEventListener('blur',()=>{editor.space=false;editor.canvas.style.cursor=editor.tool==='pan'?'grab':'default';editor.api?.refreshCursor();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAnimation();if(unsaved){clearTimeout(saveTimer);persist();}}});
window.addEventListener('pagehide',()=>{if(unsaved){clearTimeout(saveTimer);persist();}});
window.addEventListener('beforeunload',event=>{if(editor?.dirty||closeProtection.shouldWarn(activeProjectId,project)){event.preventDefault();event.returnValue='有未保存的工程修改';}});


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

function applyColorMode(mode,{save=true}={}) {
  if(!['rgb','cmyk'].includes(mode))throw Error('请选择 RGB 或 CMYK');
  if(mode==='cmyk'&&!colorStatus().ready){notify('ICC 色彩引擎未就绪，请稍后重试');mode='rgb';}
  if(mode==='cmyk'){try{configureColorManagement(project.printSettings);}catch(error){notify(`ICC 软打样无法启用：${error.message}`);mode='rgb';}}
  colorMode = mode;
  document.documentElement.setAttribute('data-color-mode', mode);
  try { localStorage.setItem('fold-color-mode', mode); } catch {}
  const btn = $('#color-mode-toggle');
  if (btn) {
    btn.innerHTML = `${icon('cmyk')}<span id="color-mode-text" class="color-mode-text">${mode === 'cmyk' ? 'CMYK 印刷' : 'RGB 屏幕'}</span>`;
    btn.classList.toggle('active', mode === 'cmyk');
    btn.setAttribute('title', mode === 'cmyk' ? `CMYK 模式：${colorStatus().name}；JPG/PDF 输出四色，SVG 输出色域显示（P 切回 RGB）` : 'RGB 屏幕色彩（P 切换 CMYK 印刷模式）');
    btn.setAttribute('aria-label',mode==='cmyk'?'CMYK 印刷模式':'RGB 屏幕模式');
  }
  const tag2d = $('#cmyk-tag-2d'), tag3d = $('#cmyk-tag-3d');
  if (tag2d) tag2d.hidden = mode !== 'cmyk';
  if (tag3d) tag3d.hidden = mode !== 'cmyk';
  editor?.setColorMode(mode);
  preview?.setColorMode(mode);
  renderSurface();
  renderInspector();
  if(save&&project.documentColorMode!==mode){project.documentColorMode=mode;commit();}
}

$('#color-mode-toggle')?.addEventListener('click', () => {
  const next = colorMode === 'cmyk' ? 'rgb' : 'cmyk';
  applyColorMode(next);
  if(colorMode!==next)return;
  notify(colorMode === 'cmyk' ? `ICC 软打样：${colorStatus().name}（P 切换）` : 'RGB 屏幕色彩（P 切换）');
});

editorUI=mountEditorUI({editor,images,notify,addShape:()=>addLayer('shape'),select:selectLayer,getState:()=>({project,dieline,selected,ids:getSelectedIds(),panelId,side:activeSide}),change:()=>{textureDirty=true;schedule();commit();}});
packagingUI=mountPackagingUI(()=>project.layers.find(l=>l.id===selected));
colorUI=mountColorUI({getState:()=>({project,side:activeSide,ids:getSelectedIds(),panelId}),palettes:PALETTES,update:({commit:save=false,render=false}={})=>{textureDirty=true;schedule();if(save)commit();else scheduleSave();renderSurface();if(render){renderLayers();renderInspector();}}});
initWorkspaceResizers();
initWorkspaceShell();
mountPrintUI({images,getState:()=>({project,dieline,side:activeSide,colorMode}),flush:()=>editor.up(),notify,apply:(settings,mode)=>{project.printSettings=settings;refresh({build:false});applyColorMode(mode);commit();}});
mountExportUI({images,getState:()=>({project,dieline,side:activeSide,colorMode}),flush:()=>{editor.flushInput();editor.up();},artworkSource:()=>editor.api.source(),notify,captureRgb:async(fold)=>{
  if(!preview)throw Error('三维预览尚未启动');await images.preload([...svgSceneLayers(project,dieline),...project.layers]);
  try{preview.setColorMode('rgb');if(fold!==undefined)preview.setFold(fold);const blob=await preview.capture();if(!blob)throw Error('三维截图失败');const image=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);image.close();return canvas;}
  finally{preview.setFold(project.fold);preview.setColorMode(colorMode);}
}});

async function init(){
  $('#app').inert=true;
  try{await colorReady;}catch(error){notify(`ICC 色彩引擎未加载：${error.message}`);}
  try{
    let saved=await getActiveDocument(project);
    if(saved.project?.type&&!Object.hasOwn(BOX_TYPES,saved.project.type)){
      const fallback=newProject();
      saved={id:await createDocument(fallback),project:fallback};
      notify('原工程的盒型已不再提供，已新建工程；原记录仍保留在本机');
    }
    const next=validateProject(saved.project);
    await images.preload([...svgSceneLayers(next,makeDieline(next.type,next.dimensions)),...next.layers]);activeProjectId=saved.id;project=next;history=new History(project);panelId=BOX_TYPES[project.type].printPanel;
    const revisions=await listRevisions(saved.id);lastSnapshotAt=revisions[0]?.createdAt??0;
    if(!revisions.length){try{const revision=await saveRevision(saved.id,clone(project),'初始版本');lastSnapshotAt=revision.createdAt;}catch{notify('历史版本未能保存，请下载 .fold 备份');}}
    $('#save-status').innerHTML=`${icon('check')}已在本机保存`;
  }catch(error){notify(`未能恢复本机工程：${error.message}`);$('#save-status').textContent='本机工程未载入';}
  closeProtection.open(activeProjectId,project);
  mountProjectLibrary({
    currentId:()=>activeProjectId,listProjects:listDocuments,listRevisions,notify,
    create:()=>newLibraryDocument(),
    open:openLibraryDocument,
    duplicate:async id=>{if(!await flushSave())throw new Error('当前工程尚未保存，请先下载 .fold 备份');const source=await getDocument(id);if(!source)throw new Error('此工程已不存在');const copy=validateProject(source);copy.name=`${copy.name} 副本`.slice(0,80);await newLibraryDocument(copy);},
    snapshot:()=>snapshotCurrent(),
    restore:restoreLibraryRevision,
  });
  refresh({fit:true});await editor.pending;$('#app').inert=false;await document.fonts.ready;textureDirty=true;schedule();
  applyColorMode(project.documentColorMode??getSavedColorMode(),{save:false});
  window.__foldStudio={
    get project(){return clone(project);},
    get stats(){return preview?clone(preview.stats):null;},
    get selection(){return {selected,ids:getSelectedIds(),panelId,side:activeSide};},
    get editorEngine(){return 'SVG-edit / SVGCanvas 7.4.2';},
    get nativeEditor(){return editor.api;},
    edit:editorUI.run,
    get view(){return {...editor.view,side:activeSide};},
    get geometry(){return clone(dieline);},
    get isExpanded(){return isEditorExpanded;},
    get colorMode(){return colorMode;},
    get printColor(){return clone(colorStatus());},
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

