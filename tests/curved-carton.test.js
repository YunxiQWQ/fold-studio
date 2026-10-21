import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BOX_TYPES,makeDieline,creasePaths,cutSegments} from '../src/geometry.js';
import {curvedPoint} from '../src/curved-carton.js';
import {createPanelGeometry} from '../src/model3d.js';
import {updateCurvedSkinGeometry} from '../src/curved-carton-mesh.js';
import {foldMatrices} from '../src/folding.js';

const make=()=>makeDieline('curved-twist-carton',BOX_TYPES['curved-twist-carton'].defaults);
const near=(a,b)=>assert.ok(a.distanceTo(b)<1e-4,`${a.toArray()} differs from ${b.toArray()}`);
test('reference layout keeps four 80 mm bays, 160 mm body, eight curved scores and opposed tuck lids',()=>{
  const d=make(),b=d.curvedBody,arcs=creasePaths(d).filter(p=>p.id.startsWith('arc-'));
  assert.deepEqual([b.side,b.h,b.glue,d.width,d.height],[80,160,13,333,352]);
  assert.equal(arcs.length,8);assert.ok(arcs.every(p=>p.d.includes('Q')&&p.points.length===41));
  const top=d.panels.find(p=>p.id==='top'),bottom=d.panels.find(p=>p.id==='bottom');
  assert.equal(top.x,b.x+2.5*80);assert.equal(bottom.x,b.x+3*80);
  for(const id of ['top','bottom']){const p=d.panels.find(p=>p.id===id),tab=d.panels.find(p=>p.id===id+'-tuck');assert.equal(p.w,80);assert.equal(p.h,80);assert.equal(tab.h,16);assert.ok(tab.points.length>16);}
  const key=([a,b])=>[a.map(n=>n.toFixed(6)).join(','),b.map(n=>n.toFixed(6)).join(',')].sort().join('|');
  const cuts=new Set(cutSegments(d).map(key));
  for(const {points}of arcs)for(let i=1;i<points.length;i++)assert.equal(cuts.has(key([points[i-1],points[i]])),false,'curved scores must never be exported as cut lines');
});

test('deformed body retains sheet UVs, paper thickness, finite bounds and actual curved ridges',()=>{
  const d=make(),p=d.panels[0],cx=p.x+p.w/2,cy=p.y+p.h/2;
  for(const panel of d.panels.filter(p=>p.curvedSkin)){
    const g=createPanelGeometry(panel,d,cx,cy),uv=[...g.attributes.uv.array],rest=g.curvedSkin.rest;
    for(const t of [0,.25,.6,1,.45,0]){
      updateCurvedSkinGeometry(g,d,t,cx,cy);
      assert.deepEqual([...g.attributes.uv.array],uv);
      const pos=g.attributes.position,count=rest.length;
      for(let i=0;i<g.attributes.normal.count;i++)assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i).length()-1)<1e-4,'surface and rim normals must be normalized');
      for(let i=0;i<g.groups[0].count;i+=3){
        const ids=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)],vertices=ids.map(k=>new THREE.Vector3().fromBufferAttribute(pos,k));
        const normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
        if(normal.lengthSq()>1e-10)assert.ok(normal.dot(new THREE.Vector3().fromBufferAttribute(g.attributes.normal,ids[0]))>0,'outside winding must face outward');
      }
      for(let i=0;i<count;i++){
        const out=new THREE.Vector3().fromBufferAttribute(pos,i),inside=new THREE.Vector3().fromBufferAttribute(pos,i+count),mid=out.clone().add(inside).multiplyScalar(.5);
        near(mid,new THREE.Vector3(...curvedPoint(...rest[i],d,t,cx,cy)));
        assert.ok(Math.abs(out.distanceTo(inside)-.45)<1e-4);
        assert.ok(g.boundingBox.containsPoint(out));
        if(!t)near(mid,new THREE.Vector3(rest[i][0]-cx,cy-rest[i][1],0));
      }
    }
    g.dispose();
  }
  const arc=d.extraCreases[0].points.map(pt=>new THREE.Vector3(...curvedPoint(...pt,d,1,cx,cy)));
  const line=new THREE.Line3(arc[0],arc.at(-1)),middle=arc[20];
  assert.ok(line.closestPointToPoint(middle,true,new THREE.Vector3()).distanceTo(middle)>2,'the crease must remain curved in 3D');
});

test('caps stay attached during wrapping and close onto square rims rotated by 45 degrees',()=>{
  const d=make(),p=d.panels[0],cx=p.x+p.w/2,cy=p.y+p.h/2;
  for(const t of [0,.2,.6,.78,1]){
    const matrices=foldMatrices(d,t,cx,cy);
    for(const p of d.panels.filter(p=>p.bodyAttachment))for(const x of [p.hinge.x,p.hinge.x+p.w]){
      const distance=new THREE.Vector3(x-cx,cy-p.hinge.y,0).applyMatrix4(matrices.get(p.id)).distanceTo(new THREE.Vector3(...curvedPoint(x,p.hinge.y,d,t,cx,cy)));
      assert.ok(distance<=Math.abs(p.inset)+1e-4,'attachment only offsets by the dust-flap paper clearance');
    }
  }
  const matrices=foldMatrices(d,1,cx,cy);
  for(const id of ['top','bottom']){
    const p=d.panels.find(p=>p.id===id),points=p.points.map(([x,y])=>new THREE.Vector3(x-cx,cy-y,0).applyMatrix4(matrices.get(id)));
    for(const pt of points)assert.ok(Math.abs(pt.y-(id==='top'?80:-80))<1e-5);
    for(let i=0;i<4;i++)assert.ok(Math.abs(points[i].distanceTo(points[(i+1)%4])-80)<1e-5);
  }
  assert.throws(()=>makeDieline('curved-twist-carton',{length:80,depth:90,height:160}),/长宽/);
});
