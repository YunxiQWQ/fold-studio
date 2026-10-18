import {inPolygon} from './geometry.js';

// A panel is a positioning reference; artwork normally spans the entire printable net.
export function printRegions(dieline,layer,side='outside',display=false){
  const panels=layer.clipToPanel?dieline.panels.filter(p=>p.id===layer.panel):dieline.panels;
  return panels.map(p=>p.points.map(([x,y])=>[display&&side==='inside'?dieline.minX+dieline.maxX-x:x,y]));
}
export function inPrintRegions(regions,x,y){return regions.some(points=>inPolygon(x,y,points));}
export function regionPath(regions){
  const commands=[];
  for(const points of regions){
    // Give every subpath the same winding so overlapping panels form a union, not a hole.
    const area=points.reduce((n,[x,y],i)=>{const q=points[(i+1)%points.length];return n+x*q[1]-q[0]*y;},0),ordered=area<0?[...points].reverse():points;
    ordered.forEach(([x,y],i)=>commands.push([i?'L':'M',x,y]));commands.push(['Z']);
  }
  return commands;
}
