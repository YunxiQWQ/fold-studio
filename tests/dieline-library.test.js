import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BOX_TYPES,makeDieline,cutSegments,creasePaths,panelAt} from '../src/geometry.js';
import {RETAIL_STYLES,retailSettings} from '../src/retail-cartons.js';
import {wrappedLidSettings} from '../src/wrapped-lidbox.js';
import {buildPaperBagHandles} from '../src/paper-bag.js';
import {foldMatrices} from '../src/folding.js';
import {createPanelGeometry} from '../src/model3d.js';
import {newProject,validateProject} from '../src/project.js';
import {printRegions,inPrintRegions} from '../src/artwork-space.js';

const key=([a,b])=>[a.map(n=>n.toFixed(6)).join(','),b.map(n=>n.toFixed(6)).join(',')].sort().join('|');
function rig(d,t){const root=d.panels.find(p=>p.id===d.rootId),cx=root.x+root.w/2,cy=root.y+root.h/2,m=foldMatrices(d,t,cx,cy);return {cx,cy,m,at:(p,[x,y])=>new THREE.Vector3(x-cx,cy-y,0).applyMatrix4(m.get(p.id))};}
const area=pts=>Math.abs(pts.reduce((s,[x,y],i)=>{const [a,b]=pts[(i+1)%pts.length];return s+x*b-a*y;},0)/2);
test('retail variants preserve distinct closure graphs, rounded tongues, locking leaves and actual hanger cuts',()=>{
  const signatures=new Set();
  for(const retailStyle of Object.keys(RETAIL_STYLES)){
    const dims={...BOX_TYPES['retail-carton'].defaults,retailStyle},d=makeDieline('retail-carton',dims),p=id=>d.panels.find(p=>p.id===id);
    signatures.add(JSON.stringify(d.panels.map(({id,parent,points})=>({id,parent,points}))));
    assert.ok(p('top-tuck').points.length>16);assert.equal(p('top').parent,['straight','airplane','lock','hanging-lock'].includes(retailStyle)?'front':'back');
    if(retailStyle==='lock'){assert.equal(p('front-bottom').points.length,8);assert.equal(p('right-bottom').points.length,5);}
    if(retailStyle.startsWith('hanging')){
      const h=p('hang-tab').holes[0],x=h.reduce((s,v)=>s+v[0],0)/h.length,y=h.reduce((s,v)=>s+v[1],0)/h.length;
      assert.equal(panelAt(d,x,y),undefined);
      for(const side of ['inside','outside'])assert.equal(inPrintRegions(printRegions(d,{},side),x,y),false);
      const {cx,cy}=rig(d,0),g=createPanelGeometry(p('hang-tab'),d,cx,cy),mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);
      assert.equal(new THREE.Raycaster(new THREE.Vector3(x-cx,cy-y,5),new THREE.Vector3(0,0,-1)).intersectObject(mesh).length,0);g.dispose();mesh.material.dispose();
    }
    const scores=new Set(creasePaths(d).flatMap(({points})=>points.slice(1).map((b,i)=>key([points[i],b]))));
    for(const e of cutSegments(d)){assert.notEqual(e[0].join(','),e[1].join(','));assert.equal(scores.has(key(e)),false);}
    const bounds=new THREE.Box3(),r=rig(d,1);for(const panel of d.panels)for(const point of panel.points)bounds.expandByPoint(r.at(panel,point));
    const size=bounds.getSize(new THREE.Vector3()).toArray();[dims.length,d.retail.totalHeight,dims.depth].forEach((n,i)=>assert.ok(Math.abs(size[i]-n)<1e-5,retailStyle+': '+size));
  }
  assert.equal(signatures.size,Object.keys(RETAIL_STYLES).length);
});
test('all retail variants triangulate at extreme dimensions and retain finite connected fold transforms',()=>{
  for(const retailStyle of Object.keys(RETAIL_STYLES))for(const values of [[15,15,15],[600,15,600],[15,600,15]]){
    const d=makeDieline('retail-carton',{length:values[0],depth:values[1],height:values[2],retailStyle}),ids=new Set(d.panels.map(p=>p.id));
    for(const p of d.panels){assert.ok(p.w>0&&p.h>0&&area(p.points)>0);if(p.parent)assert.ok(ids.has(p.parent));const g=createPanelGeometry(p,d,0,0);assert.ok(g.attributes.position.count>0);assert.ok([...g.attributes.position.array,...g.attributes.normal.array].every(Number.isFinite));g.dispose();}
    for(const t of [0,.2,.55,.85,1]){const r=rig(d,t);for(const p of d.panels)for(const point of p.points)assert.ok(r.at(p,point).toArray().every(Number.isFinite));}
  }
});
test('basic bag is a continuous rectangular blank with no zero-height hem, punches or invented handles',()=>{
  const d=makeDieline('paper-bag-basic',BOX_TYPES['paper-bag-basic'].defaults);
  assert.deepEqual([d.width,d.height],[272,94]);assert.equal(d.paperBag.topFold,0);assert.equal(d.panels.length,14);
  assert.equal(d.panels.some(p=>p.id.endsWith('-hem')||p.holes),false);assert.equal(buildPaperBagHandles(d,0,0).children.length,0);
  for(const [a,b]of cutSegments(d))assert.ok((a[0]===0&&b[0]===0)||(a[0]===272&&b[0]===272)||(a[1]===0&&b[1]===0)||(a[1]===94&&b[1]===94));
  const rope=makeDieline('paper-bag-basic',{...BOX_TYPES['paper-bag-basic'].defaults,handleStyle:'rope'});assert.equal(rope.paperBag.topFold,2);assert.equal(rope.panels.filter(p=>p.id.endsWith('-hem')).length,7);
});
test('wrapped lid/base use two cross blanks, inward turn-ins and adjustable lid clearance without corner glue ears',()=>{
  const dims={...BOX_TYPES['wrapped-lidbox'].defaults,lidHeight:18,turnIn:12,lidClearance:2.5},d=makeDieline('wrapped-lidbox',dims),r=rig(d,1);
  assert.equal(d.panels.length,18);assert.equal(d.panels.filter(p=>p.kind==='corner').length,0);assert.equal(d.panels.filter(p=>p.id.endsWith('-turn')).length,8);
  for(const p of d.panels.filter(p=>p.id.endsWith('-turn'))){const wall=d.panels.find(q=>q.id===p.parent);assert.ok(Math.abs(p.angle)===180);const edge=creasePaths({panels:[p]}).at(0).points;for(const xy of edge)assert.ok(r.at(p,xy).distanceTo(r.at(wall,xy))<1,'turn-in detached');}
  const lid=d.panels.find(p=>p.id==='lid');assert.deepEqual([lid.w,lid.h],[225,145]);
  assert.equal(makeDieline('lidbox',BOX_TYPES.lidbox.defaults).panels.filter(p=>p.kind==='corner').length,8);
  assert.throws(()=>wrappedLidSettings({...dims,lidHeight:NaN}));assert.throws(()=>retailSettings({...BOX_TYPES['retail-carton'].defaults,retailStyle:'unknown'}));
});
test('new constructions and every retail variant survive project serialization with their editable parameters',()=>{
  for(const type of ['retail-carton','paper-bag-basic','wrapped-lidbox'])for(const style of type==='retail-carton'?Object.keys(RETAIL_STYLES):[null]){
    const p=newProject(type);if(style)p.dimensions.retailStyle=style;assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  }
});
