// TIFF 6.0: chunky separated CMYK, uncompressed pixels and embedded ICC.
// Editable vectors remain in SVG / .fold; this print output is flattened.
export function encodeCmykTiff({width,height,pixels,profile,dpi=300,description='Fold Studio CMYK'}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||pixels.length!==width*height*4||!Number.isFinite(dpi)||dpi<=0)throw Error('CMYK TIFF 数据无效');
  const entries=[],extras=[];let offset=8+2+17*12+4;
  const add=(tag,type,count,value)=>entries.push({tag,type,count,value});
  const extra=data=>{const at=offset;extras.push({at,data});offset+=(data.length+1)&~1;return at;};
  const shorts=values=>{const b=new Uint8Array(values.length*2),v=new DataView(b.buffer);values.forEach((x,i)=>v.setUint16(i*2,x,true));return b;};
  const rational=value=>{const b=new Uint8Array(8),v=new DataView(b.buffer);v.setUint32(0,Math.round(value*10000),true);v.setUint32(4,10000,true);return b;};
  const info=new TextEncoder().encode(description.replace(/[^\x20-\x7e]/g,'?')+'\0');
  add(256,4,1,width);add(257,4,1,height);add(258,3,4,extra(shorts([8,8,8,8])));add(259,3,1,1);add(262,3,1,5);add(270,2,info.length,extra(info));
  const strip={tag:273,type:4,count:1,value:0};entries.push(strip);
  add(277,3,1,4);add(278,4,1,height);add(279,4,1,pixels.length);add(282,5,1,extra(rational(dpi)));add(283,5,1,extra(rational(dpi)));add(284,3,1,1);add(296,3,1,2);add(332,3,1,1);add(334,3,1,4);add(34675,7,profile.length,extra(profile));
  strip.value=offset;const out=new Uint8Array(offset+pixels.length),view=new DataView(out.buffer);out.set([73,73,42,0]);view.setUint32(4,8,true);view.setUint16(8,entries.length,true);
  entries.sort((a,b)=>a.tag-b.tag).forEach((e,i)=>{const p=10+i*12;view.setUint16(p,e.tag,true);view.setUint16(p+2,e.type,true);view.setUint32(p+4,e.count,true);if(e.type===3&&e.count===1)view.setUint16(p+8,e.value,true);else view.setUint32(p+8,e.value,true);});
  for(const e of extras)out.set(e.data,e.at);out.set(pixels,offset);return out;
}
export async function exportCmykTiff(canvas,transform,{dpi=300,onProgress=()=>{}}={}){
  const {width,height}=canvas,ctx=canvas.getContext('2d'),pixels=new Uint8Array(width*height*4),rows=Math.max(1,Math.floor(65536/width));
  for(let y=0;y<height;y+=rows){const h=Math.min(rows,height-y),data=ctx.getImageData(0,y,width,h).data,rgb=new Uint8Array(width*h*3);for(let i=0;i<width*h;i++){const a=data[i*4+3]/255;for(let c=0;c<3;c++)rgb[i*3+c]=Math.round(data[i*4+c]*a+255*(1-a));}pixels.set(transform.convert(rgb),y*width*4);onProgress((y+h)/height);await new Promise(resolve=>setTimeout(resolve,0));}
  return new Blob([encodeCmykTiff({width,height,pixels,profile:transform.profile,dpi,description:`Fold Studio; sRGB to ${transform.name}; intent=${transform.settings.intent}; BPC=${transform.settings.blackPointCompensation}`})],{type:'image/tiff'});
}
