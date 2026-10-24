import * as THREE from 'three';

// Parametric visual interpretations of the supplied construction references.
// They are not production tooling: hidden locks, material behavior and tolerances
// still require a physical prototype before manufacturing.
export const RIGID_REFERENCE_CARTONS={
  'candy-twist-carton':{name:'糖果扭结盒',english:'TWIST END CANDY CARTON',family:'carton',category:'gift',printPanel:'front',description:'矩形盒身 · 四面收脊 · 双层燕尾 · 扭结外观近似',viewDirection:[1,.7,1.8],defaults:{length:110,depth:42,height:30,neckWidth:14,endRise:18,tailLength:22,tailFlare:6,glueWidth:12}},
  'triangle-slice-box':{name:'三角切片盒',english:'TRIANGULAR SLICE BOX',family:'tray',category:'gift',printPanel:'lid',description:'等腰三角底盖 · 三面矮壁 · 连体翻盖 · 双插舌',viewDirection:[1,1.5,1.5],defaults:{length:120,depth:104,height:32,lockTab:12}},
};

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function bounded(dims,key,otherwise,min,max){
  const value=dims[key]??otherwise;
  if(!Number.isFinite(value))throw new Error('结构参数需为有效数值');
  return clamp(value,min,max);
}
const add2=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const sub2=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const scale2=(v,s)=>[v[0]*s,v[1]*s];
const mid2=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
const centroid=points=>points.reduce((sum,p)=>[sum[0]+p[0]/points.length,sum[1]+p[1]/points.length],[0,0]);
function polygon(add,id,label,points,parent=null,hinge=null,angle=0,kind='flap'){
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
  const p=add(id,label,x,y,Math.max(...xs)-x,Math.max(...ys)-y,parent,hinge,angle,kind);
  p.points=points;p.inset=kind==='glue'||kind==='tuck'?-.65:0;return p;
}
function edgeFrame(a,b,inside){
  const delta=sub2(b,a),length=Math.hypot(...delta),e=scale2(delta,1/length),mid=mid2(a,b);
  let n=[-e[1],e[0]];
  if((inside[0]-mid[0])*n[0]+(inside[1]-mid[1])*n[1]>0)n=scale2(n,-1);
  return{e,n,length,sign:Math.sign(e[0]*n[1]-e[1]*n[0])};
}
function edgePanel(add,id,label,a,b,inside,depth,parent,angle,kind='flap',bevel=0){
  const frame=edgeFrame(a,b,inside),a2=add2(a,scale2(frame.n,depth)),b2=add2(b,scale2(frame.n,depth));
  const inset=Math.min(bevel,frame.length*.2,depth*.4),points=inset?[a,b,add2(b2,scale2(frame.e,-inset)),add2(a2,scale2(frame.e,inset))]:[a,b,b2,a2];
  const p=polygon(add,id,label,points,parent,{segment:[a,b]},angle??frame.sign*90,kind);
  return{panel:p,a2,b2,frame};
}
function signedFoldAngle(from,to,axis){
  const cross=new THREE.Vector3().crossVectors(from,to);
  return Math.atan2(axis.clone().normalize().dot(cross),from.dot(to))*180/Math.PI;
}

export function candyTwistSettings(dims){
  const{length:L,depth:W,height:H}=dims;
  const N=bounded(dims,'neckWidth',Math.min(14,W*.36),4,W-4);
  const E=bounded(dims,'endRise',Math.min(18,Math.min(W,H)*.55),4,1.5*Math.min(W,H));
  const T=bounded(dims,'tailLength',Math.min(22,L*.2),6,.6*L);
  const G=bounded(dims,'glueWidth',Math.min(12,W*.3),3,Math.min(24,.3*W));
  const F=bounded(dims,'tailFlare',Math.min(6,(W-N)/4),0,Math.max(0,(W-N)/2-1));
  const rx=(W-N)/2,rz=H/2,sf=Math.hypot(E,rz),ss=Math.hypot(E,rx);
  return{L,W,H,N,E,T,G,F,rx,rz,sf,ss,frontFold:180-Math.atan2(rz,E)*180/Math.PI,sideFold:180-Math.atan2(rx,E)*180/Math.PI,tailDepth:E+T};
}
function candyTwist(dims,add){
  const b=candyTwistSettings(dims),{L,W,H,N,E,T,G,F,rx,sf,ss,frontFold,sideFold,tailDepth}=b;
  const widths={front:W,right:H,back:W,left:H},labels={front:'正面',right:'右侧',back:'背面',left:'左侧'};
  const xs={};let cursor=G;
  for(const id of ['front','right','back','left']){xs[id]=cursor;cursor+=widths[id];}
  const Y=Math.max(sf+tailDepth,ss)+8,centerY=Y+L/2,parents={front:null,right:'front',back:'right',left:'back'};
  for(const id of ['front','right','back','left']){
    const parent=parents[id],p=add(id,labels[id],xs[id],Y,widths[id],L,parent,parent?{x:xs[id],y:Y,axis:'y'}:null,parent?90:0,'body');
    p.foldWindow=[0,.30];
  }
  const glue=add('glue','侧粘口',cursor,Y,G,L,'left',{x:cursor,y:Y,axis:'y'},90,'glue');glue.foldWindow=[0,.30];
  const mirror=points=>points.map(([x,y])=>[x,2*centerY-y]);
  for(const id of ['front','right','back','left'])for(const top of [true,false]){
    const suffix=top?'top':'bottom',x=xs[id],w=widths[id],edge=top?Y:Y+L,capAngle=(top?-1:1)*(id==='front'||id==='back'?frontFold:sideFold);
    let points;
    if(id==='front'||id==='back'){
      points=[[x,Y],[x+w,Y],[x+w-rx,Y-sf],[x+rx,Y-sf]];
    }else{
      points=[[x,Y],[x+w,Y],[x+w/2,Y-ss]];
    }
    if(!top)points=mirror(points);
    const cap=polygon(add,`${id}-${suffix}-cap`,`${labels[id]}${top?'上':'下'}收脊片`,points,id,{x,y:edge,axis:'x'},capAngle,'flap');
    cap.foldWindow=[.28,.66];cap.inset=0;
    if(id==='front'||id==='back'){
      const baseL=[x+rx,Y-sf],baseR=[x+w-rx,Y-sf],cx=x+w/2,outerY=Y-sf-tailDepth,notch=Math.min(4,tailDepth*.12);
      let tailPoints=[baseL,baseR,[cx+N/2+F,outerY],[cx,outerY+notch],[cx-N/2-F,outerY]];
      if(!top){tailPoints=mirror(tailPoints);baseL[1]=2*centerY-baseL[1];baseR[1]=2*centerY-baseR[1];}
      const tail=polygon(add,`${id}-${suffix}-tail`,`${labels[id]}${top?'上':'下'}燕尾片`,tailPoints,cap.id,{segment:[baseL,baseR]},-capAngle,'tuck');
      tail.foldWindow=[.66,1];tail.inset=id==='front'?.65:-.65;
    }
  }
  return{rootId:'front',rootRotationX:0,rootRotationZ:Math.PI/2,extraCreases:[]};
}

export function triangleSliceSettings(dims){
  const{length:L,depth:D,height:H}=dims;
  const K=bounded(dims,'lockTab',Math.min(12,H*.65),4,H-2);
  return{L,D,H,K};
}
function baseWallAngle(a,b,inside){
  const inward=sub2(inside,mid2(a,b));
  const axis=new THREE.Vector3(b[0]-a[0],-(b[1]-a[1]),0);
  const outward=new THREE.Vector3(-inward[0],inward[1],0).normalize();
  return signedFoldAngle(new THREE.Vector3(0,0,1),outward,axis);
}
function triangleSlice(dims,add){
  const{L,D,H,K}=triangleSliceSettings(dims),A=[0,D],B=[L,D],C=[L/2,0],center=[L/2,D/3];
  polygon(add,'base','三角底面',[A,B,C],null,null,0,'body');
  const front=edgePanel(add,'wall-front','前壁',A,B,center,H,'base',baseWallAngle(A,B,center),'body');
  const right=edgePanel(add,'wall-right','右斜壁',B,C,center,H,'base',baseWallAngle(B,C,center),'body');
  const left=edgePanel(add,'wall-left','左斜壁',C,A,center,H,'base',baseWallAngle(C,A,center),'body');
  for(const{panel}of[front,right,left]){panel.foldWindow=[0,.42];panel.inset=0;}
  const lidTip=add2(mid2(front.a2,front.b2),scale2(front.frame.n,D));
  const lid=polygon(add,'lid','三角翻盖',[front.a2,front.b2,lidTip],'wall-front',{segment:[front.a2,front.b2]},front.frame.sign*90,'lid');
  lid.foldWindow=[.42,.86];lid.inset=0;
  const lidCenter=centroid(lid.points);
  const specs=[['lid-right-tab','右盖插舌',front.b2,lidTip],['lid-left-tab','左盖插舌',lidTip,front.a2]];
  for(const[id,label,a,b]of specs){
    const tab=edgePanel(add,id,label,a,b,lidCenter,K,'lid',undefined,'tuck',Math.min(5,K*.35));
    tab.panel.foldWindow=[.86,1];tab.panel.inset=-.65;
  }
  return{rootId:'base',rootRotationX:Math.PI/2,rootRotationZ:0,extraCreases:[]};
}

export function makeRigidReferenceCarton(type,dimensions,add){
  if(type==='candy-twist-carton')return candyTwist(dimensions,add);
  if(type==='triangle-slice-box')return triangleSlice(dimensions,add);
  throw new Error('不支持的参考结构');
}
