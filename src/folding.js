import { Matrix4, Vector3 } from 'three';
import { foldProgress } from './geometry.js';
import {curvedPoint} from './curved-carton.js';

export function foldMatrices(dieline, progress, cx, cy) {
  const transforms=new Map(),byId=new Map(dieline.panels.map(p=>[p.id,p]));
  const compute=panel=>{
    if(transforms.has(panel.id))return transforms.get(panel.id);
    const matrix=new Matrix4();
    if(panel.parent){
      matrix.copy(compute(byId.get(panel.parent)));
      const fraction=foldProgress(panel,progress);
      if(panel.hingeOffset){const offset=panel.hingeOffset,f=Math.max(0,Math.min(1,(progress-offset.window[0])/(offset.window[1]-offset.window[0]))),dy=offset.angle!==undefined?offset.height*(Math.cos(offset.angle*f)-1):offset.y*f;matrix.multiply(new Matrix4().makeTranslation(0,dy,0));}
      if(panel.assembly){
        const x=panel.x+panel.w/2-cx,y=-(panel.y+panel.h/2-cy),[tx,ty,tz]=panel.assembly.target;
        matrix.multiply(new Matrix4().makeTranslation(x+(tx-x)*fraction,y+(ty-y)*fraction,tz*fraction)).multiply(new Matrix4().makeRotationX(panel.assembly.rotationX*Math.PI/180*fraction)).multiply(new Matrix4().makeTranslation(-x,-y,0));
      }else if(panel.bodyAttachment){
        const {x,y}=panel.hinge,a=new Vector3(...curvedPoint(x,y,dieline,progress,cx,cy)),b=new Vector3(...curvedPoint(x+panel.w,y,dieline,progress,cx,cy));
        const ex=b.sub(a).normalize(),ey=new Vector3(0,1,0),ez=new Vector3().crossVectors(ex,ey).normalize();
        matrix.makeBasis(ex,ey,ez).setPosition(a)
          .multiply(new Matrix4().makeRotationX(panel.angle*Math.PI/180*fraction))
          .multiply(new Matrix4().makeTranslation(-(x-cx),-(cy-y),0));
      }else if(panel.hinge.hidden){
        // Curved body pieces deform their vertices in sheet coordinates.
      }else if(panel.hinge.segment){
        const [p1, p2] = panel.hinge.segment;
        const x1 = p1[0] - cx, y1 = -(p1[1] - cy);
        const x2 = p2[0] - cx, y2 = -(p2[1] - cy);
        const axis = new Vector3(x2 - x1, y2 - y1, 0).normalize();
        const angle = panel.angle * Math.PI / 180 * fraction;
        matrix.multiply(new Matrix4().makeTranslation(x1, y1, 0))
              .multiply(new Matrix4().makeRotationAxis(axis, angle))
              .multiply(new Matrix4().makeTranslation(-x1, -y1, 0));
      }else{
        const x=panel.hinge.x-cx,y=-(panel.hinge.y-cy),rotation=new Matrix4(),angle=panel.angle*Math.PI/180*fraction;
        if(panel.hinge.axis==='x')rotation.makeRotationX(angle);else rotation.makeRotationY(angle);
        matrix.multiply(new Matrix4().makeTranslation(x,y,0)).multiply(rotation).multiply(new Matrix4().makeTranslation(-x,-y,0));
      }
      if(panel.inset)matrix.multiply(new Matrix4().makeTranslation(0,0,panel.inset*fraction));
    }
    transforms.set(panel.id,matrix);return matrix;
  };
  for(const panel of dieline.panels)compute(panel);
  return transforms;
}
