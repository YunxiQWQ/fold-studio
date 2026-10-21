import { BOX_TYPES, makeDieline } from './geometry.js';

export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export const SIDES = { outside: '外面', inside: '内面' };
export const sideOf = layer => layer.side ?? 'outside';
export function surfaceOf(project, side = 'outside') {
  return side === 'inside'
    ? { paper: project.insidePaper ?? '#eeeadd', colors: project.insidePanelColors ?? {} }
    : { paper: project.paper, colors: project.panelColors };
}
export const PALETTES = [
  { name: '山野绿', color: '#f3f0df', accent: '#39563c', highlight: '#d8e5a2' },
  { name: '燕麦白', color: '#faf6ed', accent: '#715748', highlight: '#dfb994' },
  { name: '暮山紫', color: '#ebe6f1', accent: '#65517d', highlight: '#d1bbdf' },
  { name: '海盐蓝', color: '#e6eff1', accent: '#305a69', highlight: '#afd4d8' },
];

export function newProject(type = 'carton') {
  return {
    version: 2, name: '山野之间 · 包装练习', type,
    dimensions: { ...BOX_TYPES[type].defaults },
    paper: '#f3f0df', accent: '#39563c', highlight: '#d8e5a2', material: 'matte',
    fold: 1, quality: 'balanced', panelColors: {}, insidePaper: '#eeeadd', insidePanelColors: {}, layers: sampleLayers(type),
  };
}

export function sampleLayers(type) {
  const main = BOX_TYPES[type].printPanel;
  return [
    { id: uid(), type: 'shape', shape: 'rect', name: '底部色带', panel: main, x: 0.5, y: 0.88, w: 1.01, h: 0.24, color: '#39563c', rotation: 0, opacity: 1, visible: true },
    { id: uid(), type: 'text', name: '英文眉题', panel: main, x: 0.5, y: 0.12, w: 0.9, h: 0.06, text: 'GROWN WITH THE SEASONS', font: 'sans', size: 3.2, color: '#39563c', rotation: 0, opacity: 1, visible: true, bold: false },
    { id: uid(), type: 'text', name: '品牌名称', panel: main, x: 0.5, y: 0.255, w: 0.92, h: 0.15, text: '山野之间', font: 'serif', size: 13, color: '#39563c', rotation: 0, opacity: 1, visible: true, bold: true },
    { id: uid(), type: 'text', name: '品牌副标题', panel: main, x: 0.5, y: 0.355, w: 0.85, h: 0.08, text: '把山野，带回日常', font: 'sans', size: 4, color: '#61725a', rotation: 0, opacity: 1, visible: true, bold: false },
    { id: uid(), type: 'shape', shape: 'botanical', name: '山野植物图形', panel: main, x: 0.5, y: 0.57, w: 0.60, h: 0.29, color: '#39563c', rotation: 0, opacity: 1, visible: true },
    { id: uid(), type: 'text', name: '产品标注', panel: main, x: 0.5, y: 0.875, w: 0.9, h: 0.10, text: '自然好物  /  EVERYDAY NATURE', font: 'sans', size: 3.5, color: '#f3f0df', rotation: 0, opacity: 1, visible: true, bold: false },
    ...(BOX_TYPES[type].family==='carton' ? [
      { id: uid(), type: 'text', name: '侧面文字', panel: 'right', x: 0.5, y: 0.42, w: 0.88, h: 0.4, text: '来自自然\n归于日常\n\nSLOW DOWN.\nGROW WILD.', font: 'sans', size: 4, color: '#39563c', rotation: 0, opacity: 1, visible: true, bold: false },
      { id: uid(), type: 'text', name: '背面说明', panel: 'back', x: 0.5, y: 0.35, w: 0.88, h: 0.4, text: '与自然相处的每一天\n\n留一点时间，感受季节。\n留一点空间，装下喜欢。\n\nDESIGNED TO BE SIMPLE.', font: 'sans', size: 4, color: '#39563c', rotation: 0, opacity: 1, visible: true, bold: false },
    ] : []),
  ].map(layer => {
    if(type==='gable-handle-carton'&&layer.panel==='front'){
      // This face lies below the tray base in the net; rotate its sample
      // composition so its text reads upright after the wall folds up.
      layer.x=1-layer.x;layer.y=1-layer.y;layer.rotation=180;
    }
    if(BOX_TYPES[type].sourceMesh||type==='blank-metal-tin'){
      const info=BOX_TYPES[type],band=info.labelBand??[.04,.96],labelH=info.defaults.height*(band[1]-band[0]);
      if(layer.type==='text')layer.size=Math.min(layer.size,labelH*.085);
      if(layer.shape==='botanical')layer.w=Math.min(.25,labelH*.8/(Math.PI*info.defaults.length));
    }
    return{...layer,side:'outside'};
  });
}

export function validateProject(input) {
  if (!input || ![1,2].includes(input.version) || !Object.hasOwn(BOX_TYPES,input.type)) throw new Error('这不是受支持的折间工程文件');
  makeDieline(input.type, input.dimensions ?? {});
  const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  if (![input.paper, input.accent, input.highlight].every(hex)) throw new Error('工程颜色数据无效');
  if (!Array.isArray(input.layers) || input.layers.length > 120) throw new Error('工程最多支持 120 个图层');
  const ids = new Set();
  const panels = new Set(makeDieline(input.type, input.dimensions).panels.map(p => p.id));
  for (const layer of input.layers) {
    if (!['text', 'image', 'shape', 'barcode', 'qrcode', 'symbol'].includes(layer.type) || !panels.has(layer.panel)) throw new Error('工程包含无效图层');
    if (layer.side !== undefined && !Object.hasOwn(SIDES, layer.side)) throw new Error('工程图层内外面数据无效');
    if (typeof layer.id !== 'string' || ids.has(layer.id)) throw new Error('工程图层编号无效');
    ids.add(layer.id);
    for (const key of ['x', 'y', 'w', 'h', 'rotation', 'opacity']) if (!Number.isFinite(layer[key])) throw new Error('工程图层坐标无效');
    if (Math.abs(layer.x) > 1000 || Math.abs(layer.y) > 1000 || layer.w <= 0 || layer.h <= 0 || layer.w > 1000 || layer.h > 1000 || layer.opacity < 0 || layer.opacity > 1 || Math.abs(layer.rotation) > 3600) throw new Error('工程图层超出支持范围');
    if (layer.type === 'text' && (typeof layer.text !== 'string' || layer.text.length > 5000 || !Number.isFinite(layer.size) || layer.size < 1 || layer.size > 100)) throw new Error('工程文字数据无效');
    if (layer.type !== 'image' && !hex(layer.color)) throw new Error('工程图层颜色无效');
    if (layer.type === 'shape' && !['rect', 'ellipse', 'botanical','triangle','line','arrow'].includes(layer.shape)) throw new Error('工程图形类型无效');
    for(const key of ['locked','flipX','flipY','italic','underline','clipToPanel'])if(layer[key]!==undefined&&typeof layer[key]!=='boolean')throw new Error('工程图层开关无效');
    if(layer.group!==undefined&&(typeof layer.group!=='string'||layer.group.length>80))throw new Error('工程组合编号无效');
    if(layer.stroke!==undefined&&!hex(layer.stroke))throw new Error('描边颜色无效');
    for(const [key,min,max]of [['strokeWidth',0,20],['radius',0,300],['lineHeight',.7,4],['charSpacing',-100,1000]])if(layer[key]!==undefined&&(!Number.isFinite(layer[key])||layer[key]<min||layer[key]>max))throw new Error('工程样式数值无效');
    if(layer.textAlign!==undefined&&!['left','center','right','justify'].includes(layer.textAlign))throw new Error('工程文字对齐无效');
    if(layer.crop!==undefined){const c=layer.crop;if(layer.type!=='image'||!c||['x','y','w','h'].some(k=>!Number.isFinite(c[k]))||c.x<0||c.y<0||c.w<=0||c.h<=0||c.x+c.w>1.000001||c.y+c.h>1.000001)throw new Error('图片裁剪区域无效');}
    if (layer.type === 'image' && (typeof layer.src !== 'string' || layer.src.length > 8e6 || !/^data:image\/(png|jpeg|webp);base64,/.test(layer.src))) throw new Error('工程图片格式无效');
    if (layer.type === 'barcode') {
      if (typeof layer.code !== 'string' || layer.code.length > 120) throw new Error('工程条码数据无效');
      if (layer.format !== undefined && !['ean13', 'code128'].includes(layer.format)) throw new Error('工程条码格式无效');
      if (layer.bgColor !== undefined && layer.bgColor !== 'transparent' && !hex(layer.bgColor)) throw new Error('工程条码背景色无效');
    }
    if (layer.type === 'qrcode') {
      if (typeof layer.text !== 'string' || layer.text.length > 2000) throw new Error('工程二维码数据无效');
      if(layer.errorCorrectionLevel!==undefined&&!['L','M','Q','H'].includes(layer.errorCorrectionLevel))throw new Error('二维码纠错等级无效');
      if (layer.bgColor !== undefined && layer.bgColor !== 'transparent' && !hex(layer.bgColor)) throw new Error('工程二维码背景色无效');
    }
    if (layer.type === 'symbol' && (typeof layer.symbol !== 'string' || layer.symbol.length > 60)) throw new Error('工程标志数据无效');
  }
  if (!Number.isFinite(input.fold) || input.fold < 0 || input.fold > 1) throw new Error('工程折叠进度无效');
  if (!['balanced', 'crisp', 'economy'].includes(input.quality) || !['matte', 'gloss', 'kraft'].includes(input.material)) throw new Error('工程预览设置无效');
  if (!input.panelColors || typeof input.panelColors !== 'object' || Object.entries(input.panelColors).some(([id, color]) => !panels.has(id) || !hex(color))) throw new Error('工程面板颜色无效');
  if (input.insidePaper !== undefined && !hex(input.insidePaper)) throw new Error('工程内面底色无效');
  if (input.insidePanelColors !== undefined && (!input.insidePanelColors || typeof input.insidePanelColors !== 'object' || Array.isArray(input.insidePanelColors) || Object.entries(input.insidePanelColors).some(([id, color]) => !panels.has(id) || !hex(color)))) throw new Error('工程内面面板颜色无效');
  return clone({ ...input, version: 2, insidePaper: input.insidePaper ?? '#eeeadd', insidePanelColors: input.insidePanelColors ?? {}, layers: input.layers.map(layer => ({ ...layer, side: sideOf(layer) })), name: String(input.name ?? '未命名工程').slice(0, 80) });
}

export class History {
  constructor(project, limit = 40) { this.entries = [clone(project)]; this.index = 0; this.limit = limit; }
  push(project) {
    if (JSON.stringify(project) === JSON.stringify(this.entries[this.index])) return;
    this.entries.splice(this.index + 1);
    this.entries.push(clone(project));
    if (this.entries.length > this.limit) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  undo() { return this.index > 0 ? clone(this.entries[--this.index]) : null; }
  redo() { return this.index < this.entries.length - 1 ? clone(this.entries[++this.index]) : null; }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.entries.length - 1; }
}
