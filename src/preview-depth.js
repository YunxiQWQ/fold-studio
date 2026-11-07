import {Box3,Vector3} from 'three';

const worldBounds=new Box3(),partBounds=new Box3(),viewBounds=new Box3(),size=new Vector3();

// Millimetre-scale cardboard needs much more depth precision than a fixed
// 0.1–20000 camera gives at the distance used by a narrow preview panel.
// Refit to visible geometry after orbit, zoom, folding or panel isolation.
export function fitPreviewDepth(camera,root){
  root.updateWorldMatrix(true,true);camera.updateMatrixWorld();worldBounds.makeEmpty();
  root.traverseVisible(object=>{
    if(!object.isMesh||!object.geometry)return;
    const geometry=object.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();
    partBounds.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld);worldBounds.union(partBounds);
  });
  if(worldBounds.isEmpty())return;
  const extent=worldBounds.getSize(size).length();
  viewBounds.copy(worldBounds).applyMatrix4(camera.matrixWorldInverse);
  const closest=-viewBounds.max.z,farthest=-viewBounds.min.z;
  if(!Number.isFinite(extent+closest+farthest)||farthest<=0)return;
  const near=closest>0?Math.max(.001,closest*.5):Math.max(.01,Math.min(.5,extent*.001));
  const far=Math.max(near*2,farthest+Math.max(1,extent*.05));
  if(camera.near!==near||camera.far!==far){camera.near=near;camera.far=far;camera.updateProjectionMatrix();}
}
