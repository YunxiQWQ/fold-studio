import * as THREE from 'three';
import {RIGID_REFERENCE_CARTONS,makeRigidReferenceCarton} from './rigid-reference-cartons.js';

export const REFERENCE_CARTONS={
  'triangular-prism-carton':{name:'三角柱盒',english:'TRIANGULAR PRISM CARTON',family:'prism',category:'carton',printPanel:'front',description:'三面围合 · 带折边三角端盖 · 站放/平放 · 参考展开326×237mm',defaults:{length:200,depth:74,height:74,glueWidth:15,orientation:'lying'}},
  'rope-gable-carton':{name:'绳提手折顶礼盒',english:'ROPE HANDLE FOLD TOP CARTON',family:'carton',category:'gift',printPanel:'front',description:'斜折顶 · 圆绳提手 · 窄顶穿槽 · 异形锁底 · 参考展开885×403mm',defaults:{length:300,depth:120,height:202,roofDepth:61,topTab:56,bottomFlap:84,glueWidth:45,handleRise:100,handleSpan:120}},
  ...RIGID_REFERENCE_CARTONS,
};
const bounded=(dims,key,otherwise,min,max)=>{
  const value=dims[key]??otherwise;
  if(!Number.isFinite(value))throw new Error('结构参数需为有效数值');
  return Math.max(min,Math.min(max,value));
};
export function triangleSettings(dims){
  const L=dims.length,D=dims.depth,S=Math.max(dims.height,D/2+1),altitude=Math.sqrt(S*S-D*D/4),G=bounded(dims,'glueWidth',15,2,Math.min(40,S*.4)),reach=altitude*63/Math.sqrt(74*74-37*37),orientation=dims.orientation??'lying';
  if(!['lying','standing'].includes(orientation))throw new Error('不支持的三角盒摆放姿态');
  return{L,D,S,G,altitude,reach,orientation,angle:Math.acos(-D/(2*S))*180/Math.PI};
}
function polygon(add,id,label,points,parent,hinge,angle,kind='flap'){
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
  const p=add(id,label,x,y,Math.max(...xs)-x,Math.max(...ys)-y,parent,hinge,angle,kind);p.points=points;p.inset=0;return p;
}
function roundedTop(p,r){
  r=Math.min(r,p.w/4,p.h*.7);const{x,y,w,h}=p,pts=[[x,y+h],[x,y+r]];
  for(let i=1;i<=8;i++){const a=Math.PI+i*Math.PI/16;pts.push([x+r+r*Math.cos(a),y+r+r*Math.sin(a)]);}
  pts.push([x+w-r,y]);for(let i=1;i<=8;i++){const a=-Math.PI/2+i*Math.PI/16;pts.push([x+w-r+r*Math.cos(a),y+r+r*Math.sin(a)]);}
  pts.push([x+w,y+h]);p.points=pts;
}
function ear(add,id,parent,a,b,inside,w){
  const edge=new THREE.Vector2(b[0]-a[0],b[1]-a[1]),length=edge.length(),e=edge.clone().normalize(),n=new THREE.Vector2(-e.y,e.x),mid=new THREE.Vector2((a[0]+b[0])/2,(a[1]+b[1])/2);
  if(n.dot(new THREE.Vector2(...inside).sub(mid))>0)n.negate();
  const q0=new THREE.Vector2(...a).addScaledVector(e,Math.min(4,length*.12)),q1=new THREE.Vector2(...b).addScaledVector(e,-Math.min(w*1.6,length*.3));
  const p=polygon(add,id,'端盖折边',[q0.toArray(),q1.toArray(),q1.clone().addScaledVector(n,w*.8).toArray(),q0.clone().addScaledVector(n,w*.65).toArray()],parent,{segment:[q0.toArray(),q1.toArray()]},90*Math.sign(e.x*n.y-e.y*n.x),'glue');p.foldWindow=[.68,1];p.inset=-.55;
  return[q0.toArray(),q1.toArray()];
}
function triangularPrism(dims,add){
  const b=triangleSettings(dims),{L,D,S,G,reach:A,altitude}=b,x=A,y=G+S;
  add('base','底面',x,y,L,D);
  const front=add('front','展示斜面',x,G,L,S,'base',{x,y,axis:'x'},-b.angle);front.foldWindow=[0,.48];
  const back=add('back','背斜面',x,y+D,L,S,'base',{x,y:y+D,axis:'x'},b.angle);back.foldWindow=[.08,.58];
  const glue=add('glue','接缝粘舌',x,0,L,G,'front',{x,y:G,axis:'x'},-2*(180-b.angle),'glue');glue.foldWindow=[.76,1];glue.inset=-.6;
  const bevel=Math.min(4,L*.04,G*.4);glue.points=[[x,G],[x+bevel,0],[x+L-bevel,0],[x+L,G]];
  const tipHalf=D/2*(1-A/altitude),w=Math.min(8,D*.12,L*.08);
  for(const [id,hx,sign,angle]of [['left-end',x,-1,-90],['right-end',x+L,1,90]]){
    const a=[hx,y],tip1=[hx+sign*A,y+D/2-tipHalf],tip2=[hx+sign*A,y+D/2+tipHalf],z=[hx,y+D];
    const cap=polygon(add,id,'三角端盖',[a,tip1,tip2,z],'base',{x:hx,y,axis:'y'},angle);cap.foldWindow=[.40,.76];
    const inside=[hx+sign*A*.3,y+D/2],top=ear(add,id+'-upper-ear',id,a,tip1,inside,w),bottom=ear(add,id+'-lower-ear',id,tip2,z,inside,w);
    cap.points=[a,...top,tip1,tip2,...bottom,z];
  }
  return{rootId:'base',triangle:b,rootRotationX:Math.PI/2,rootRotationZ:b.orientation==='standing'?Math.PI/2:0};
}

export function ropeGableSettings(dims){
  const {length:L,depth:D,height:H}=dims,F=bounded(dims,'topTab',56,4,D*.8),run=(D-F)/2,R=bounded(dims,'roofDepth',61,run+2,Math.max(run+3,Math.min(240,H))),rise=Math.sqrt(R*R-run*run),B=bounded(dims,'bottomFlap',84,D/2+2,D*.95),G=bounded(dims,'glueWidth',45,3,Math.min(65,L*.3,D*.6));
  return{L,D,H,F,R,B,G,run,rise,angle:Math.asin(run/R)*180/Math.PI,bodyY:F+R,handleRise:bounded(dims,'handleRise',100,10,250),handleSpan:bounded(dims,'handleSpan',120,8,L*.8)};
}
function rectangleHole(cx,cy,w,h){return[[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];}
function circle(cx,cy,r){return Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return[cx+r*Math.cos(a),cy+r*Math.sin(a)];});}
function ropeGable(dims,add){
  const b=ropeGableSettings(dims),{L,D,H,F,R,B,G,run,rise,angle,bodyY:Y}=b;
  const parts=[['front','正面',G,L,null,0],['right','右侧',G+L,D,'front',90],['back','背面',G+L+D,L,'right',90],['left','左侧',G+2*L+D,D,'back',90],['glue','侧粘口',0,G,'front',-90]],extraCreases=[];
  const score=(id,points)=>extraCreases.push({id,points,d:points.map((p,i)=>(i?'L':'M')+p.join(' ')).join('')});
  for(const [id,label,x,w,parent,a]of parts){
    const p=add(id,label,x,Y,w,H,parent,parent?{x:id==='glue'?G:x,y:Y,axis:'y'}:null,a,id==='glue'?'glue':'body');p.foldWindow=[0,.32];p.inset=id==='glue'?-.65:0;
    if(id==='front'||id==='back'){
      const roof=add(id+'-roof',label+'折顶',x,F,w,R,id,{x,y:Y,axis:'x'},-angle,'flap');roof.foldWindow=[.38,.72];roof.inset=0;
      roof.holes=[x+(L-b.handleSpan)/2,x+(L+b.handleSpan)/2].map(px=>circle(px,F+R*.4,Math.min(2.3,L*.015)));
      const cap=add(id+'-top','顶盖折片',x,F/2,L,F/2,roof.id,{x,y:F,axis:'x'},-(90-angle),'flap');cap.foldWindow=[.70,.91];cap.inset=0;
      const inner=add(id+'-return','顶盖折返',x,0,L,F/2,cap.id,{x,y:F/2,axis:'x'},-180,'flap');inner.foldWindow=[.87,1];inner.inset=.65;roundedTop(inner,Math.min(10,F*.18));
    }else if(id!=='glue'){
      const left=[x,Y],right=[x+D,Y],lt=[x+run,F],rt=[x+D-run,F];
      score(id+'-roof-valleys',[left,lt]);score(id+'-roof-valleys-rear',[rt,right]);score(id+'-roof-base',[left,right]);
      const center=polygon(add,id+'-gable','侧顶折面',[left,lt,rt,right],id,{hidden:true},0);center.roofGusset={start:x,role:'center'};
      center.holes=[rectangleHole(x+D/2,F+R*.21,1.6,Math.max(2,R*.42-4))];
      for(const [suffix,points]of [['front',[[x,Y],[x,F],lt]],['rear',[[x+D,Y],rt,[x+D,F]]]]){
        const corner=polygon(add,id+'-roof-'+suffix,'侧顶折角',points,id,{hidden:true},0);corner.roofGusset={start:x,role:suffix};
      }
      const tab=add(id+'-top','穿槽顶舌',x+run,0,F,F,center.id,{x:x+run,y:F,axis:'x'},-90,'flap');tab.foldWindow=[.64,.88];tab.inset=-.7;tab.hingeOffset={y:rise-R,height:R,angle:angle*Math.PI/180,window:[.38,.72]};roundedTop(tab,Math.min(9,F*.18));
      tab.holes=[rectangleHole(x+D/2,F*.7,1.6,Math.max(2,F*.6-4))];
    }else{
      const extra=add('glue-roof','折顶粘口',0,F,G,R,'glue',{hidden:true},0,'glue');extra.inset=0;extra.roofGusset={start:G-D,role:'rear'};
    }
    if(id!=='glue'){
      const base=add(id+'-bottom',id==='front'?'主锁底':id==='back'?'副锁底':'侧锁底',x,Y+H,w,B,id,{x,y:Y+H,axis:'x'},90,'flap'),ey=Y+H;
      if(id==='front'){
        const notch=L*.17,step=Math.min(24,B*.29),points=[[x,ey],[x+L,ey],[x+L,ey+B]];
        for(const q of [.70,.30])points.push([x+L*q+notch/2,ey+B],[x+L*q+notch/2,ey+B-step],[x+L*q-notch/2,ey+B-step],[x+L*q-notch/2,ey+B]);
        points.push([x,ey+B]);base.points=points;base.foldWindow=[.45,.78];base.inset=0;
      }else if(id==='back'){
        const bevel=Math.min(D/2,L*.23),notch=Math.min(60,L*.2),step=Math.min(24,B*.29);
        base.points=[[x,ey],[x+L,ey],[x+L-bevel,ey+B*.7],[x+L-bevel,ey+B],[x+L/2+notch/2,ey+B],[x+L/2+notch/2,ey+B-step],[x+L/2-notch/2,ey+B-step],[x+L/2-notch/2,ey+B],[x+bevel,ey+B],[x+bevel,ey+B*.7]];base.foldWindow=[.34,.60];base.inset=-.65;
      }else{
        base.points=id==='right'?[[x,ey],[x+w,ey],[x+w,ey+B],[x+w*.5,ey+B],[x+w*.5,ey+B*.7]]:[[x,ey],[x+w,ey],[x+w*.5,ey+B*.7],[x+w*.5,ey+B],[x,ey+B]];base.foldWindow=[.15,.42];base.inset=-1.3;
      }
    }
  }
  return{rootId:'front',ropeGable:b,extraCreases,ropeHandles:{L,handleStyle:'rope',handlePose:'raised',handleRise:b.handleRise,handleSpan:b.handleSpan,anchorDrop:R*.4,walls:['front-roof','back-roof'],uprightAngle:angle*Math.PI/180,eyelets:true}};
}
export function makeReferenceCarton(type,dimensions,add){
  const panels=[],remember=(...args)=>{const p=add(...args);panels.push(p);return p;};
  const result=type==='triangular-prism-carton'?triangularPrism(dimensions,remember):type==='rope-gable-carton'?ropeGable(dimensions,remember):makeRigidReferenceCarton(type,dimensions,remember),edges=new Map();
  for(const p of panels)for(let i=0;i<p.points.length;i++){const a=p.points[i],b=p.points[(i+1)%p.points.length],key=[a.join(','),b.join(',')].sort().join('|');const entry=edges.get(key)??{count:0,line:[a,b]};entry.count++;edges.set(key,entry);}
  result.nonCutEdges=[...edges.values()].filter(e=>e.count>1).map(e=>e.line);return result;
}

export function roofGussetPoint(x,y,panel,dieline,t,cx,cy){
  const b=dieline.ropeGable,f=Math.max(0,Math.min(1,(t-.38)/.34)),h=b.bodyY-y,u=x-panel.roofGusset.start,edge=b.run*h/b.R,theta=b.angle*Math.PI/180,k=Math.sin(theta*f)/Math.sin(theta);
  let px=x-cx,z=0;
  if(panel.roofGusset.role!=='center'){
    const front=panel.roofGusset.role==='front',d=Math.max(0,front?edge-u:u-(b.D-edge));
    px+=(front?1:-1)*d*k;
    z=-Math.sin(Math.PI*Math.min(1,d/Math.max(.001,edge)))*Math.min(5,b.R*.08)*f;
  }
  return new THREE.Vector3(px,cy-y+h*(Math.cos(theta*f)-1),z);
}
// Add interior vertices so the tucked triangular paper remains a real pleat
// rather than collapsing its whole surface to a single line.
export function subdivideRoofCorners(geometry){
  const p=geometry.attributes.position,uv=geometry.attributes.uv,positions=[],coords=[],groups=[];
  for(const group of geometry.groups){
    const start=positions.length/3;
    for(let j=group.start;j<group.start+group.count;j+=3){
      const vertices=[0,1,2].map(k=>({p:new THREE.Vector3().fromBufferAttribute(p,j+k),uv:new THREE.Vector2().fromBufferAttribute(uv,j+k)}));
      const mid=(a,b)=>({p:a.p.clone().add(b.p).multiplyScalar(.5),uv:a.uv.clone().add(b.uv).multiplyScalar(.5)}),[a,b,c]=vertices,ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
      for(const tri of [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]])for(const v of tri){positions.push(...v.p.toArray());coords.push(...v.uv.toArray());}
    }
    groups.push({start,count:positions.length/3-start,materialIndex:group.materialIndex});
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(coords,2));for(const group of groups)g.addGroup(group.start,group.count,group.materialIndex);g.computeVertexNormals();geometry.dispose();return g;
}
export function updateRoofGussetGeometry(g,panel,dieline,t,cx,cy){
  g.roofRest??=new Float32Array(g.attributes.position.array);const rest=g.roofRest,pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=rest[i*3]+cx,y=cy-rest[i*3+1],mid=roofGussetPoint(x,y,panel,dieline,t,cx,cy),dx=roofGussetPoint(x+.001,y,panel,dieline,t,cx,cy).sub(mid),dy=roofGussetPoint(x,y+.001,panel,dieline,t,cx,cy).sub(mid),n=dy.cross(dx).normalize();if(!n.lengthSq())n.set(0,0,1);mid.addScaledVector(n,rest[i*3+2]);pos.setXYZ(i,mid.x,mid.y,mid.z);
  }
  pos.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
}
export function roofGussetFrame(panel,dieline,t,cx,cy){
  const x=panel.points.reduce((n,p)=>n+p[0],0)/panel.points.length,y=panel.points.reduce((n,p)=>n+p[1],0)/panel.points.length,center=roofGussetPoint(x,y,panel,dieline,t,cx,cy),dx=roofGussetPoint(x+.001,y,panel,dieline,t,cx,cy).sub(center),dy=roofGussetPoint(x,y+.001,panel,dieline,t,cx,cy).sub(center);
  return{center,normal:dy.clone().cross(dx).normalize(),up:dy.negate().normalize()};
}
