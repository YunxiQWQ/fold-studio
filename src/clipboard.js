import { clone, uid, validateProject } from './project.js';

export const CLIPBOARD_PREFIX = 'FOLD_STUDIO_LAYERS_V1\n';
export const CLIPBOARD_MIME = 'application/x-fold-studio-layers+json';

export function encodeLayers(layers, panel, placement, anchor) {
  return CLIPBOARD_PREFIX + JSON.stringify({ format:'fold-studio-layers', version:1, panel:{w:panel.w,h:panel.h}, layers:clone(layers),...(placement?{placement}:{}),...(anchor?{anchor}:{}) });
}

export function decodeLayers(text) {
  if(typeof text!=='string'||!text.startsWith(CLIPBOARD_PREFIX))return null;
  if(text.length>16*1024*1024)throw new Error('剪贴板图层数据过大，请改用工程文件传递');
  const payload=JSON.parse(text.slice(CLIPBOARD_PREFIX.length));
  if(payload?.format!=='fold-studio-layers'||payload.version!==1||!Array.isArray(payload.layers)||payload.layers.length<1||payload.layers.length>120||!Number.isFinite(payload.panel?.w)||!Number.isFinite(payload.panel?.h)||payload.panel.w<1||payload.panel.h<1)throw new Error('剪贴板中的折间图层数据无效');
  return payload;
}

export function layersForPaste(project, payload, panel, side, offsetMm = 3) {
  if(project.layers.length+payload.layers.length>120)throw new Error('粘贴后超出 120 个图层的上限');
  if(payload.anchor&&['x','y'].some(k=>!Number.isFinite(payload.anchor[k])))throw new Error('剪贴板多选锚点无效');
  const groups=new Map();
  const layers=payload.layers.map(source=>{
    const layer=clone(source);
    const position=payload.placement?.[source.id];
    if(position&&['x','y','w','h'].some(k=>!Number.isFinite(position[k])))throw new Error('剪贴板多选坐标无效');
    if(layer.group){if(!groups.has(layer.group))groups.set(layer.group,uid());layer.group=groups.get(layer.group);}
    // Retain physical size across different box dimensions; coordinates are relative to the target face.
    return {...layer,id:uid(),name:String(layer.name??'粘贴图层').slice(0,60),panel:panel.id,side,visible:true,locked:false,
      x:Math.max(-1000,Math.min(1000,(position?(payload.anchor?.x??.5)+position.x/panel.w:Number(layer.x))+offsetMm/panel.w)),y:Math.max(-1000,Math.min(1000,(position?(payload.anchor?.y??.5)+position.y/panel.h:Number(layer.y))+offsetMm/panel.h)),
      w:position?position.w/panel.w:Number(layer.w)*payload.panel.w/panel.w,h:position?position.h/panel.h:Number(layer.h)*payload.panel.h/panel.h};
  });
  validateProject({...project,layers:[...project.layers,...layers]});
  return layers;
}
