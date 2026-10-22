import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BOX_TYPES,makeDieline,cutSegments,creasePaths,panelAt} from '../src/geometry.js';
import {foldMatrices} from '../src/folding.js';
import {createPanelGeometry} from '../src/model3d.js';
import {triangleSettings,updateRoofGussetGeometry} from '../src/reference-cartons.js';
import {buildPaperBagHandles,updatePaperBagHandles} from '../src/paper-bag.js';
import {newProject,validateProject} from '../src/project.js';
import {printRegions,inPrintRegions} from '../src/artwork-space.js';

test('reference cartons retain their segment dimensions and triangular caps with attached glue ears',()=>{
 const d=makeDieline('triangular-prism-carton',BOX_TYPES['triangular-prism-carton'].defaults);
 assert.ok(Math.abs(d.width-326)<1e-8);assert.equal(d.height,237);assert.equal(d.panels.filter(p=>p.id.endsWith('-ear')).length,4);
 assert.ok(Math.abs(d.triangle.altitude-Math.sqrt(74*74-37*37))<1e-9);
 const root=d.panels[0],cx=root.x+root.w/2,cy=root.y+root.h/2,m=foldMatrices(d,1,cx,cy),a=d.panels.find(p=>p.id==='front'),b=d.panels.find(p=>p.id==='back');
 const point=(p,x,y)=>new THREE.Vector3(x-cx,cy-y,0).applyMatrix4(m.get(p.id));
 for(const x of [root.x,root.x+root.w])assert.ok(point(a,x,a.y).distanceTo(point(b,x,b.y+b.h))<1e-7,'sloping faces meet at the same apex');
 const gift=makeDieline('rope-gable-carton',BOX_TYPES['rope-gable-carton'].defaults);assert.equal(gift.width,885);assert.equal(gift.height,403);
 for(const side of ['left','right'])assert.equal(gift.panels.find(p=>p.id===side+'-top').holes.length,1);
 assert.equal(gift.extraCreases.length,6);assert.ok(gift.panels.find(p=>p.id==='front-bottom').points.length>8);
});

test('reference seams remain non-cutting and rope holes are excluded from editable surfaces',()=>{
 const key=([a,b])=>[a.join(','),b.join(',')].sort().join('|');
 for(const type of ['triangular-prism-carton','rope-gable-carton']){
  const d=makeDieline(type,BOX_TYPES[type].defaults),cuts=new Set(cutSegments(d).map(key));
  for(const edge of d.nonCutEdges)assert.ok(!cuts.has(key(edge)));
  for(const crease of creasePaths(d))for(let i=1;i<crease.points.length;i++)assert.ok(!cuts.has(key([crease.points[i-1],crease.points[i]])));
  for(const p of d.panels)for(const hole of p.holes??[]){const x=hole.reduce((a,q)=>a+q[0],0)/hole.length,y=hole.reduce((a,q)=>a+q[1],0)/hole.length;assert.equal(panelAt(d,x,y),undefined);for(const side of ['inside','outside'])assert.equal(inPrintRegions(printRegions(d,{},side),x,y),false);}
 }
});

test('fold-top pleats preserve their UVs and reinforcement caps stay attached throughout the fold',()=>{
 const d=makeDieline('rope-gable-carton',BOX_TYPES['rope-gable-carton'].defaults),root=d.panels[0],cx=root.x+root.w/2,cy=root.y+root.h/2;
 for(const p of d.panels.filter(p=>p.roofGusset)){
  const g=createPanelGeometry(p,d,cx,cy),uv=[...g.attributes.uv.array];
  for(const t of [0,.35,.55,.72,1,.45,0]){updateRoofGussetGeometry(g,p,d,t,cx,cy);assert.deepEqual([...g.attributes.uv.array],uv);assert.ok([...g.attributes.position.array,...g.attributes.normal.array].every(Number.isFinite));}
  g.dispose();
 }
 for(const t of [0,.5,.72,1]){
  const m=foldMatrices(d,t,cx,cy);
  for(const id of ['left','right']){
   const tab=d.panels.find(p=>p.id===id+'-top'),b=d.ropeGable,f=Math.max(0,Math.min(1,(t-.38)/.34)),theta=b.angle*Math.PI/180;
   const actual=new THREE.Vector3(tab.hinge.x-cx,cy-tab.hinge.y,0).applyMatrix4(m.get(tab.id));
   const expected=new THREE.Vector3(tab.hinge.x-cx,cy-b.bodyY+b.R*Math.cos(theta*f),0).applyMatrix4(m.get(id));
   assert.ok(actual.distanceTo(expected)<.8);
  }
 }
 const handles=buildPaperBagHandles(d,cx,cy);assert.equal(handles.children.filter(p=>p.name.endsWith('_Handle')).length,2);assert.equal(handles.children.filter(p=>p.name.includes('_Eyelet_')).length,4);
 updatePaperBagHandles(handles,foldMatrices(d,1,cx,cy),1);assert.equal(handles.visible,true);updatePaperBagHandles(handles,foldMatrices(d,0,cx,cy),0);assert.equal(handles.visible,false);
 for(const mesh of handles.children){mesh.geometry.dispose();mesh.material.dispose();}
});

test('new orientation and dimension options survive projects without changing unrelated shapes',()=>{
 for(const type of ['triangular-prism-carton','rope-gable-carton']){
  const p=newProject(type);p.dimensions.length=250;
  if(type==='triangular-prism-carton')p.dimensions.orientation='standing';else p.dimensions.handleSpan=130;
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
 }
 const d=makeDieline('triangular-prism-carton',{...BOX_TYPES['triangular-prism-carton'].defaults,orientation:'standing'});assert.equal(d.rootRotationZ,Math.PI/2);
 assert.equal(makeDieline('carton',BOX_TYPES.carton.defaults).rootRotationZ,0);
 assert.throws(()=>triangleSettings({...BOX_TYPES['triangular-prism-carton'].defaults,orientation:'invalid'}));
});
