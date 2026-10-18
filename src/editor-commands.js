import {sideOf,clone,uid} from './project.js';

export function displayPanel(dieline,panel,side){return{x:side==='inside'?dieline.minX+dieline.maxX-panel.x-panel.w:panel.x,y:panel.y,w:panel.w,h:panel.h};}
export function layerRect(layer,dieline){const panel=dieline.panels.find(p=>p.id===layer.panel),p=displayPanel(dieline,panel,sideOf(layer));const w=layer.w*p.w,h=layer.h*p.h,a=layer.rotation*Math.PI/180,bw=Math.abs(w*Math.cos(a))+Math.abs(h*Math.sin(a)),bh=Math.abs(w*Math.sin(a))+Math.abs(h*Math.cos(a)),x=p.x+layer.x*p.w,y=p.y+layer.y*p.h;return{x,y,w:bw,h:bh,left:x-bw/2,right:x+bw/2,top:y-bh/2,bottom:y+bh/2,panel:p};}
export function expandGroups(project,ids){const layers=project.layers.filter(l=>ids.includes(l.id)),groups=new Set(layers.map(l=>l.group).filter(Boolean));return project.layers.filter(l=>ids.includes(l.id)||(l.group&&groups.has(l.group)&&layers.some(s=>s.group===l.group&&sideOf(s)===sideOf(l)))).map(l=>l.id);}

export function editLayers(project,dieline,ids,command,value){
  const selected=project.layers.filter(l=>ids.includes(l.id)),layers=selected.filter(l=>!l.locked);let next=ids;
  if(command==='lock'){const lock=!selected.every(s=>s.locked);for(const l of selected)l.locked=lock;return next;}
  if(command==='unlock-all'){for(const l of project.layers)l.locked=false;return next;}
  if(!layers.length)return next;
  if(command==='delete'){const set=new Set(layers.map(l=>l.id));project.layers=project.layers.filter(l=>!set.has(l.id));return ids.filter(id=>!set.has(id));}
  if(command==='duplicate'){
    if(project.layers.length+layers.length>120)throw Error('当前工程最多支持 120 个图层');
    const groups=new Map();const copies=layers.map(l=>{const p=dieline.panels.find(p=>p.id===l.panel),limit=l.clipToPanel ? .92 : 1000,c={...clone(l),id:uid(),name:l.name+' 副本',x:Math.min(limit,l.x+3/p.w),y:Math.min(limit,l.y+3/p.h)};if(c.group){if(!groups.has(c.group))groups.set(c.group,uid());c.group=groups.get(c.group);}return c;});project.layers.push(...copies);return copies.map(l=>l.id);
  }
  if(command==='group'){
    if(layers.length<2)throw Error('请先选择至少两个图层');
    if(layers.some(l=>sideOf(l)!==sideOf(layers[0])))throw Error('组合内的图层需要位于同一印刷面');
    const group=uid();for(const l of layers)l.group=group;return next;
  }
  if(command==='ungroup'){for(const l of layers)delete l.group;return next;}
  if(['front','back','up','down'].includes(command)){
    const set=new Set(layers.map(l=>l.id)),rest=project.layers.filter(l=>!set.has(l.id));
    if(command==='front'||command==='back')project.layers=command==='front'?[...rest,...layers]:[...layers,...rest];
    else {const arr=project.layers;if(command==='up'){for(let i=arr.length-2;i>=0;i--)if(set.has(arr[i].id)&&!set.has(arr[i+1].id))[arr[i],arr[i+1]]=[arr[i+1],arr[i]];}else for(let i=1;i<arr.length;i++)if(set.has(arr[i].id)&&!set.has(arr[i-1].id))[arr[i],arr[i-1]]=[arr[i-1],arr[i]];}
    return next;
  }
  const rects=layers.map(l=>layerRect(l,dieline));
  const bounds={left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right)),top:Math.min(...rects.map(r=>r.top)),bottom:Math.max(...rects.map(r=>r.bottom))};
  if(command==='distribute-x'||command==='distribute-y'){
    if(layers.length<3)throw Error('等间距分布需要至少三个图层');
    const horizontal=command==='distribute-x',axis=horizontal?'x':'y',start=horizontal?'left':'top',end=horizontal?'right':'bottom',dim=horizontal?'w':'h';
    const ordered=layers.map((l,i)=>({l,r:rects[i]})).sort((a,b)=>a.r[start]-b.r[start]);
    const gap=(bounds[end]-bounds[start]-rects.reduce((n,r)=>n+r[dim],0))/(layers.length-1);let pos=bounds[start];
    for(const {l,r}of ordered){l[axis]+=(pos+r[dim]/2-r[axis])/r.panel[dim];pos+=r[dim]+gap;}return next;
  }
  layers.forEach((l,i)=>{
    const r=rects[i],p=r.panel,target=layers.length===1?{left:p.x,right:p.x+p.w,top:p.y,bottom:p.y+p.h}:bounds;
    if(command==='left')l.x+=(target.left-r.left)/p.w;
    if(command==='right')l.x+=(target.right-r.right)/p.w;
    if(command==='center-x')l.x+=((target.left+target.right)/2-r.x)/p.w;
    if(command==='top')l.y+=(target.top-r.top)/p.h;
    if(command==='bottom')l.y+=(target.bottom-r.bottom)/p.h;
    if(command==='center-y')l.y+=((target.top+target.bottom)/2-r.y)/p.h;
    if(command==='flip-x')l.flipX=!l.flipX;
    if(command==='flip-y')l.flipY=!l.flipY;
    if(command==='rotate-reset')l.rotation=0;
    if(command==='nudge'){l.x+=value.x/p.w;l.y+=value.y/p.h;}
    if(command==='opacity')l.opacity=value;
  });
  return next;
}
