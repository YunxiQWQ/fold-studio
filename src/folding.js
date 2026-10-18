import { Matrix4 } from 'three';
import { foldProgress } from './geometry.js';

export function foldMatrices(dieline, progress, cx, cy) {
  const transforms=new Map(),byId=new Map(dieline.panels.map(p=>[p.id,p]));
  const compute=panel=>{
    if(transforms.has(panel.id))return transforms.get(panel.id);
    const matrix=new Matrix4();
    if(panel.parent){
      matrix.copy(compute(byId.get(panel.parent)));
      const fraction=foldProgress(panel,progress);
      if(panel.assembly){
        const x=panel.x+panel.w/2-cx,y=-(panel.y+panel.h/2-cy),[tx,ty,tz]=panel.assembly.target;
        matrix.multiply(new Matrix4().makeTranslation(x+(tx-x)*fraction,y+(ty-y)*fraction,tz*fraction)).multiply(new Matrix4().makeRotationX(panel.assembly.rotationX*Math.PI/180*fraction)).multiply(new Matrix4().makeTranslation(-x,-y,0));
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
