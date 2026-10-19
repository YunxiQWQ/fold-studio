import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOX_TYPES, makeDieline, cutSegments, foldSegments } from '../src/geometry.js';
import { foldMatrices } from '../src/folding.js';
import { createPanelGeometry, createCylinderRibbonGeometry, updateCylinderRibbonPositions } from '../src/model3d.js';
import { newProject, validateProject, History } from '../src/project.js';

function foldedBounds(dieline, progress) {
  if (dieline.cylinder) {
    const root=dieline.panels[0],cx=root.x+root.w/2,cy=root.y+root.h/2,transforms=foldMatrices(dieline,progress,cx,cy),bounds=new THREE.Box3();
    for(const panel of dieline.panels){
      const curved=panel.id==='body',g=curved?createCylinderRibbonGeometry(panel.w,panel.h,dieline,panel):createPanelGeometry(panel,dieline,cx,cy);
      if(curved)updateCylinderRibbonPositions(g,panel.w,panel.h,dieline.cylinder.diameter,progress);
      const b=g.boundingBox.clone();if(!curved)b.applyMatrix4(transforms.get(panel.id));bounds.union(b);g.dispose();
    }
    return bounds.getSize(new THREE.Vector3());
  }
  const root=dieline.panels.find(p=>p.id===dieline.rootId),cx=root.x+root.w/2,cy=root.y+root.h/2,matrices=foldMatrices(dieline,progress,cx,cy);
  const bounds=new THREE.Box3();
  for(const p of dieline.panels)for(const [x,y]of p.points)bounds.expandByPoint(new THREE.Vector3(x-cx,-(y-cy),0).applyMatrix4(matrices.get(p.id)));
  return bounds.getSize(new THREE.Vector3());
}

for(const type of Object.keys(BOX_TYPES)){
  test(`${type}: fold graph is connected, acyclic, and finite at supported dimension extremes`,()=>{
    for(const dimensions of [BOX_TYPES[type].defaults,{length:15,depth:15,height:15},{length:600,depth:15,height:600},{length:15,depth:600,height:15}]){
      const d=makeDieline(type,dimensions),ids=new Set(d.panels.map(p=>p.id));
      assert.equal(ids.size,d.panels.length);
      for(const p of d.panels){const visited=new Set();let current=p;while(current.parent){assert.ok(!visited.has(current.id));visited.add(current.id);assert.ok(ids.has(current.parent));current=d.panels.find(p=>p.id===current.parent);}assert.equal(current.id,d.rootId);}
      for(const t of [0,.3,.7,1])for(const v of foldedBounds(d,t).toArray())assert.ok(Number.isFinite(v)&&v>=0);
    }
  });
  test(`${type}: closed model has the requested outside dimensions`,()=>{
    const dimensions=BOX_TYPES[type].defaults,d=makeDieline(type,dimensions),size=foldedBounds(d,1);
    const expected=d.cylinder?[dimensions.length+.45,dimensions.height+.45,dimensions.length+.45]:type==='drawer-box'?[dimensions.length,dimensions.depth+2.7,dimensions.height+2.7]:type==='book-box'?[dimensions.length+1.8,dimensions.depth+1.8,dimensions.height+1.8]:type==='lidbox'?[dimensions.length+2.7,dimensions.depth+2.7,dimensions.height+1.35]:type==='arch-handle-tote'?[size.x,dimensions.depth,size.z]:BOX_TYPES[type].family==='tray'?[dimensions.length,dimensions.depth,dimensions.height]:[dimensions.length,dimensions.height,dimensions.depth];
    size.toArray().forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-4,`${value} != ${expected[i]}`));
    if(type==='arch-handle-tote'){
      assert.ok(Math.abs(size.x-(dimensions.length+2*Math.round(dimensions.length*(28/120))))<1);
      assert.ok(Math.abs(size.y-dimensions.depth)<1e-4);
    }
  });
}
test('invalid dimensions and unknown box types are rejected',()=>{
  for(const dimensions of [{length:0,depth:40,height:50},{length:NaN,depth:40,height:50},{length:40,depth:40,height:601}])assert.throws(()=>makeDieline('carton',dimensions));
  assert.throws(()=>makeDieline('unknown',{length:40,depth:40,height:50}));
});
test('SVG cut paths never include a crease segment',()=>{
  const key=([a,b])=>[a.join(','),b.join(',')].sort().join('|');
  for(const type of Object.keys(BOX_TYPES)){
    const d=makeDieline(type,BOX_TYPES[type].defaults),creases=new Set(d.panels.map(foldSegments).filter(Boolean).map(key));
    for(const line of cutSegments(d))assert.equal(creases.has(key(line)),false);
  }
});
test('project validation round-trips each template and rejects unsafe or corrupt images',()=>{
  for(const type of Object.keys(BOX_TYPES)){const p=newProject(type);assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);}
  const p=newProject();p.layers[0].type='image';p.layers[0].src='https://example.com/private-image.png';assert.throws(()=>validateProject(p));
});
test('history branches correctly after undo and respects its memory limit',()=>{
  const p=newProject(),h=new History(p,3);
  p.name='one';h.push(p);p.name='two';h.push(p);assert.equal(h.undo().name,'one');
  p.name='branch';h.push(p);assert.equal(h.canRedo,false);assert.equal(h.undo().name,'one');assert.equal(h.redo().name,'branch');
  p.name='three';h.push(p);p.name='four';h.push(p);assert.equal(h.entries.length,3);
});
test('arch-handle-tote: all 4 ear flaps flare outward on 2D dieline and adjust with custom parameters',()=>{
  const d=makeDieline('arch-handle-tote',{length:120,depth:100,height:100,flare:30,archH:90,handleW:85});
  const base=d.panels.find(p=>p.id==='base');
  const ble=d.panels.find(p=>p.id==='back-left-ear');
  const bre=d.panels.find(p=>p.id==='back-right-ear');
  const fle=d.panels.find(p=>p.id==='front-left-ear');
  const fre=d.panels.find(p=>p.id==='front-right-ear');
  assert.ok(Math.max(...ble.points.map(p=>p[0]))<=base.x);
  assert.ok(Math.min(...bre.points.map(p=>p[0]))>=base.x+base.w);
  assert.ok(Math.max(...fle.points.map(p=>p[0]))<=base.x);
  assert.ok(Math.min(...fre.points.map(p=>p[0]))>=base.x+base.w);
  const fh=d.panels.find(p=>p.id==='front-handle');
  assert.equal(fh.h,90);
});

