export const TEXT_SCALE_MIN=.05;
export const TEXT_SCALE_MAX=20;
export const clampTextScale=value=>Math.max(TEXT_SCALE_MIN,Math.min(TEXT_SCALE_MAX,value));

export function textGeometry(layer,w,h){
  const scaleX=layer.textScaleX??1,scaleY=layer.textScaleY??1;
  return{width:w/scaleX,height:h/scaleY,scaleX,scaleY};
}

// Frame dimensions describe the visible box. A glyph stretch changes both the
// visible dimension and its scale, keeping the layout width (and wraps) stable.
export function setTextScale(layer,axis,value){
  const key=axis==='x'?'textScaleX':'textScaleY',dimension=axis==='x'?'w':'h';
  const scale=clampTextScale(value);
  layer[dimension]*=scale/(layer[key]??1);layer[key]=scale;
}

export function resizeTextDimension(layer,dimension,value,stretch){
  if(stretch)setTextScale(layer,dimension==='w'?'x':'y',(layer[dimension==='w'?'textScaleX':'textScaleY']??1)*value/layer[dimension]);
  else layer[dimension]=value;
}
