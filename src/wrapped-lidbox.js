// Rigid-box covering blanks: walls and turn-ins form a cross, without glue ears.
export const WRAPPED_LIDBOXES={
  'wrapped-lidbox':{name:'天地盖 · 硬盒包边',english:'WRAPPED TWO PIECE BOX',family:'tray',category:'gift',printPanel:'lid',description:'分体天地盖 · 十字包纸 · 四边内包边',aliases:['天地盖盒子','硬盒','包边','包装盒型'],defaults:{length:220,depth:140,height:30,lidHeight:30,turnIn:20,lidClearance:1.5}},
};
export function wrappedLidSettings(dims){
  const {length:L,depth:D,height:H}=dims;
  const value=(key,fallback,min,max)=>{const n=dims[key]??fallback;if(!Number.isFinite(n))throw Error('天地盖参数需为有效数值');return Math.max(min,Math.min(max,n));};
  return {L,D,H,lidH:value('lidHeight',Math.min(30,H),5,H),U:value('turnIn',20,2,Math.max(2,H*.9)),C:value('lidClearance',1.5,.5,5)};
}
export function makeWrappedLidbox(dims,add){
  const b=wrappedLidSettings(dims),{L,D,H,U,C,lidH}=b;
  function blank(prefix,x,y,w,d,h,parent=null){
    const id=key=>prefix?prefix+'-'+key:key,baseId=prefix==='lid'?'lid':'base',u=Math.min(U,h*.9);
    const bx=x+h+u,by=y+h+u,base=add(baseId,prefix?'上盖顶面':'底面',bx,by,w,d,parent);
    for(const [side,label,px,py,pw,ph,axis,hx,hy,angle,tx,ty,tw,th]of [
      ['front','前',bx,by+d,w,h,'x',bx,by+d,90,bx,by+d+h,w,u],
      ['back','后',bx,by-h,w,h,'x',bx,by,-90,bx,by-h-u,w,u],
      ['left','左',bx-h,by,h,d,'y',bx,by,-90,bx-h-u,by,u,d],
      ['right','右',bx+w,by,h,d,'y',bx+w,by,90,bx+w+h,by,u,d],
    ]){
      const wall=add(id(side),(prefix?'上盖':'底盒')+label+'壁',px,py,pw,ph,baseId,{x:hx,y:hy,axis},angle);wall.foldWindow=[0,.6];
      const turn=add(id(side+'-turn'),(prefix?'上盖':'底盒')+label+'包边',tx,ty,tw,th,wall.id,{x:side==='left'?bx-h:side==='right'?bx+w+h:bx,y:side==='back'?by-h:side==='front'?by+d+h:by,axis},Math.sign(angle)*180,'flap');
      turn.foldWindow=[.5,1];turn.inset=.55;
    }
    return base;
  }
  blank('',0,0,L,D,H);
  const lid=blank('lid',L+2*(H+U)+30,0,L+2*C,D+2*C,lidH,'base');
  lid.assembly={target:[0,0,-H-C],rotationX:180};lid.foldWindow=[.35,1];
  return {rootId:'base',wrappedLid:b};
}
