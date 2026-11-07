import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,PerspectiveCamera,Vector3} from 'three';
import {fitPreviewDepth} from '../src/preview-depth.js';

test('cardboard clearance remains distinguishable in a 24-bit depth buffer after distant fitting',()=>{
  const root=new Group(),mesh=new Mesh(new BoxGeometry(200,150,.45),new MeshBasicMaterial());root.add(mesh);
  const camera=new PerspectiveCamera(34,.4,.1,20000);
  const depth=point=>Math.round((point.clone().project(camera).z+1)*.5*(2**24-1));
  for(const distance of [300,1600,12000]){
    camera.position.set(0,0,distance);camera.lookAt(0,0,0);fitPreviewDepth(camera,root);
    assert.ok(Math.abs(depth(new Vector3(0,0,.225))-depth(new Vector3(0,0,.045)))>16,'the 0.18 mm gap must not collapse to one depth value at '+distance);
    for(const x of [-100,100])for(const y of [-75,75])for(const z of [-.225,.225]){
      const projected=new Vector3(x,y,z).project(camera);assert.ok(projected.z>-1&&projected.z<1,'both faces remain inside depth clipping');
    }
  }
  mesh.geometry.dispose();mesh.material.dispose();
});

test('depth fitting follows visible transformed geometry, isolation, orbit and close inspection',()=>{
  const root=new Group(),group=new Group(),mesh=new Mesh(new BoxGeometry(200,150,70),new MeshBasicMaterial());group.add(mesh);group.rotation.set(.2,.5,.1);root.add(group);
  const hidden=new Mesh(new BoxGeometry(100,100,100),mesh.material);hidden.position.z=100000;hidden.visible=false;root.add(hidden);
  const camera=new PerspectiveCamera(34,1,.1,20000);
  for(const position of [[400,300,1000],[-500,0,700],[2,1,12]]){
    camera.position.set(...position);camera.lookAt(0,0,0);fitPreviewDepth(camera,root);assert.ok(camera.near>0&&camera.near<camera.far);assert.ok(camera.far<2000,'invisible geometry must not inflate the range');
    if(position[2]>100)for(const x of [-100,100])for(const y of [-75,75])for(const z of [-35,35]){
      const projected=mesh.localToWorld(new Vector3(x,y,z)).project(camera);assert.ok(projected.z>-1&&projected.z<1,'rotated geometry is not clipped');
    }
  }
  root.remove(group,hidden);const previous=[camera.near,camera.far];fitPreviewDepth(camera,root);assert.deepEqual([camera.near,camera.far],previous);
  mesh.geometry.dispose();hidden.geometry.dispose();mesh.material.dispose();
});
