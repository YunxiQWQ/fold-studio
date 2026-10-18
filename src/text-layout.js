import { Textbox } from 'fabric';

export const fontFamily = font => font === 'serif' ? '"Noto Serif SC", "Songti SC", SimSun, serif' : font === 'mono' ? 'Consolas, monospace' : '"Noto Sans SC", "PingFang SC", DengXian, Arial, sans-serif';

// Both the interactive editor and exported artwork use the same text engine.
export class ArtworkText extends Textbox {
  _getTopOffset(){return -this.calcTextHeight()/2;}
}
export function textOptions(layer,w,h,color=layer.color){
  return {text:layer.text,fontFamily:fontFamily(layer.font),fontSize:layer.size,fontWeight:layer.bold?600:400,
    fontStyle:layer.italic?'italic':'normal',underline:!!layer.underline,textAlign:layer.textAlign??'center',
    lineHeight:layer.lineHeight??1.5,charSpacing:layer.charSpacing??0,fill:color,
    stroke:layer.strokeWidth?layer.stroke:null,strokeWidth:layer.strokeWidth??0,
    width:w,height:h,splitByGrapheme:true,originX:'center',originY:'center',padding:0};
}
const cache=new WeakMap();
export function renderText(ctx,layer,w,h,color){
  const options=textOptions(layer,w,h,color),key=JSON.stringify(options);let entry=cache.get(layer);
  if(!entry||entry.key!==key){entry?.object.dispose();const object=new ArtworkText(layer.text,{...options,left:0,top:0,objectCaching:false});object.set({height:h});entry={key,object};cache.set(layer,entry);}
  entry.object.render(ctx);
}
