export function normalizeHex(value){
  if(typeof value!=='string')return null;const text=value.trim().replace(/^#/,'');
  if(/^[0-9a-f]{3}$/i.test(text))return '#'+[...text].map(c=>c+c).join('').toLowerCase();
  return /^[0-9a-f]{6}$/i.test(text)?'#'+text.toLowerCase():null;
}
export function hexRgb(value){const hex=normalizeHex(value);return hex?[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)):null;}
export function rgbHex(values){return values.length===3&&values.every(v=>v!==''&&Number.isInteger(Number(v))&&+v>=0&&+v<=255)?'#'+values.map(v=>(+v).toString(16).padStart(2,'0')).join(''):null;}
export function projectColors(project){return [...new Set([project.paper,project.insidePaper,project.accent,project.highlight,...Object.values(project.panelColors),...Object.values(project.insidePanelColors??{}),...project.layers.flatMap(l=>[l.color,l.stroke,l.bgColor])].map(normalizeHex).filter(Boolean))].slice(0,24);}
export function recentColors(values,color){return [...new Set([color,...values].map(normalizeHex).filter(Boolean))].slice(0,12);}
