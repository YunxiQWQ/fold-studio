import * as THREE from 'three';

// One construction, three reference proportions. Sizes describe the paper body,
// excluding the separate handles. The reference decoration is not reproduced.
export const PAPER_BAG_PRESETS={
  landscape:{name:'横款',length:425,depth:129,height:322,topFold:35,bottomFold:79,glueWidth:25,handleRise:100,handleSpan:180,handleStyle:'ribbon',handlePose:'dropped'},
  square:{name:'方款',length:330,depth:100,height:250,topFold:35,bottomFold:65,glueWidth:25,handleRise:95,handleSpan:140,handleStyle:'rope',handlePose:'raised'},
  portrait:{name:'竖款',length:220,depth:80,height:311,topFold:45,bottomFold:71,glueWidth:25,handleRise:100,handleSpan:105,handleStyle:'rope',handlePose:'dropped'},
};
export function paperBagSettings(dimensions){
  const {length:L,depth:D,height:H}=dimensions;
  const value=(key,fallback,min,max)=>{
    const v=dimensions[key]??fallback;
    if(!Number.isFinite(v))throw new Error('纸袋结构参数需为有效数值');
    return Math.max(min,Math.min(max,v));
  };
  const handleStyle=dimensions.handleStyle??'rope',handlePose=dimensions.handlePose??'raised';
  if(!['rope','ribbon'].includes(handleStyle)||!['raised','dropped'].includes(handlePose))throw new Error('不支持的纸袋提手类型');
  return{L,D,H,topFold:value('topFold',35,2,Math.min(100,H*.45)),bottomFold:value('bottomFold',D/2+15,Math.ceil(D/2+Math.min(2,D*.1)),Math.floor(D*.95)),glueWidth:value('glueWidth',25,2,Math.min(50,L*.3,D*.6)),handleRise:value('handleRise',95,5,Math.min(250,H*.8)),handleSpan:value('handleSpan',L*.42,4,L*.85),handleStyle,handlePose};
}
function circle(x,y,r){return Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return[x+r*Math.cos(a),y+r*Math.sin(a)];});}

export function makePaperBag(dimensions,add){
  const b=paperBagSettings(dimensions),{L,D,H,topFold:T,bottomFold:B,glueWidth:G}=b;
  b.bottomY=T+H;b.anchorDrop=Math.min(T*.55,H*.12);b.holeRadius=Math.min(2,L*.012,T*.09);
  const pieces=[];
  const body=(id,label,x,w,parent,angle,hingeX=x)=>{
    const p=add(id,label,x,T,w,H,parent,parent?{x:hingeX,y:T,axis:'y'}:null,angle);
    p.foldWindow=[0,.55];pieces.push(p);return p;
  };
  body('front','正面',G,L,null,0);
  body('right','右前',G+L,D/2,'front',90);
  body('right-rear','右后',G+L+D/2,D/2,'right',0);
  body('back','背面',G+L+D,L,'right-rear',90);
  body('left','左后',G+2*L+D,D/2,'back',90);
  body('left-front','左前',G+2*L+D+D/2,D/2,'left',0);
  const glue=body('glue','侧粘口',0,G,'front',-90,G);glue.kind='glue';glue.inset=-.65;
  for(const p of pieces){
    const face=p.id==='front'?'前':p.id==='back'?'后':'';
    const top=add(p.id+'-hem',face?face+'口折':'口折',p.x,0,p.w,T,p.id,{x:p.x,y:T,axis:'x'},-180,'flap');top.foldWindow=[.65,1];top.inset=.6;
    const bottom=add(p.id+'-bottom',face?face+'折底':'侧底',p.x,T+H,p.w,B,p.id,{hidden:true},0,'flap');bottom.inset=0;
    const right=p.id.startsWith('right'),left=p.id.startsWith('left')||p.id==='glue';
    bottom.bagBottom={side:right||left,start:right?G+L:p.id==='glue'?G-D:G+2*L+D};
    if((p.id==='front'||p.id==='back')&&b.handleStyle==='rope'){
      const anchors=[p.x+(L-b.handleSpan)/2,p.x+(L+b.handleSpan)/2];
      p.holes=anchors.map(x=>circle(x,T+b.anchorDrop,b.holeRadius));
      top.holes=anchors.map(x=>circle(x,T-b.anchorDrop,b.holeRadius));
    }
  }
  // This is one rectangular blank: every shared edge is a score, never a slit.
  const edgeMap=new Map(),extraCreases=[];
  for(const p of pieces)for(const [a,z]of [ [[p.x,0],[p.x,T]],[[p.x,T],[p.x,T+H]],[[p.x,T+H],[p.x,T+H+B]],[[p.x,T+H],[p.x+p.w,T+H]] ]){
    if(a[0]===z[0]&&(a[0]===0||a[0]===G+2*(L+D)))continue;
    const key=JSON.stringify([a,z]);edgeMap.set(key,[a,z]);
  }
  const score=(id,points)=>extraCreases.push({id,points,d:points.map((p,i)=>(i?'L':'M')+p.join(' ')).join('')});
  let n=0;for(const points of edgeMap.values())score('bag-score-'+n++,points);
  for(const [i,x]of [G+L,G+2*L+D].entries()){
    const rise=Math.min(D/2,H*.3),run=Math.min(D/2,L*.4);
    score('bag-gusset-'+i,[[x-run,T+H+B],[x,T+H],[x+D/2,T+H-rise],[x+D,T+H],[x+D+run,T+H+B]]);
  }
  return{rootId:'front',paperBag:b,extraCreases};
}

const bottomFraction=t=>Math.max(0,Math.min(1,(t-.55)/.4));
export function bagBottomPoint(x,y,panel,bag,t,cx,cy){
  const a=bottomFraction(t)*Math.PI/2,v=y-bag.bottomY,s=Math.sin(a),c=Math.cos(a);
  let px=x-cx,pz=-v*s;
  if(panel.bagBottom.side){
    const u=Math.max(0,Math.min(1,(x-panel.bagBottom.start)/bag.D));
    px+=v*(1-2*u)*s;
    pz=-Math.min(v,bag.D/2,bag.L*.45)*(1-Math.abs(2*u-1))*s;
  }
  // Separate the two overlapping glued leaves by one paper thickness.
  const gap=panel.id.startsWith('back')?.65:panel.id.startsWith('front')?0:1.3;
  return new THREE.Vector3(px,cy-bag.bottomY-v*c+gap*s,pz);
}
export function updateBagBottomGeometry(geometry,panel,dieline,t,cx,cy){
  const position=geometry.attributes.position;
  geometry.bagRest??=new Float32Array(position.array);
  const rest=geometry.bagRest;
  for(let i=0;i<position.count;i++){
    const x=rest[i*3]+cx,y=cy-rest[i*3+1],z=rest[i*3+2],mid=bagBottomPoint(x,y,panel,dieline.paperBag,t,cx,cy);
    const dx=bagBottomPoint(x+.001,y,panel,dieline.paperBag,t,cx,cy).sub(mid),dy=bagBottomPoint(x,y+.001,panel,dieline.paperBag,t,cx,cy).sub(mid),normal=dy.cross(dx).normalize();
    if(!normal.lengthSq())normal.set(0,0,1);
    mid.addScaledVector(normal,z);position.setXYZ(i,mid.x,mid.y,mid.z);
  }
  position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
}
export function bagBottomFrame(panel,dieline,t,cx,cy){
  const x=panel.x+panel.w/2,y=panel.y+panel.h/2,center=bagBottomPoint(x,y,panel,dieline.paperBag,t,cx,cy);
  const dx=bagBottomPoint(x+.001,y,panel,dieline.paperBag,t,cx,cy).sub(center),dy=bagBottomPoint(x,y+.001,panel,dieline.paperBag,t,cx,cy).sub(center);
  return{center,normal:dy.clone().cross(dx).normalize(),up:dy.negate().normalize()};
}

export function buildPaperBagHandles(dieline,cx,cy){
  const b=dieline.paperBag??dieline.ropeHandles,group=new THREE.Group();group.name=dieline.paperBag?'PaperBag_Handles':'RopeGable_Handles';
  for(const id of b.walls??['front','back']){
    const p=dieline.panels.find(p=>p.id===id),x=p.x+p.w/2-cx,y=cy-p.y-b.anchorDrop,span=b.handleSpan,rise=b.handleRise*(b.handlePose==='dropped'?-1:1),z=2.6;
    const tilt=b.uprightAngle??0,dy=rise*4/3*Math.cos(tilt),dz=rise*4/3*Math.sin(tilt);
    const curve=new THREE.CubicBezierCurve3(new THREE.Vector3(x-span/2,y,z),new THREE.Vector3(x-span*.68,y+dy,z+3+dz),new THREE.Vector3(x+span*.68,y+dy,z+3+dz),new THREE.Vector3(x+span/2,y,z));
    let geometry;
    if(b.handleStyle==='rope')geometry=new THREE.TubeGeometry(curve,64,Math.min(1.8,b.L*.008),10,false);
    else{
      const points=[],indices=[],width=Math.min(9,b.L*.035);
      for(let i=0;i<=64;i++){
        const p=curve.getPoint(i/64),t=curve.getTangent(i/64),side=new THREE.Vector3(t.y,-t.x,0).normalize();
        for(let j=0;j<8;j++){const a=j*Math.PI/4,v=p.clone().addScaledVector(side,Math.cos(a)*width/2);v.z+=Math.sin(a)*.45;points.push(v.x,v.y,v.z);}
        if(i<64)for(let j=0;j<8;j++){const a=i*8+j,z=i*8+(j+1)%8;indices.push(a,a+8,z,z,a+8,z+8);}
      }
      geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    }
    const material=new THREE.MeshStandardMaterial({color:b.handleStyle==='ribbon'?0xf5f3e9:0x39563c,roughness:.88});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=id+'_Handle';mesh.userData.bagWall=id;mesh.matrixAutoUpdate=false;group.add(mesh);
    if(b.eyelets)for(const [i,hx]of [x-span/2,x+span/2].entries()){
      const rim=new THREE.Mesh(new THREE.TorusGeometry(2.5,.4,8,24),new THREE.MeshStandardMaterial({color:0xb2ad8f,metalness:.65,roughness:.4}));rim.geometry.translate(hx,y,.5);rim.name=id+'_Eyelet_'+i;rim.userData.bagWall=id;rim.matrixAutoUpdate=false;group.add(rim);
    }
  }
  return group;
}
export function updatePaperBagHandles(group,transforms,t){
  group.visible=t>.55;
  for(const mesh of group.children){mesh.matrix.copy(transforms.get(mesh.userData.bagWall));mesh.matrixWorldNeedsUpdate=true;}
}
