// Reference construction: four 80 mm bays, 13 mm glue seam, 160 mm body,
// and opposed 80 + 16 mm tuck closures. Curved scores are quadratic curves.
export const CURVE_STEPS=40;

export function skinInterval(region,index,v){
  const q=.5*(1-v)**2;
  if(region==='lower')return[index+q,index+1-q];
  if(region==='glue')return[-index,0];
  return[Math.max(0,index-q),Math.min(4,index+q)];
}

export function makeCurvedCarton(add,dimensions){
  const L=dimensions.length,H=dimensions.height,G=Math.min(13,L*.25);
  const tuck=Math.min(16,L*.2),cover=L,y=L+tuck;
  const body={x:G,y,w:4*L,h:H,side:L,glue:G};
  const curves=[];
  const sample=(j,right)=>Array.from({length:CURVE_STEPS+1},(_,i)=>{
    const v=i/CURVE_STEPS,q=.5*(1-v)**2;
    return[G+L*(j+(right?1-q:q)),y+v*H];
  });
  for(let j=0;j<4;j++)for(const right of [false,true]){
    const points=sample(j,right),a=points[0],b=points.at(-1);
    curves.push({id:`arc-${j}-${right?'right':'left'}`,points,
      d:`M${a.join(' ')}Q${b[0]} ${y+H/2} ${b.join(' ')}`});
  }
  const addSkin=(id,label,region,index)=>{
    const rows=Array.from({length:CURVE_STEPS+1},(_,i)=>{
      const v=i/CURVE_STEPS,[a,b]=skinInterval(region,index,v);
      return[[G+a*L,y+v*H],[G+b*L,y+v*H]];
    });
    const points=[...rows.map(r=>r[0]),...rows.map(r=>r[1]).reverse()];
    const xs=points.map(p=>p[0]);
    const p=add(id,label,Math.min(...xs),y,Math.max(...xs)-Math.min(...xs),H,
      id==='front'?null:'front',id==='front'?null:{hidden:true},0,region==='glue'?'glue':'body');
    p.points=points;p.curvedSkin={region,index};p.inset=0;
    return p;
  };
  ['front','right','back','left'].forEach((id,j)=>addSkin(id,['正面弧瓣','右侧弧瓣','背面弧瓣','左侧弧瓣'][j],'lower',j));
  for(let j=0;j<=4;j++)addSkin(`shoulder-${j}`,j===0||j===4?'接缝半弧瓣':`上缘弧瓣 ${j}`,'upper',j);
  addSkin('glue','侧粘口','glue',G/L);
  // A straight registration/folding score is also present in the source.
  curves.push({id:'center-score',points:[[G+2*L,y],[G+2*L,y+H]],d:`M${G+2*L} ${y}V${y+H}`});
  curves.push({id:'glue-score',points:Array.from({length:CURVE_STEPS+1},(_,i)=>[G,y+H*i/CURVE_STEPS]),d:`M${G} ${y}V${y+H}`});

  const roundTab=(p,top)=>{
    const r=Math.min(5,p.w*.1,p.h*.45),base=top?p.y+p.h:p.y,tip=top?p.y:p.y+p.h,dir=top?-1:1;
    const pts=[[p.x,base],[p.x,tip-dir*r]];
    const arc=(cx,cy,a,b)=>{for(let i=1;i<=8;i++){const t=a+(b-a)*i/8;pts.push([cx+r*Math.cos(t),cy+r*Math.sin(t)]);}};
    if(top){arc(p.x+r,tip+r,Math.PI,1.5*Math.PI);pts.push([p.x+p.w-r,tip]);arc(p.x+p.w-r,tip+r,1.5*Math.PI,2*Math.PI);}
    else{arc(p.x+r,tip-r,Math.PI,Math.PI/2);pts.push([p.x+p.w-r,tip]);arc(p.x+p.w-r,tip-r,Math.PI/2,0);}
    pts.push([p.x+p.w,base]);p.points=pts;
  };
  const closure=(id,label,u,w,top,main,parent)=>{
    const edge=top?y:y+H,h=main?cover:tuck,x=G+u*L;
    const p=add(id,label,x,top?edge-h:edge,w,h,parent,{x,y:edge,axis:'x'},top?-90:90,main?'flap':'dust');
    p.bodyAttachment=true;p.inset=main?0:-.65;p.foldWindow=main?[.66,.94]:[.42,.76];
    if(!main)roundTab(p,top);
    if(main){
      const tab=add(`${id}-tuck`,top?'上圆角插舌':'下圆角插舌',x,top?p.y-tuck:p.y+h,w,tuck,id,{x,y:top?p.y:p.y+h,axis:'x'},top?-90:90,'tuck');
      tab.foldWindow=[.86,1];roundTab(tab,top);
      // The rotated upper square narrows at its corners immediately below
      // the rim. Taper the tongue shoulders so they tuck behind those curves.
      const taper=Math.min(6,w*.075),hingeY=tab.hinge.y;
      tab.points=tab.points.map(([px,py])=>[x+w/2+(px-x-w/2)*(1-2*taper*Math.abs(py-hingeY)/(w*tuck)),py]);
    }
  };
  closure('top-seam-left','左上半防尘翼',0,L/2,true,false,'shoulder-0');
  closure('top-dust','上防尘翼',1.5,L,true,false,'shoulder-2');
  closure('top','顶盖',2.5,L,true,true,'shoulder-3');
  closure('top-seam-right','右上半防尘翼',3.5,L/2,true,false,'shoulder-4');
  closure('bottom-front','前下防尘翼',0,L,false,false,'front');
  closure('bottom-back','后下防尘翼',2,L,false,false,'back');
  closure('bottom','底盖',3,L,false,true,'left');
  return{body,curves};
}

// Cross sections retain the sheet's perimeter. Alternating edge lengths follow
// the two quadratic scores, becoming a square below and a 45° square above.
// This is a geometric preview of curved scoring, not a material/contact solver.
export function curvedSection(v,fold){
  const q=.5*(1-v)**2,knots=[0];
  for(let j=0;j<4;j++)knots.push(j+q,j+1-q);
  knots.push(4);
  const unique=knots.filter((u,i)=>!i||u-knots[i-1]>1e-10);
  const nodes=[[0,0]];
  for(let i=1;i<unique.length;i++){
    const a=unique[i-1],b=unique[i],mid=(a+b)/2,j=Math.floor(mid),[lo,hi]=skinInterval('lower',j,v);
    const angle=mid>=lo&&mid<=hi?j*Math.PI/2:(Math.round(mid)*Math.PI/2-Math.PI/4);
    const t=angle*fold,n=nodes.at(-1);nodes.push([n[0]+(b-a)*Math.cos(t),n[1]-(b-a)*Math.sin(t)]);
  }
  // Keep the sheet centered throughout the wrapping animation.
  const at=u=>{
    let i=1;while(i<unique.length-1&&unique[i]<u)i++;
    const t=(u-unique[i-1])/(unique[i]-unique[i-1]),a=nodes[i-1],b=nodes[i];
    return[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
  };
  const a=at(0),b=at(2),center=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  // Center in the flat state is the center of all four bays.
  center[0]+=(2-center[0])*(1-fold);
  center[1]*=fold;
  return{at,center};
}

const sectionCache=new WeakMap();
export function curvedPoint(x,y,dieline,progress,cx,cy){
  const b=dieline.curvedBody,v=Math.max(0,Math.min(1,(y-b.y)/b.h));
  const f=Math.max(0,Math.min(1,progress/.72)),u=(x-b.x)/b.side;
  let cache=sectionCache.get(dieline);if(!cache||cache.fold!==f){cache={fold:f,rows:new Map()};sectionCache.set(dieline,cache);}
  let section=cache.rows.get(v);if(!section){section=curvedSection(v,f);cache.rows.set(v,section);}
  // Gradually turn the glue flap into the last face; no snap at full closure.
  const at=u=>{
    const pt=section.at(u);if(u>=0)return pt;
    const end=section.at(u+4),start=section.at(0),last=section.at(4),t=f**4;
    return[pt[0]*(1-t)+(end[0]+start[0]-last[0])*t,pt[1]*(1-t)+(end[1]+start[1]-last[1])*t];
  };
  const pt=at(u),inset=u<0?-.65*f:0;
  const eps=1e-5,a=at(u-eps),c=at(u+eps),dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz)||1;
  return[(pt[0]-section.center[0])*b.side+(b.x+2*b.side-cx)*(1-f)-dz/len*inset,cy-y,(pt[1]-section.center[1])*b.side+dx/len*inset];
}
