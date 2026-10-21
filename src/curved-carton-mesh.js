import * as THREE from 'three';
import {curvedPoint,skinInterval,CURVE_STEPS} from './curved-carton.js';

export function createCurvedSkinGeometry(panel,dieline,cx,cy,thickness){
  const nx=8,ny=CURVE_STEPS,rest=[],b=dieline.curvedBody;
  for(let j=0;j<=ny;j++){
    const v=j/ny,[a,z]=skinInterval(panel.curvedSkin.region,panel.curvedSkin.index,v);
    for(let i=0;i<=nx;i++)rest.push([b.x+b.side*(a+(z-a)*i/nx),b.y+b.h*v]);
  }
  const count=rest.length,indices=[],rim=[];
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const a=j*(nx+1)+i,c=a+nx+1;
    indices.push(a,c,a+1,a+1,c,c+1);
  }
  const outsideCount=indices.length;
  for(let i=0;i<outsideCount;i+=3)indices.push(indices[i]+count,indices[i+2]+count,indices[i+1]+count);
  const insideCount=outsideCount;
  // Separate rim vertices keep the cut edges flat shaded.
  const ring=[];for(let i=0;i<=nx;i++)ring.push(i);
  for(let j=1;j<=ny;j++)ring.push(j*(nx+1)+nx);
  for(let i=nx-1;i>=0;i--)ring.push(ny*(nx+1)+i);
  for(let j=ny-1;j>0;j--)ring.push(j*(nx+1));
  let n=2*count;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    if(Math.hypot(rest[a][0]-rest[b][0],rest[a][1]-rest[b][1])<1e-10)continue;
    rim.push(a,b);
    indices.push(n,n+1,n+2,n+1,n+3,n+2);n+=4;
  }
  const geometry=new THREE.BufferGeometry(),uv=new Float32Array(n*2);
  const setUV=(i,k)=>{const [x,y]=rest[k];uv[2*i]=(x-dieline.minX)/dieline.width;uv[2*i+1]=1-(y-dieline.minY)/dieline.height;};
  for(let i=0;i<count;i++){setUV(i,i);setUV(i+count,i);}
  for(let k=0;k<rim.length;k+=2){const i=2*count+k*2;setUV(i,rim[k]);setUV(i+1,rim[k+1]);setUV(i+2,rim[k]);setUV(i+3,rim[k+1]);}
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(indices);
  geometry.addGroup(0,outsideCount,0);geometry.addGroup(outsideCount,insideCount,1);geometry.addGroup(outsideCount+insideCount,indices.length-outsideCount-insideCount,2);
  geometry.curvedSkin={rest,nx,ny,rim,thickness};
  updateCurvedSkinGeometry(geometry,dieline,0,cx,cy);
  return geometry;
}

export function updateCurvedSkinGeometry(geometry,dieline,progress,cx,cy){
  const {rest,nx,ny,rim,thickness}=geometry.curvedSkin,count=rest.length;
  const mid=rest.map(([x,y])=>new THREE.Vector3(...curvedPoint(x,y,dieline,progress,cx,cy))),pos=geometry.attributes.position;
  const normals=[];
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const k=j*(nx+1)+i,row=j===0?1:j===ny?ny-1:j;
    // Collapsed triangle tips borrow a tangent from the adjacent row.
    let dx=mid[j*(nx+1)+Math.min(nx,i+1)].clone().sub(mid[j*(nx+1)+Math.max(0,i-1)]);
    if(dx.lengthSq()<1e-12)dx=mid[row*(nx+1)+Math.min(nx,i+1)].clone().sub(mid[row*(nx+1)+Math.max(0,i-1)]);
    const dy=mid[Math.min(ny,j+1)*(nx+1)+i].clone().sub(mid[Math.max(0,j-1)*(nx+1)+i]);
    const normal=dy.cross(dx).normalize();if(!normal.lengthSq())normal.set(0,0,1);normals.push(normal);
    const out=mid[k].clone().addScaledVector(normal,thickness/2),inside=mid[k].clone().addScaledVector(normal,-thickness/2);
    pos.setXYZ(k,out.x,out.y,out.z);pos.setXYZ(k+count,inside.x,inside.y,inside.z);
  }
  for(let k=0;k<rim.length;k+=2){
    const i=2*count+k*2;
    for(const [offset,index]of [[0,rim[k]],[1,rim[k+1]],[2,rim[k]+count],[3,rim[k+1]+count]])pos.setXYZ(i+offset,pos.getX(index),pos.getY(index),pos.getZ(index));
  }
  pos.needsUpdate=true;geometry.computeVertexNormals();
  // Analytic one-sided normals retain the curved creases, even at tapered tips.
  const normal=geometry.attributes.normal;
  for(let i=0;i<count;i++)for(const side of [0,1])normal.setXYZ(i+side*count,normals[i].x*(side?-1:1),normals[i].y*(side?-1:1),normals[i].z*(side?-1:1));
  normal.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
}
