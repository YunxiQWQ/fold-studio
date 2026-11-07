const roles=['start','center','end'];
export const offsetSnapBox=(box,x,y)=>({left:box.left+x,right:box.right+x,top:box.top+y,bottom:box.bottom+y});
const values=(box,axis)=>axis==='x'?[box.left,(box.left+box.right)/2,box.right]:[box.top,(box.top+box.bottom)/2,box.bottom];
const priority=kind=>kind==='object'?0:kind==='panel'?1:kind==='sheet'?2:3;

function candidates(box,references,axis,{point,spacing,limit}){
  const anchors=point?[values(box,axis)[0]]:values(box,axis),list=[];
  for(const ref of references)for(const [j,value]of values(ref.bounds,axis).entries())for(const [i,anchor]of anchors.entries()){
    if(Math.abs(value-anchor)>limit)continue;
    list.push({id:`${axis}:${ref.id}:${j}:${i}`,axis,value,delta:value-anchor,ref,role:roles[j],rank:priority(ref.kind)+(i===j?.01:.03)+(j===1?0:.001)});
  }
  if(!spacing||point)return list;
  const start=axis==='x'?'left':'top',end=axis==='x'?'right':'bottom',crossStart=axis==='x'?'top':'left',crossEnd=axis==='x'?'bottom':'right';
  const objects=references.filter(ref=>ref.kind==='object'&&ref.bounds[crossStart]<=box[crossEnd]&&ref.bounds[crossEnd]>=box[crossStart]).sort((a,b)=>a.bounds[start]-b.bounds[start]);
  const size=box[end]-box[start];
  for(let i=0;i<objects.length-1;i++){
    const a=objects[i],b=objects[i+1],gap=b.bounds[start]-a.bounds[end];
    if(gap<0||a.bounds[crossStart]>b.bounds[crossEnd]||b.bounds[crossStart]>a.bounds[crossEnd])continue;
    const between=(gap-size)/2;
    for(const [placement,value,distance]of [['after',b.bounds[end]+gap,gap],['before',a.bounds[start]-gap-size,gap],...(between>=0?[['between',a.bounds[end]+between,between]]:[])]){
      if(Math.abs(value-box[start])>limit)continue;
      list.push({id:`${axis}:gap:${a.id}:${b.id}:${placement}`,axis,value,delta:value-box[start],rank:3,spacing:{a,b,placement,gap:distance}});
    }
  }
  return list;
}

// All distances are CSS screen pixels. The same tolerance applies at every
// zoom, with a larger release radius to avoid jumping between nearby guides.
export function solveSvgSnap(box,references,{threshold=6,release=9,previous={},constraint=null,point=false,spacing=true}={}){
  const limit=Math.max(threshold,release),lists={x:candidates(box,references,'x',{point,spacing,limit}),y:candidates(box,references,'y',{point,spacing,limit})};
  const choose=(list,id)=>{
    const old=list.find(item=>item.id===id&&Math.abs(item.travel)<=release);if(old)return old;
    let best=null;
    for(const item of list){
      if(Math.abs(item.travel)>threshold)continue;
      if(!best||((Math.abs(item.travel)-Math.abs(best.travel))||(item.rank-best.rank)||item.id.localeCompare(best.id))<0)best=item;
    }
    return best;
  };
  let dx=0,dy=0,selected=[];
  if(constraint){
    const length=Math.hypot(constraint.x,constraint.y),direction={x:constraint.x/length,y:constraint.y/length};
    if(!Number.isFinite(length)||length<1e-10)return {dx,dy,guides:[],previous:{}};
    const possible=[];
    for(const axis of ['x','y'])if(Math.abs(direction[axis])>1e-8)for(const item of lists[axis])possible.push({...item,travel:item.delta/direction[axis]});
    const match=choose(possible,previous.active);
    if(match){dx=direction.x*match.travel;dy=direction.y*match.travel;selected=[match];
      // Also display another exactly aligned axis without pulling the object
      // off its Shift/resize constraint.
      for(const axis of ['x','y'])if(axis!==match.axis){const delta=axis==='x'?dx:dy,aligned=lists[axis].filter(item=>Math.abs(item.delta-delta)<.001).sort((a,b)=>a.rank-b.rank)[0];if(aligned)selected.push(aligned);}
    }
    return {dx,dy,guides:selected,previous:match?{active:match.id}:{}};
  }
  const next={};
  for(const axis of ['x','y']){
    const match=choose(lists[axis].map(item=>({...item,travel:item.delta})),previous[axis]);
    if(match){if(axis==='x')dx=match.delta;else dy=match.delta;selected.push(match);next[axis]=match.id;}
  }
  return {dx,dy,guides:selected,previous:next};
}
