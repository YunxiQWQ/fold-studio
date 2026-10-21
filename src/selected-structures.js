// Independent Fold Studio geometry for the user-selected construction types.
// No captured commercial dielines or embedded calibration fixtures are used.
export const SELECTED_BOXES={
  'card-deck-lock':{name:'锁盖卡牌盒',english:'REOPENABLE LOCK LID DECK BOX',family:'carton',category:'carton',printPanel:'front',description:'P1 · 独立锁片 · 侧翼托盖 · 可重复开合',defaults:{length:70,depth:24,height:100}},
  'display-hinged':{name:'翻盖展示盒',english:'HINGED DISPLAY CARTON',family:'tray',category:'carton',printPanel:'lid',description:'P2 · 翻盖展示 · 双层侧壁 · 插翼与锁舌',defaults:{length:180,depth:120,height:65}},
  'full-overlap-shipper':{name:'全搭盖运输箱',english:'FULL OVERLAP SLOTTED CONTAINER',family:'carton',category:'shipping',printPanel:'front',description:'P3 · 长摇盖全搭接 · 0206 结构类型',defaults:{length:260,depth:180,height:200}},
  'gable-handle-carton':{name:'直顶提手盒',english:'GABLE HANDLE CARTON',family:'tray',category:'gift',printPanel:'front',viewDirection:[1,1,-1.6],description:'P4 · 直顶提手 · 坡顶围合 · 真实提手镂空',defaults:{length:160,depth:90,height:140}},
  'glued-base-carton':{name:'胶底插盖零售盒',english:'GLUED BASE TUCK TOP CARTON',family:'carton',category:'carton',printPanel:'front',description:'P5 · 胶合底盖 · 顶部插舌 · 食品日化彩盒',defaults:{length:110,depth:65,height:170}},
  'salt-carton':{name:'盐纸盒',english:'SALT RETAIL CARTON',family:'carton',category:'carton',printPanel:'front',description:'C2 组合 · 窄身盐纸盒 · 独立参数化刀版',defaults:{length:34,depth:27,height:85}},
};

function roundTongue(p,up){
  const {x,y,w,h}=p,r=Math.min(5,w*.15,h*.4),base=up?y+h:y,tip=up?y:y+h;
  const pts=[[x,base],[x,up?tip+r:tip-r]];
  const arc=(cx,cy,a,b)=>{for(let i=1;i<=8;i++){const t=a+(b-a)*i/8;pts.push([cx+r*Math.cos(t),cy+r*Math.sin(t)]);}};
  if(up){arc(x+r,tip+r,Math.PI,1.5*Math.PI);pts.push([x+w-r,tip]);arc(x+w-r,tip+r,1.5*Math.PI,2*Math.PI);}
  else{arc(x+r,tip-r,Math.PI,Math.PI/2);pts.push([x+w-r,tip]);arc(x+w-r,tip-r,Math.PI/2,0);}
  pts.push([x+w,base]);p.points=pts;
}
function hole(cx,cy,w,h){
  const r=Math.min(h/2,w/2),pts=[];
  for(const [x,y,a]of [[cx+w/2-r,cy-h/2+r,-90],[cx+w/2-r,cy+h/2-r,0],[cx-w/2+r,cy+h/2-r,90],[cx-w/2+r,cy-h/2+r,180]])for(let i=0;i<=8;i++){const angle=(a+i*90/8)*Math.PI/180;pts.push([x+r*Math.cos(angle),y+r*Math.sin(angle)]);}
  return pts;
}
function tuck(add,id,label,parent,x,edge,L,D,up){
  const p=add(id,label,x,up?edge-D:edge,L,D,parent,{x,y:edge,axis:'x'},up?-90:90,'flap');p.foldWindow=[.62,.91];p.inset=0;
  const h=Math.min(16,D*.4),hy=up?p.y:p.y+D;
  const tab=add(id+'-tuck',up?'上插舌':'下插舌',x,up?hy-h:hy,L,h,id,{x,y:hy,axis:'x'},up?-90:90,'tuck');tab.foldWindow=[.88,1];roundTongue(tab,up);
}
function tube(add,L,D,H,margin){
  const x=D,y=margin;
  const front=add('front','正面',x,y,L,H);
  add('left','左侧',0,y,D,H,'front',{x,y,axis:'y'},-90);
  add('right','右侧',D+L,y,D,H,'front',{x:D+L,y,axis:'y'},90);
  add('back','背面',2*D+L,y,L,H,'right',{x:2*D+L,y,axis:'y'},90);
  const glue=add('glue','侧粘口',2*(D+L),y,Math.min(18,D*.75,L*.25),H,'back',{x:2*(D+L),y,axis:'y'},90,'glue');
  for(const p of [front])p.foldWindow=[0,.30];
  return{x,y,glue};
}
function dust(add,id,parent,x,edge,w,h,up,window=[.25,.60]){
  const p=add(id,up?'上防尘翼':'下防尘翼',x,up?edge-h:edge,w,h,parent,{x,y:edge,axis:'x'},up?-90:90,'dust');
  const b=Math.min(3,w*.12,h*.2);p.points=up?[[x,edge],[x+b,edge-h],[x+w-b,edge-h],[x+w,edge]]:[[x,edge],[x+w,edge],[x+w-b,edge+h],[x+b,edge+h]];
  p.foldWindow=window;return p;
}
export function makeSelectedStructure(type,dimensions,add){
  const {length:L,depth:D,height:H}=dimensions;
  if(type==='display-hinged'||type==='gable-handle-carton')return trayStructure(type,dimensions,add);
  const margin=Math.max(D,Math.min(L/2,D))+Math.min(16,D*.4),{x,y,glue}=tube(add,L,D,H,margin);
  if(type==='card-deck-lock'){
    for(const up of [true,false]){
      const edge=up?y:y+H,suffix=up?'top':'bottom',angle=up?-90:90;
      // Two side flaps meet beneath the re-openable full-depth front lid.
      for(const [id,px]of [['left',0],['right',D+L]])dust(add,`${id}-${suffix}`,id,px,edge,D,Math.min(L/2,L-.5),up,[.30,.55]);
      const inner=Math.max(2,D-Math.min(6,D*.25));
      for(const [id,label,px,w,parent]of [[`${suffix}-inner`,'内托片',2*D+L,L,'back'],[`${suffix}-lock`,'独立锁片',glue.x,glue.w,'glue']]){
        const p=add(id,label,px,up?edge-inner:edge,w,inner,parent,{x:px,y:edge,axis:'x'},angle,'dust');p.foldWindow=[.55,.78];p.inset=-1.3;
      }
      const lid=add(suffix,up?'可开合顶盖':'可开合底盖',x,up?edge-D:edge,L,D,'front',{x,y:edge,axis:'x'},angle,'flap');lid.foldWindow=[.78,1];lid.inset=0;
    }
  }else if(type==='full-overlap-shipper'){
    for(const [id,px,w]of [['front',D,L],['back',2*D+L,L],['left',0,D],['right',D+L,D]])for(const up of [true,false]){
      const main=id==='front'||id==='back',edge=up?y:y+H,h=main?D:Math.min(L/2,D);
      const p=add(`${id}-${up?'top':'bottom'}`,main?'全搭盖长摇盖':'内短摇盖',px,up?edge-h:edge,w,h,id,{x:px,y:edge,axis:'x'},up?-90:90,main?'flap':'dust');
      p.foldWindow=main?(id==='front'?[.70,1]:[.45,.75]):[.20,.48];p.inset=id==='front'?0:id==='back'?-.65:-1.3;
    }
  }else{
    tuck(add,'top','上插盖','front',x,y,L,D,true);
    for(const [id,px]of [['left',0],['right',D+L]])dust(add,id+'-top',id,px,y,D,Math.min(D*.65,L*.45),true);
    if(type==='salt-carton'){
      tuck(add,'bottom','下插盖','front',x,y+H,L,D,false);
      for(const [id,px]of [['left',0],['right',D+L]])dust(add,id+'-bottom',id,px,y+H,D,Math.min(D*.65,L*.45),false);
    }else{
      for(const [id,px,w]of [['front',D,L],['back',2*D+L,L],['left',0,D],['right',D+L,D]]){
        const main=id==='front'||id==='back',h=main?D:Math.min(L/2,D);
        const p=add(id+'-bottom',main?'底部胶合主盖':'底部胶合内翼',px,y+H,w,h,id,{x:px,y:y+H,axis:'x'},90,main?'flap':'dust');
        p.foldWindow=main?(id==='front'?[.45,.7]:[.3,.5]):[.1,.35];p.inset=id==='front'?0:id==='back'?-.65:-1.3;
      }
    }
  }
  return{rootId:'front'};
}

function trayStructure(type,{length:L,depth:D,height:totalH},add){
  const gable=type==='gable-handle-carton',roofRise=Math.min(D*.34,totalH*.22),handleH=Math.min(28,D*.28,totalH*.18),H=gable?totalH-roofRise-handleH:totalH,roof=Math.hypot(D/2,roofRise);
  const x=H+(gable?roofRise:0)+8,y=H+(gable?roof+handleH:D+Math.min(16,H*.5))+8;
  add('base','底面',x,y,L,D);
  add('front','前壁',x,y+D,L,H,'base',{x,y:y+D,axis:'x'},90).foldWindow=[0,.38];
  add('back','后壁',x,y-H,L,H,'base',{x,y,axis:'x'},-90).foldWindow=[0,.38];
  const left=add('left','左侧壁',x-H,y,H,D,'base',{x,y,axis:'y'},-90),right=add('right','右侧壁',x+L,y,H,D,'base',{x:x+L,y,axis:'y'},90);
  left.foldWindow=right.foldWindow=[.15,.5];
  const ear=Math.min(H*.65,D*.2,L*.2);
  for(const [id,px]of [['left',x-H],['right',x+L]])for(const [end,py,edge,angle]of [['back',y-ear,y,-90],['front',y+D,y+D,90]]){
    const p=add(`${id}-${end}-ear`,'角部粘耳',px,py,H,ear,id,{x:px,y:edge,axis:'x'},angle,'corner');p.foldWindow=[.05,.3];
    const b=Math.min(3,ear*.25);p.points=end==='back'?[[px,edge],[px+b,py],[px+H-b,py],[px+H,edge]]:[[px,py],[px+H,py],[px+H-b,py+ear],[px+b,py+ear]];
  }
  if(gable){
    left.points=[[x,y],[x-H,y],[x-H-roofRise,y+D/2],[x-H,y+D],[x,y+D]];left.x-=roofRise;left.w+=roofRise;
    right.points=[[x+L,y],[x+L+H,y],[x+L+H+roofRise,y+D/2],[x+L+H,y+D],[x+L,y+D]];right.w+=roofRise;
    const a=Math.atan2(D/2,roofRise)*180/Math.PI;
    for(const [id,parent,edge,py,sign]of [['front-roof','front',y+D+H,y+D+H,1],['back-roof','back',y-H,y-H-roof,-1]]){
      const p=add(id,'斜顶盖',x,py,L,roof,parent,{x,y:edge,axis:'x'},sign*a,'flap');p.foldWindow=[.5,.85];p.inset=0;
      const hy=sign>0?py+roof:py,hpy=sign>0?hy:hy-handleH;
      const handle=add(parent+'-handle',parent==='front'?'前提手':'后提手',x,hpy,L,handleH,id,{x,y:hy,axis:'x'},-sign*a,'flap');handle.foldWindow=[.5,.85];handle.inset=parent==='front'?.35:-.35;
      handle.holes=[hole(x+L/2,hpy+handleH/2,Math.min(L*.58,L-6),handleH*.42)];
    }
  }else{
    // Rolled side walls with a shallow bridge and an inner return wall.
    for(const [id,outer,sign]of [['left',x-H,-1],['right',x+L+H,1]]){
      const bridgeW=1.3,returnW=H-1;
      const bridge=add(id+'-bridge','侧壁折返桥',sign<0?outer-bridgeW:outer,y,bridgeW,D,id,{x:outer,y,axis:'y'},sign*90,'flap');bridge.foldWindow=[.35,.65];bridge.inset=0;
      const hx=sign<0?outer-bridgeW:outer+bridgeW;
      const inner=add(id+'-inner','内折侧壁',sign<0?hx-returnW:hx,y,returnW,D,id+'-bridge',{x:hx,y,axis:'y'},sign*90,'flap');inner.foldWindow=[.45,.72];inner.inset=0;
    }
    const ly=y-H-D,lid=add('lid','翻盖展示主面',x,ly,L,D,'back',{x,y:y-H,axis:'x'},-90,'flap');lid.foldWindow=[.62,1];lid.inset=0;
    const tabH=Math.min(18,H*.55),tab=add('lid-tuck','前锁舌',x,ly-tabH,L,tabH,'lid',{x,y:ly,axis:'x'},-90,'tuck');tab.foldWindow=[.88,1];roundTongue(tab,true);
    const wingH=Math.min(H*.7,D*.35),gap=1;
    for(const [id,px,hx,angle]of [['lid-left',x-wingH,x,-90],['lid-right',x+L,x+L,90]]){
      const p=add(id,'翻盖插翼',px,ly+gap,wingH,D-2*gap,'lid',{x:hx,y:ly+gap,axis:'y'},angle,'dust');p.foldWindow=[.4,.7];
    }
  }
  return{rootId:'base'};
}
