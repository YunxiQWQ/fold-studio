import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BOX_TYPES,makeDieline,cutSegments,creasePaths,panelAt} from '../src/geometry.js';
import {foldMatrices} from '../src/folding.js';
import {createPanelGeometry} from '../src/model3d.js';
import {printRegions,inPrintRegions} from '../src/artwork-space.js';
import {newProject,validateProject} from '../src/project.js';
import {slottedHandleSettings} from '../src/slotted-handle-carton.js';
const type='slotted-handle-carton';
function rig(dimensions=BOX_TYPES[type].defaults,t=1){
  const d=makeDieline(type,dimensions),root=d.panels.find(p=>p.id===d.rootId),cx=root.x+root.w/2,cy=root.y+root.h/2,m=foldMatrices(d,t,cx,cy);
  return {d,cx,cy,m,p:id=>d.panels.find(p=>p.id===id),at:(p,x,y)=>new THREE.Vector3(x-cx,cy-y,0).applyMatrix4(m.get(p.id))};
}
test('slotted handle carton has a continuous four-wall strip, two half covers and four shaped bottom flaps',()=>{
  const {d,p}=rig(),b=d.slottedHandle;assert.equal(d.panels.length,15);assert.equal(d.width,2*(b.L+b.D)+b.G);assert.equal(d.height,b.R+b.T+b.H+b.B);
  assert.deepEqual([b.L,b.D,b.H],[250,200,120]);assert.equal(d.width,918);assert.equal(d.height,438);
  for(const id of ['front','back']){assert.equal(p(id).w,b.L);assert.equal(p(id).h,b.H);assert.equal(p(id+'-roof').h,b.D/2);assert.ok(p(id+'-bottom').points.length>=6);}
  for(const id of ['left','right']){assert.equal(p(id).w,b.D);assert.equal(p(id+'-lock-wing').points.length,4);assert.ok(p(id+'-bottom').points.length>=5);}
  assert.equal(p('glue').w,b.G);assert.equal(BOX_TYPES[type].category,'gift');
});
test('two handle cutouts and two wing slots stay open in picking, print masks and actual meshes',()=>{
  const {d,cx,cy,p}=rig();
  for(const id of ['front-handle','back-handle','left-lock-wing','right-lock-wing']){
    const panel=p(id),hole=panel.holes[0],x=hole.reduce((s,p)=>s+p[0],0)/hole.length,y=hole.reduce((s,p)=>s+p[1],0)/hole.length;
    assert.equal(panelAt(d,x,y),undefined);for(const side of ['inside','outside'])assert.equal(inPrintRegions(printRegions(d,{},side),x,y),false);
    const geometry=createPanelGeometry(panel,d,cx,cy),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(x-cx,cy-y,4),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(mesh).length,0,id+' contains triangles across its hole');
    assert.ok([...geometry.attributes.position.array,...geometry.attributes.uv.array].every(Number.isFinite));geometry.dispose();material.dispose();
  }
});
test('closed half covers meet at the center and paired handles have aligned holes with board clearance',()=>{
  const {d,p,at}=rig(),b=d.slottedHandle;
  const front=p('front-roof'),back=p('back-roof'),a=at(front,front.x+front.w/2,front.y),z=at(back,back.x+back.w/2,back.y);assert.ok(a.distanceTo(z)<1e-7);
  const centers=['front-handle','back-handle'].map(id=>{const panel=p(id),hole=panel.holes[0],x=hole.reduce((s,q)=>s+q[0],0)/hole.length,y=hole.reduce((s,q)=>s+q[1],0)/hole.length;return at(panel,x,y);});
  assert.ok(Math.abs(centers[0].x-centers[1].x)<1e-7);assert.ok(Math.abs(centers[0].y-centers[1].y)<1e-7);assert.ok(centers[0].distanceTo(centers[1])>.45);assert.ok(centers[0].distanceTo(centers[1])<.8);
  const bounds=new THREE.Box3();for(const panel of d.panels)for(const point of panel.points)bounds.expandByPoint(at(panel,...point));const size=bounds.getSize(new THREE.Vector3());
  for(const [i,expected]of [b.L,b.totalHeight,b.D].entries())assert.ok(Math.abs(size.toArray()[i]-expected)<1e-6);
});
test('creases do not become cuts and every rigid hinge stays attached throughout folding',()=>{
  const key=([a,b])=>[a.map(n=>n.toFixed(5)).join(','),b.map(n=>n.toFixed(5)).join(',')].sort().join('|');
  const d=makeDieline(type,BOX_TYPES[type].defaults),cuts=new Set(cutSegments(d).map(key));for(const c of creasePaths(d))assert.ok(!cuts.has(key(c.points)));
  for(const progress of [0,.2,.4,.65,.85,1,.5,0]){
    const {d,p,at}=rig(undefined,progress);for(const panel of d.panels.filter(p=>p.parent)){
      const {x,y}=panel.hinge;assert.ok(at(panel,x,y).distanceTo(at(p(panel.parent),x,y))<1.4,panel.id+' detached from its hinge');
    }
  }
});
test('slotted handle parameters survive project save and remain bounded at supported dimension extremes',()=>{
  const project=newProject(type);Object.assign(project.dimensions,{handleWidth:100,handleHoleHeight:20,handleHeight:55,sideFlapAngle:45,sideFlapHeight:85,bottomFlap:90,glueWidth:20});assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))),project);
  for(const dimensions of [{length:15,depth:15,height:15},{length:600,depth:15,height:600},{length:15,depth:600,height:15}]){const {d}=rig(dimensions);assert.ok(Object.values(d.slottedHandle).every(Number.isFinite));for(const panel of d.panels){const geometry=createPanelGeometry(panel,d,0,0);assert.ok([...geometry.attributes.position.array].every(Number.isFinite));geometry.dispose();}}
  assert.throws(()=>slottedHandleSettings({...BOX_TYPES[type].defaults,handleHeight:NaN}));assert.throws(()=>slottedHandleSettings({...BOX_TYPES[type].defaults,sideFlapAngle:'38'}));
});
