import {paintArtwork} from './artwork.js';
import {svgSceneLayers} from './svg-scene.js';
import {proofCanvas} from './color.js';
import {cutSegments,creasePaths} from './geometry.js';
export async function renderPrintSurface(project,line,images,{side='outside',max=3072,dpi,includeLines=false,proof=false}={}){
  const scale=dpi?dpi/25.4:max/Math.max(line.width,line.height),width=Math.ceil(line.width*scale),height=Math.ceil(line.height*scale);
  if(!Number.isFinite(scale)||scale<=0||width>16000||height>16000||width*height>40000000)throw Error('此尺寸和分辨率超过 4000 万像素，请降低 DPI 或缩小盒型');
  await images.preload([...svgSceneLayers(project,line),...project.layers]);await document.fonts.ready;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:proof});
  if(side==='inside')ctx.setTransform(-scale,0,0,scale,line.maxX*scale,-line.minY*scale);
  else ctx.setTransform(scale,0,0,scale,-line.minX*scale,-line.minY*scale);
  paintArtwork(ctx,project,line,images,side,'rgb');if(proof)proofCanvas(canvas);
  if(includeLines){ctx.save();ctx.strokeStyle='#d54a48';ctx.lineWidth=.15;ctx.beginPath();for(const [a,b]of cutSegments(line)){ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();ctx.strokeStyle='#368258';ctx.lineWidth=.2;ctx.setLineDash([2,1]);for(const p of creasePaths(line))ctx.stroke(new Path2D(p.d));ctx.restore();}
  return canvas;
}
