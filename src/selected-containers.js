import * as THREE from 'three';
import {SOURCE_CONTAINERS} from './source-containers.generated.js';

export const SELECTED_CONTAINERS={
  'blank-metal-tin':{name:'空白圆形金属罐',english:'BLANK ROUND METAL TIN',family:'container',category:'container',printPanel:'body',description:'C1 · 独立重建 · 金属卷边 · 平盖与环绕标签',defaults:{length:82,depth:82,height:105}},
  'food-tin-tall':{name:'食品罐头 · 高罐',english:'FOOD TIN · TALL',family:'container',category:'container',printPanel:'body',sourceMesh:'food-tin-tall',labelBand:[.08,.90],description:'C2 · Poly Haven CC0 网格 · 高罐与环绕标签',defaults:{length:74,depth:74,height:72}},
  'food-tin-low':{name:'食品罐头 · 矮罐',english:'FOOD TIN · LOW',family:'container',category:'container',printPanel:'body',sourceMesh:'food-tin-low',labelBand:[.10,.87],description:'C2 · Poly Haven CC0 网格 · 宽口矮罐与环绕标签',defaults:{length:86,depth:86,height:38}},
  'screw-metal-tin':{name:'旋盖金属罐',english:'SCREW CAP METAL TIN',family:'container',category:'container',printPanel:'body',sourceMesh:'screw-metal-tin',labelBand:[.08,.76],description:'C3 · Poly Haven CC0 网格 · 罐肩与白色旋盖',defaults:{length:88,depth:88,height:131}},
};

// Clip the original mesh at the printable band and seam. Original vertices
// survive elsewhere; generated intersection vertices keep both halves joined.
function clip(poly,value,keep){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],va=value(a),vb=value(b),ina=keep(va),inb=keep(vb);
    if(ina)out.push(a);
    if(ina!==inb){const t=va/(va-vb);out.push({p:a.p.map((x,k)=>x+(b.p[k]-x)*t),n:a.n.map((x,k)=>x+(b.n[k]-x)*t),u:a.u+(b.u-a.u)*t});}
  }
  return out;
}
const cache=new Map();
function sourceParts(type){
  if(cache.has(type))return cache.get(type);
  const info=SELECTED_CONTAINERS[type],source=SOURCE_CONTAINERS[info.sourceMesh],[lo,hi]=info.labelBand,body=[],hardware=[];
  const append=(target,poly)=>{for(let j=1;j<poly.length-1;j++)target.push(poly[0],poly[j],poly[j+1]);};
  for(let i=0;i<source.indices.length;i+=3){
    const tri=source.indices.slice(i,i+3).map(k=>{const p=source.positions.slice(3*k,3*k+3),n=source.normals.slice(3*k,3*k+3);return{p,n,u:Math.atan2(p[0],p[2])/(2*Math.PI)+.5};});
    append(hardware,clip(tri,v=>v.p[1]-lo,t=>t<0));
    append(hardware,clip(tri,v=>v.p[1]-hi,t=>t>0));
    let band=clip(clip(tri,v=>v.p[1]-lo,t=>t>=0),v=>v.p[1]-hi,t=>t<=0);
    if(band.length<3)continue;
    if(Math.max(...band.map(v=>v.u))-Math.min(...band.map(v=>v.u))>.5)band=band.map(v=>({...v,u:v.u<.5?v.u+1:v.u}));
    append(body,clip(band,v=>v.u-1,t=>t<=0));
    append(body,clip(band,v=>v.u-1,t=>t>=0).map(v=>({...v,u:v.u-1})));
  }
  const result={body,hardware};cache.set(type,result);return result;
}

export function createSourceRibbonGeometry(type,panel,dieline){
  const vertices=sourceParts(type).body,count=vertices.length,positions=new Float32Array(count*2*3),normals=new Float32Array(positions.length),uv=new Float32Array(count*4);
  const [lo,hi]=SELECTED_CONTAINERS[type].labelBand;
  for(let side=0;side<2;side++)for(let i=0;i<count;i++){
    const j=i+side*count,v=vertices[i],x=panel.x+v.u*panel.w,y=panel.y+(hi-v.p[1])/(hi-lo)*panel.h;
    uv[j*2]=(x-dieline.minX)/dieline.width;uv[j*2+1]=1-(y-dieline.minY)/dieline.height;
  }
  const indices=[];for(let i=0;i<count;i+=3)indices.push(i,i+1,i+2);
  for(let i=0;i<count;i+=3)indices.push(i+count,i+2+count,i+1+count);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(indices);geometry.addGroup(0,count,0);geometry.addGroup(count,count,1);
  geometry.sourceRibbon={type,vertices};return geometry;
}

export function updateSourceRibbonGeometry(geometry,diameter,height,t){
  const {type,vertices}=geometry.sourceRibbon,[lo,hi]=SELECTED_CONTAINERS[type].labelBand,R=diameter/2,W=diameter*Math.PI,mid=(lo+hi)/2,count=vertices.length;
  const pos=geometry.attributes.position,norm=geometry.attributes.normal;
  for(let i=0;i<count;i++){
    const v=vertices[i],a=(v.u-.5)*2*Math.PI,alpha=a*t;
    let x,z;if(t<1e-5){x=(v.u-.5)*W;z=0;}else{const r=R/t;x=r*Math.sin(alpha);z=r*(Math.cos(alpha)-1)+r/2*(1-Math.cos(t*Math.PI));}
    // Retain the scan's actual dents, shoulders and radius at full wrapping.
    x+=(v.p[0]*diameter-R*Math.sin(a))*t;z+=(v.p[2]*diameter-R*Math.cos(a))*t;
    const y=(v.p[1]-mid)*height+(mid-.5)*height*t;
    const original=new THREE.Vector3(v.n[0],v.n[1]*diameter/height,v.n[2]).normalize();
    const normal=new THREE.Vector3(Math.sin(alpha),0,Math.cos(alpha)).lerp(original,t).normalize();
    for(const side of [0,1]){const sign=side?-1:1,j=i+side*count;pos.setXYZ(j,x+normal.x*.225*sign,y+normal.y*.225*sign,z+normal.z*.225*sign);norm.setXYZ(j,normal.x*sign,normal.y*sign,normal.z*sign);}
  }
  pos.needsUpdate=true;norm.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
}

export function buildSourceHardware(type,{diameter,height}){
  const group=new THREE.Group();group.name='ContainerAccessories';
  const vertices=sourceParts(type).hardware,metal=new THREE.MeshStandardMaterial({name:'Source_Tin_Metal',color:'#bfc6c9',metalness:.82,roughness:.32,side:THREE.DoubleSide}),cap=new THREE.MeshStandardMaterial({name:'Source_White_Screw_Cap',color:'#eeeae0',metalness:.12,roughness:.36,side:THREE.DoubleSide});
  for(const white of [false,true]){
    const selected=[];for(let i=0;i<vertices.length;i+=3){const isWhite=type==='screw-metal-tin'&&vertices.slice(i,i+3).reduce((a,v)=>a+v.p[1],0)/3>.86;if(isWhite===white)selected.push(...vertices.slice(i,i+3));}
    if(!selected.length)continue;
    const pos=[],norm=[];for(const v of selected){pos.push(v.p[0]*diameter,(v.p[1]-.5)*height,v.p[2]*diameter);const n=new THREE.Vector3(v.n[0],v.n[1]*diameter/height,v.n[2]).normalize();norm.push(n.x,n.y,n.z);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));g.computeBoundingBox();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,white?cap:metal);mesh.name=white?'Source_Screw_Cap':'Source_Rims_Shoulders_Base';group.add(mesh);
  }
  if(!group.children.some(m=>m.material===cap))cap.dispose();
  return group;
}

export function buildBlankTin({diameter:D,height:H}){
  const group=new THREE.Group();group.name='ContainerAccessories';
  const metal=new THREE.MeshStandardMaterial({name:'Original_Blank_Tin_Metal',color:'#c8cdd0',metalness:.84,roughness:.27});
  for(const top of [true,false]){
    const h=Math.min(3,H*.035),y=(top?1:-1)*(H/2-h/2),lid=new THREE.Mesh(new THREE.CylinderGeometry(D/2,D/2,h,64),metal);lid.position.y=y;lid.name=top?'Tin_Flat_Lid':'Tin_Base';group.add(lid);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(D/2-.45,Math.min(.5,H*.007),10,64),metal);rim.rotation.x=Math.PI/2;rim.position.y=(top?1:-1)*(H/2-h);rim.name=top?'Tin_Upper_Roll':'Tin_Lower_Roll';group.add(rim);
  }
  return group;
}
