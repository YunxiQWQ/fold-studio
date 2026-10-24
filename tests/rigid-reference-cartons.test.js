import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BOX_TYPES,makeDieline,cutSegments,creasePaths} from '../src/geometry.js';
import {foldMatrices} from '../src/folding.js';
import {candyTwistSettings,triangleSliceSettings} from '../src/rigid-reference-cartons.js';

const types=['candy-twist-carton','triangle-slice-box'];
function rig(type,progress=1,dimensions=BOX_TYPES[type].defaults){
  const d=makeDieline(type,dimensions),root=d.panels.find(p=>p.id===d.rootId),cx=root.x+root.w/2,cy=root.y+root.h/2,matrices=foldMatrices(d,progress,cx,cy);
  const at=(panel,point)=>new THREE.Vector3(point[0]-cx,cy-point[1],0).applyMatrix4(matrices.get(panel.id));
  return{d,panel:id=>d.panels.find(p=>p.id===id),at};
}
const near=(a,b,tolerance=1e-6)=>assert.ok(a.distanceTo(b)<tolerance,`${a.toArray()} != ${b.toArray()}`);

test('two reference constructions are registered and the removed petal model is unavailable',()=>{
  assert.equal(Object.keys(BOX_TYPES).length,32);
  assert.equal(Object.hasOwn(BOX_TYPES,'petal-pyramid-carton'),false);
  for(const type of types){
    const d=makeDieline(type,BOX_TYPES[type].defaults);
    assert.ok(d.panels.length>=7);
    assert.ok(d.panels.some(p=>p.id===BOX_TYPES[type].printPanel));
    assert.equal(d.cylinder,null);
  }
});

test('candy twist end caps meet on two narrow ridges and both tails project outward',()=>{
  const dims=BOX_TYPES['candy-twist-carton'].defaults,{d,panel,at}=rig('candy-twist-carton'),settings=candyTwistSettings(dims);
  for(const end of ['top','bottom']){
    const ridge=[];
    for(const id of ['front','back'])ridge.push(at(panel(`${id}-${end}-cap`),panel(`${id}-${end}-cap`).points.at(-1)),at(panel(`${id}-${end}-cap`),panel(`${id}-${end}-cap`).points.at(-2)));
    for(const id of ['left','right'])ridge.push(at(panel(`${id}-${end}-cap`),panel(`${id}-${end}-cap`).points[2]));
    const firstHalf=[ridge[0],ridge[4],ridge[3]],secondHalf=[ridge[1],ridge[5],ridge[2]];
    for(const p of firstHalf.slice(1))near(p,firstHalf[0]);
    for(const p of secondHalf.slice(1))near(p,secondHalf[0]);
    near(firstHalf[0],secondHalf[0],settings.N+1e-6);
    for(const id of ['front','back']){
      const tail=panel(`${id}-${end}-tail`),outer=tail.points.filter((_,i)=>i>=2).map(p=>at(tail,p));
      assert.ok(outer.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
    }
  }
});

test('triangle slice lid closes against both sloped walls and tabs stay between base and lid',()=>{
  const dims=BOX_TYPES['triangle-slice-box'].defaults,{d,panel,at}=rig('triangle-slice-box'),settings=triangleSliceSettings(dims);
  const tip=at(panel('lid'),panel('lid').points[2]);
  near(tip,at(panel('wall-right'),panel('wall-right').points[2]),1e-4);
  near(tip,at(panel('wall-left'),panel('wall-left').points[3]),1e-4);
  for(const id of ['lid-right-tab','lid-left-tab']){
    for(const point of panel(id).points){
      const p=at(panel(id),point);
      assert.ok(p.z>=-settings.H-1e-6&&p.z<=1e-6,`tab ${id} outside wall band: ${p.toArray()}`);
    }
  }
});

test('custom parameters remain finite and creases never become cut lines',()=>{
  const samples={
    'candy-twist-carton':{length:150,depth:50,height:36,neckWidth:16,endRise:22,tailLength:28,tailFlare:8,glueWidth:14},
    'triangle-slice-box':{length:150,depth:128,height:40,lockTab:16},
  };
  for(const type of types){
    const d=makeDieline(type,samples[type]),keys=new Set([...creasePaths(d),...(d.nonCutEdges??[])].map(item=>{const points=item.points??item;return[points[0].join(','),points[1].join(',')].sort().join('|');}));
    for(const segment of cutSegments(d))assert.equal(keys.has([segment[0].join(','),segment[1].join(',')].sort().join('|')),false,`${type} cut/crease overlap`);
    const root=d.panels.find(p=>p.id===d.rootId);
    for(const progress of [0,.3,.7,1])for(const matrix of foldMatrices(d,progress,root.x+root.w/2,root.y+root.h/2).values())assert.ok(matrix.elements.every(Number.isFinite));
  }
});
