import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BOX_TYPES,makeDieline,BOARD_THICKNESS,panelAt} from '../src/geometry.js';
import {foldMatrices} from '../src/folding.js';
import {createCylinderRibbonGeometry,updateCylinderRibbonPositions,createPanelGeometry,pickPanel} from '../src/model3d.js';

test('circular labels have circular cut lines, hit areas, and actual 3D vertices',()=>{
  for(const type of ['beverage-can','glass-jar']){
    const d=makeDieline(type,BOX_TYPES[type].defaults),root=d.panels[0],cx=root.w/2,cy=root.y+root.h/2;
    for(const p of d.panels.slice(1)){
      assert.equal(panelAt(d,p.x+1,p.y+1),undefined);
      assert.equal(panelAt(d,p.x+p.w/2,p.y+p.h/2),p);
      const g=createPanelGeometry(p,d,cx,cy),pos=g.attributes.position;
      for(let i=0;i<pos.count;i++)assert.ok(Math.hypot(pos.getX(i)+cx-p.x-p.w/2,cy-pos.getY(i)-p.y-p.h/2)<=p.w/2+1e-4);
      g.dispose();
    }
  }
});

test('ribbon UVs keep the top of artwork at the top; bounds track folding in both directions',()=>{
  const d=makeDieline('beverage-can',BOX_TYPES['beverage-can'].defaults),p=d.panels[0],g=createCylinderRibbonGeometry(p.w,p.h,d,p);
  const uv=g.attributes.uv;
  assert.ok(uv.getY(32)>uv.getY(97),'top row must sample top of image');
  for(const t of [0,.25,.65,1,.4,0]){
    updateCylinderRibbonPositions(g,p.w,p.h,d.cylinder.diameter,t);
    const position=g.attributes.position,normal=g.attributes.normal;
    for(let i=0;i<position.count;i++){
      const v=new THREE.Vector3().fromBufferAttribute(position,i);
      assert.ok(g.boundingBox.containsPoint(v));
      assert.ok(v.distanceTo(g.boundingSphere.center)<=g.boundingSphere.radius+1e-4);
      assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(normal,i).length()-1)<1e-5);
    }
    if(t===1)assert.ok(Math.abs(g.boundingBox.max.x-g.boundingBox.min.x-66-BOARD_THICKNESS)<1e-4);
    if(t===0)assert.ok(Math.abs(g.boundingBox.max.x-g.boundingBox.min.x-p.w)<1e-4);
  }
  g.dispose();
});

test('selection stops at visible occluders and ignores hidden parent groups',()=>{
  const root=new THREE.Group(),hidden=new THREE.Group(),behind=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshBasicMaterial());
  behind.userData.panel='behind';root.add(behind);
  const front=behind.clone();front.userData={panel:'front'};front.position.z=1;root.add(front);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,5),new THREE.Vector3(0,0,-1));
  root.updateMatrixWorld(true);assert.deepEqual(pickPanel(ray,root),{panel:'front',side:'outside'});
  hidden.add(front);root.add(hidden);hidden.visible=false;root.updateMatrixWorld(true);
  assert.equal(pickPanel(ray,root).panel,'behind');
  hidden.visible=true;front.userData={};root.updateMatrixWorld(true);assert.equal(pickPanel(ray,root),null);
  front.geometry.dispose();front.material.dispose();
});

test('closed nested boxes and overlapping bottom flaps have distinct planes with board clearance',()=>{
  const pairs={'lidbox':[['front','lid-left-front-ear'],['back','lid-left-back-ear']], 'drawer-box':[['base','sleeve-bottom'],['front','sleeve-front'],['back','sleeve-back'],['back','sleeve-glue']], 'book-box':[['base','hardcover-base'],['back','spine'],['front','lip']], 'lock-bottom':[['front-bottom','back-bottom'],['back-bottom','left-bottom']]};
  for(const [type,list] of Object.entries(pairs)){
    const d=makeDieline(type,BOX_TYPES[type].defaults),r=d.panels[0],cx=r.x+r.w/2,cy=r.y+r.h/2,m=foldMatrices(d,1,cx,cy);
    for(const [a,b] of list){
      const p=d.panels.find(p=>p.id===a),q=d.panels.find(p=>p.id===b);
      const point=p=>new THREE.Vector3(p.x+p.w/2-cx,cy-p.y-p.h/2,0).applyMatrix4(m.get(p.id));
      const normal=new THREE.Vector3(0,0,1).transformDirection(m.get(a));
      const distance=Math.abs(point(q).sub(point(p)).dot(normal));
      assert.ok(distance>BOARD_THICKNESS,`${type} ${a}/${b} clearance ${distance}`);
    }
  }
});
