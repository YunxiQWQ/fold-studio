import {uid,sideOf} from './project.js';
import {printRegions,regionPath} from './artwork-space.js';
import {copySvgNodes,validateSvgAsset} from './svg-asset.js';

const node=(tag,attrs,children=[])=>({tag,attrs,children});
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const matrix=m=>`matrix(${m.map(n=>String(+n.toFixed(10))).join(' ')})`;
function parsedMatrix(value){if(!value)return[1,0,0,1,0,0];const m=value.match(/^\s*matrix\(([^)]+)\)\s*$/);if(!m)return null;const list=m[1].trim().split(/[\s,]+/).map(Number);return list.length===6&&list.every(Number.isFinite)?list:null;}
function simplify(nodes,keepWhitespace=false){
  return nodes.flatMap(n=>{
    if(typeof n==='string')return keepWhitespace||n.trim()?n:[];
    const result={...n,children:simplify(n.children,keepWhitespace||['text','tspan'].includes(n.tag))};
    if(n.tag!=='g')return[result];
    if(n.recolor)return[result];
    if(!Object.keys(n.attrs).length)return result.children;
    if(Object.keys(n.attrs).every(k=>k==='transform')&&result.children.length===1){
      const child=result.children[0],a=parsedMatrix(n.attrs.transform),b=typeof child==='object'&&parsedMatrix(child.attrs.transform);
      if(a&&b&&!['defs','clipPath','linearGradient','radialGradient'].includes(child.tag))return[{...child,attrs:{...child.attrs,transform:matrix(multiply(a,b))}}];
    }
    return[result];
  });
}
const readerPanel=(line,p,side)=>({...p,x:side==='inside'?line.minX+line.maxX-p.x-p.w:p.x});
export function mergeSvgRun(layers,line,{name='合并 SVG 图形'}={}){
  const side=sideOf(layers[0]);
  if(layers.length<2||layers.some(l=>l.type!=='svg'||l.locked||!l.visible||sideOf(l)!==side))throw Error('请合并同一印刷面上可见、未锁定的 SVG 图形');
  const layouts=layers.map(l=>{
    const p=readerPanel(line,line.panels.find(p=>p.id===l.panel),side),w=l.w*p.w,h=l.h*p.h,angle=l.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=p.x+l.x*p.w,y=p.y+l.y*p.h;
    const bw=Math.abs(w*c)+Math.abs(h*s),bh=Math.abs(w*s)+Math.abs(h*c);
    const [vx,vy,vw,vh]=l.svg.viewBox,sx=w/vw*(l.flipX?-1:1),sy=h/vh*(l.flipY?-1:1),m=[c*sx,s*sx,-s*sy,c*sy,0,0];m[4]=x-m[0]*(vx+vw/2)-m[2]*(vy+vh/2);m[5]=y-m[1]*(vx+vw/2)-m[3]*(vy+vh/2);
    return{layer:l,x,y,bw,bh,m};
  });
  const left=Math.min(...layouts.map(p=>p.x-p.bw/2)),top=Math.min(...layouts.map(p=>p.y-p.bh/2)),right=Math.max(...layouts.map(p=>p.x+p.bw/2)),bottom=Math.max(...layouts.map(p=>p.y+p.bh/2));
  const nodes=layouts.flatMap(({layer:l,m},i)=>{
    const attrs={transform:matrix(m)};if(l.opacity!==1)attrs.opacity=String(l.opacity);
    let content=node('g',attrs,copySvgNodes(l.svg,{prefix:`part-${i}-`,color:l.svgOriginal===false?l.color:null}));
    if(l.svgOriginal===false)content.recolor=l.color;
    if(l.clipToPanel){const id=`merge-clip-${i}`,d=regionPath(printRegions(line,l,side,true)).map(c=>c.join(' ')).join(' ');return[node('defs',{},[node('clipPath',{id,clipPathUnits:'userSpaceOnUse'},[node('path',{d,'clip-rule':'nonzero'})])]),node('g',{'clip-path':`url(#${id})`},[content])];}
    return[content];
  });
  const svg=validateSvgAsset({viewBox:[left,top,right-left,bottom-top],nodes:simplify(nodes)}),p=readerPanel(line,line.panels.find(p=>p.id===layers[0].panel),side);
  return{id:uid(),type:'svg',name,panel:p.id,side,x:((left+right)/2-p.x)/p.w,y:((top+bottom)/2-p.y)/p.h,w:(right-left)/p.w,h:(bottom-top)/p.h,rotation:0,opacity:1,visible:true,color:layers[0].color,svgOriginal:true,svg};
}

// Keep the exact paint order: text and unselected layers split the merge runs.
export function compactSvgLayers(layers,line,ids=layers.map(l=>l.id),options={}){
  const selected=new Set(ids),result=[];let run=[];
  const flush=()=>{if(run.length)result.push(run.length>1?mergeSvgRun(run,line,options):run[0]);run=[];};
  for(const layer of layers){
    if(layer.type==='svg'&&selected.has(layer.id)&&layer.visible&&!layer.locked){if(run.length&&sideOf(run[0])!==sideOf(layer))flush();run.push(layer);}
    else{flush();result.push(layer);}
  }
  flush();return result;
}
