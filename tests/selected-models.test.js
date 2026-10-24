import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BOX_TYPES,makeDieline,panelAt,BOARD_THICKNESS} from '../src/geometry.js';
import {SELECTED_BOXES} from '../src/selected-structures.js';
import {SELECTED_CONTAINERS} from '../src/selected-containers.js';
import {SOURCE_CONTAINERS} from '../src/source-containers.generated.js';
import {createCylinderRibbonGeometry,updateCylinderRibbonPositions,buildContainerAccessories,createPanelGeometry} from '../src/model3d.js';
import {foldMatrices} from '../src/folding.js';
import {printRegions,inPrintRegions,regionPath} from '../src/artwork-space.js';

test('selected groups include all five box types and the complete food-can set',()=>{
  assert.equal(Object.keys(BOX_TYPES).length,32);
  assert.equal(Object.keys(SELECTED_BOXES).length,6); // Five selections plus the salt carton in C2.
  assert.equal(Object.keys(SELECTED_CONTAINERS).length,4); // C1, C2 high/low and C3.
  const d=makeDieline('card-deck-lock',BOX_TYPES['card-deck-lock'].defaults);
  for(const id of ['top-lock','bottom-lock'])assert.equal(d.panels.find(p=>p.id===id).parent,'glue');
  const full=makeDieline('full-overlap-shipper',BOX_TYPES['full-overlap-shipper'].defaults);
  assert.equal(full.panels.find(p=>p.id==='front-top').h,full.panels.find(p=>p.id==='right').w);
  const glued=makeDieline('glued-base-carton',BOX_TYPES['glued-base-carton'].defaults);
  assert.ok(glued.panels.find(p=>p.id==='top-tuck'));assert.equal(glued.panels.some(p=>p.id==='bottom-tuck'),false);
});

test('gable handle holes align when closed and remain empty in 2D print masks and 3D meshes',()=>{
  const d=makeDieline('gable-handle-carton',BOX_TYPES['gable-handle-carton'].defaults),root=d.panels[0],cx=root.x+root.w/2,cy=root.y+root.h/2,m=foldMatrices(d,1,cx,cy),centers=[];
  for(const id of ['front-handle','back-handle']){
    const p=d.panels.find(p=>p.id===id),hole=p.holes[0],x=(Math.min(...hole.map(p=>p[0]))+Math.max(...hole.map(p=>p[0])))/2,y=(Math.min(...hole.map(p=>p[1]))+Math.max(...hole.map(p=>p[1])))/2;
    assert.equal(panelAt(d,x,y),undefined);
    for(const side of ['outside','inside'])for(const display of [true,false]){
      const regions=printRegions(d,{},side,display),px=display&&side==='inside'?d.minX+d.maxX-x:x;
      assert.equal(inPrintRegions(regions,px,y),false);assert.ok(regionPath(regions).length>0);
    }
    const g=createPanelGeometry(p,d,cx,cy),mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    const ray=new THREE.Raycaster(new THREE.Vector3(x-cx,cy-y,5),new THREE.Vector3(0,0,-1));mesh.updateMatrixWorld(true);assert.equal(ray.intersectObject(mesh).length,0);
    centers.push(new THREE.Vector3(x-cx,cy-y,0).applyMatrix4(m.get(id)));g.dispose();mesh.material.dispose();
  }
  assert.ok(centers[0].distanceTo(centers[1])<1,'both handles meet at the roof ridge within paper clearance');
});

test('CC0 source meshes preserve real vertices, smooth wrapping, printable seam and valid UVs',()=>{
  for(const [type,info]of Object.entries(SELECTED_CONTAINERS).filter(([,t])=>t.sourceMesh)){
    const d=makeDieline(type,info.defaults),p=d.panels[0],g=createCylinderRibbonGeometry(p.w,p.h,d,p),uv=[...g.attributes.uv.array];
    assert.equal(SOURCE_CONTAINERS[info.sourceMesh].license,'CC0-1.0');
    assert.match(SOURCE_CONTAINERS[info.sourceMesh].sourceSHA256,/^[a-f0-9]{64}$/);
    for(const t of [0,.25,.6,1,.4,0]){
      updateCylinderRibbonPositions(g,p.w,p.h,info.defaults.length,t);
      assert.deepEqual([...g.attributes.uv.array],uv);
      for(let i=0;i<g.attributes.position.count;i++){
        const pos=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i),n=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i);
        assert.ok(pos.toArray().every(Number.isFinite));assert.ok(g.boundingBox.containsPoint(pos));assert.ok(Math.abs(n.length()-1)<1e-5);
      }
      if(!t){
        assert.ok(Math.abs(g.boundingBox.getSize(new THREE.Vector3()).z-BOARD_THICKNESS)<1e-5);
        for(let i=0;i<g.groups[0].count;i+=3){const xs=[0,1,2].map(j=>g.attributes.position.getX(g.index.getX(i+j)));assert.ok(Math.max(...xs)-Math.min(...xs)<p.w*.5,'flat seam must not produce sheet-wide triangles');}
      }
      if(t===1){
        const count=g.sourceRibbon.vertices.length;
        for(let i=0;i<count;i++){
          const v=g.sourceRibbon.vertices[i].p,out=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i),inside=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i+count),center=out.add(inside).multiplyScalar(.5),expected=new THREE.Vector3(v[0]*info.defaults.length,(v[1]-.5)*info.defaults.height,v[2]*info.defaults.length);
          assert.ok(center.distanceTo(expected)<1e-4,'closed shell must retain the imported source coordinates');
        }
      }
    }
    const hardware=buildContainerAccessories(type,d.cylinder);assert.ok(hardware.children.length);
    if(type==='screw-metal-tin')assert.ok(hardware.getObjectByName('Source_Screw_Cap'));
    g.dispose();for(const child of hardware.children){child.geometry.dispose();child.material.dispose();}
  }
});
