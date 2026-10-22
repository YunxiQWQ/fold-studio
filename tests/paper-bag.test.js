import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BOX_TYPES,makeDieline,cutSegments,panelAt} from '../src/geometry.js';
import {PAPER_BAG_PRESETS,paperBagSettings,updateBagBottomGeometry,buildPaperBagHandles,updatePaperBagHandles} from '../src/paper-bag.js';
import {createPanelGeometry} from '../src/model3d.js';
import {foldMatrices} from '../src/folding.js';
import {newProject,validateProject} from '../src/project.js';
import {printRegions,inPrintRegions} from '../src/artwork-space.js';

test('one paper-bag construction retains all three reference blanks and continuous crease-only interior',()=>{
  assert.equal(Object.keys(BOX_TYPES).filter(t=>BOX_TYPES[t].family==='bag').length,1);
  for(const [id,expected]of Object.entries({landscape:[1133,436],square:[885,350],portrait:[625,427]})){
    const d=makeDieline('paper-shopping-bag',PAPER_BAG_PRESETS[id]);assert.deepEqual([d.width,d.height],expected);
    const holes=d.panels.flatMap(p=>p.holes??[]),edgeInHole=(a,b)=>holes.some(h=>h.some((v,i)=>Math.hypot(v[0]-a[0],v[1]-a[1])<1e-7&&Math.hypot(h[(i+1)%h.length][0]-b[0],h[(i+1)%h.length][1]-b[1])<1e-7));
    for(const [a,b]of cutSegments(d))assert.ok((a[0]===0&&b[0]===0)||(a[0]===d.width&&b[0]===d.width)||(a[1]===0&&b[1]===0)||(a[1]===d.height&&b[1]===d.height)||edgeInHole(a,b),'internal seam became a slit');
    assert.equal(d.extraCreases.filter(c=>c.id.startsWith('bag-gusset')).length,2);
  }
});

test('rope punch holes align with the folded reinforcement and remain absent from both print surfaces',()=>{
  const d=makeDieline('paper-shopping-bag',PAPER_BAG_PRESETS.square),front=d.panels[0],cx=front.x+front.w/2,cy=front.y+front.h/2,m=foldMatrices(d,1,cx,cy);
  assert.equal(d.panels.reduce((n,p)=>n+(p.holes?.length??0),0),8);
  for(const id of ['front','back']){
    const wall=d.panels.find(p=>p.id===id),hem=d.panels.find(p=>p.id===id+'-hem');
    for(let i=0;i<2;i++){
      const center=h=>h.reduce((s,p)=>s.add(new THREE.Vector2(...p)),new THREE.Vector2()).multiplyScalar(1/h.length),a=center(wall.holes[i]),b=center(hem.holes[i]);
      const pa=new THREE.Vector3(a.x-cx,cy-a.y,0).applyMatrix4(m.get(id)),pb=new THREE.Vector3(b.x-cx,cy-b.y,0).applyMatrix4(m.get(hem.id));
      assert.ok(pa.distanceTo(pb)<1);
      assert.equal(panelAt(d,a.x,a.y),undefined);
      for(const side of ['outside','inside'])assert.equal(inPrintRegions(printRegions(d,{},side),a.x,a.y),false);
    }
  }
  const ribbon=makeDieline('paper-shopping-bag',PAPER_BAG_PRESETS.landscape);assert.ok(ribbon.panels.every(p=>!p.holes));
});

test('all bag presets keep stable UVs and finite two-sided folded bottoms; flat exports omit separate handles',()=>{
  for(const dimensions of Object.values(PAPER_BAG_PRESETS)){
    const d=makeDieline('paper-shopping-bag',dimensions),front=d.panels[0],cx=front.x+front.w/2,cy=front.y+front.h/2;
    for(const p of d.panels.filter(p=>p.bagBottom)){
      const g=createPanelGeometry(p,d,cx,cy),uv=[...g.attributes.uv.array];
      for(const t of [0,.45,.78,1,.3,0]){
        updateBagBottomGeometry(g,p,d,t,cx,cy);
        assert.deepEqual([...g.attributes.uv.array],uv);
        assert.ok([...g.attributes.position.array,...g.attributes.normal.array].every(Number.isFinite));
      }
      g.dispose();
    }
    const handles=buildPaperBagHandles(d,cx,cy);assert.equal(handles.children.length,2);
    for(const t of [0,.78,1]){updatePaperBagHandles(handles,foldMatrices(d,t,cx,cy),t);assert.equal(handles.visible,t>.55);}
    for(const mesh of handles.children){assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));mesh.geometry.dispose();mesh.material.dispose();}
    const project=newProject('paper-shopping-bag');project.dimensions={...dimensions};assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))),project);
  }
  assert.throws(()=>paperBagSettings({...PAPER_BAG_PRESETS.square,topFold:NaN}));
  assert.throws(()=>paperBagSettings({...PAPER_BAG_PRESETS.square,handleStyle:'unknown'}));
  assert.ok(paperBagSettings({...PAPER_BAG_PRESETS.square,depth:180,bottomFold:10}).bottomFold>90,'bottom leaves retain overlap when depth changes');
});
