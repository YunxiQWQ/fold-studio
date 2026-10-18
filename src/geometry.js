export const BOARD_THICKNESS=.45;
const STACK_GAP=BOARD_THICKNESS*1.4;
export const BOX_TYPES={
  carton:{name:'顺插舌纸盒',english:'STRAIGHT TUCK CARTON',family:'carton',category:'carton',printPanel:'front',description:'上下同向插舌',defaults:{length:110,depth:65,height:170}},
  'reverse-carton':{name:'反插舌纸盒',english:'REVERSE TUCK CARTON',family:'carton',category:'carton',printPanel:'front',description:'上下反向插舌',defaults:{length:85,depth:50,height:140}},
  'lock-bottom':{name:'扣底彩盒',english:'LOCK BOTTOM CARTON',family:'carton',category:'carton',printPanel:'front',description:'插舌顶盖 · 扣锁底盖',defaults:{length:90,depth:60,height:150}},
  mailer:{name:'翻盖飞机盒',english:'HINGED LID MAILER',family:'tray',category:'shipping',printPanel:'lid',description:'连体翻盖 · 插舌侧翼',defaults:{length:220,depth:155,height:55}},
  lidbox:{name:'天地盖盒',english:'TWO PIECE LID BOX',family:'tray',category:'gift',printPanel:'lid',description:'分体上盖 · 自动合盖',defaults:{length:185,depth:135,height:65}},
  'drawer-box':{name:'抽拉抽屉盒',english:'SLIDING DRAWER BOX',family:'tray',category:'gift',printPanel:'sleeve-top',description:'外封套 · 内抽屉 · 滑合',defaults:{length:150,depth:100,height:45}},
  'book-box':{name:'书型翻盖盒',english:'BOOK STYLE BOX',family:'tray',category:'gift',printPanel:'cover',description:'精装硬壳 · 书本翻盖',defaults:{length:160,depth:110,height:40}},
  shipper:{name:'对口运输箱',english:'REGULAR SLOTTED CARTON',family:'carton',category:'shipping',printPanel:'front',description:'对口摇盖 · 运输包装',defaults:{length:260,depth:180,height:200}},
  sleeve:{name:'包装腰封',english:'PACKAGING SLEEVE',family:'carton',category:'shipping',printPanel:'front',description:'两端开放 · 四面围合',defaults:{length:140,depth:55,height:100}},
  tray:{name:'开放托盘',english:'OPEN TOP TRAY',family:'tray',category:'shipping',printPanel:'base',description:'四壁折起 · 角部粘耳',defaults:{length:170,depth:120,height:42}},
  'beverage-can':{name:'易拉饮料罐',english:'BEVERAGE CAN',family:'container',category:'container',printPanel:'body',description:'330ml 铝罐 · 360° 环绕罐标',defaults:{length:66,depth:66,height:115}},
  'glass-jar':{name:'广口玻璃罐',english:'GLASS JAR',family:'container',category:'container',printPanel:'body',description:'通透玻璃瓶 · 围裹标签 · 金色旋盖',defaults:{length:72,depth:72,height:95}},
};
function rectangle(id,label,x,y,w,h,parent=null,hinge=null,angle=0,kind='body'){
  return{id,label,x,y,w,h,parent,hinge,angle,kind,points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],inset:['dust','tuck','glue','corner'].includes(kind)?-STACK_GAP:0};
}
export function makeDieline(type,dimensions){
  if(!Object.hasOwn(BOX_TYPES,type))throw new Error('不支持的盒型');
  const{length:L,depth:D,height:H}=dimensions;
  for(const value of[L,D,H])if(!Number.isFinite(value)||value<15||value>600)throw new Error('尺寸需介于 15–600 mm');
  const panels=[],add=(...args)=>{const p=rectangle(...args);panels.push(p);return p;};let rootId;
  const addTray=(prefix,x,y,w,d,h,parent=null)=>{
    const id=name=>prefix?`${prefix}-${name}`:name,baseId=prefix==='lid'?'lid':id('base');
    const base=add(baseId,prefix?'上盖顶面':'底面',x+h,y+h,w,d,parent);
    add(id('front'),prefix?'上盖前壁':'前壁',x+h,y+h+d,w,h,baseId,{x:x+h,y:y+h+d,axis:'x'},90);
    add(id('back'),prefix?'上盖后壁':'后壁',x+h,y,w,h,baseId,{x:x+h,y:y+h,axis:'x'},-90);
    add(id('left'),prefix?'上盖左壁':'左壁',x,y+h,h,d,baseId,{x:x+h,y:y+h,axis:'y'},-90);
    add(id('right'),prefix?'上盖右壁':'右壁',x+h+w,y+h,h,d,baseId,{x:x+h+w,y:y+h,axis:'y'},90);
    const ear=Math.min(w*.2,d*.2,h*.8);
    for(const[side,px]of[['left',x],['right',x+h+w]])for(const[edge,py,fy,angle]of[['back',y+h-ear,y+h,-90],['front',y+h+d,y+h+d,90]]){
      const p=add(id(`${side}-${edge}-ear`),`${prefix?'上盖':''}${side==='left'?'左':'右'}${edge==='front'?'前':'后'}粘耳`,px,py,h,ear,id(side),{x:px,y:fy,axis:'x'},angle,'corner');
      const bevel=Math.min(4,h*.15,ear*.25);
      p.points=edge==='back'?[[px,fy],[px+bevel,py],[px+h-bevel,py],[px+h,fy]]:[[px,py],[px+h,py],[px+h-bevel,py+ear],[px+bevel,py+ear]];
    }
    return base;
  };
  if(BOX_TYPES[type].family==='tray'){
    rootId='base';addTray('',0,0,L,D,H);
    if(type==='mailer'){
      const lid=add('lid','翻盖顶面',H,-D,L,D,'back',{x:H,y:0,axis:'x'},-90,'lid');lid.foldWindow=[.40,.90];
      const tuck=Math.min(H*.65,25),p=add('lid-tuck','前插舌',H,-D-tuck,L,tuck,'lid',{x:H,y:-D,axis:'x'},-90,'tuck');
      const bevel=Math.min(7,L*.08,tuck*.4);p.points=[[H,-D],[H+bevel,-D-tuck],[H+L-bevel,-D-tuck],[H+L,-D]];
      const wing=Math.min(H*.7,25);
      add('lid-left-wing','翻盖左插翼',H-wing,-D,wing,D,'lid',{x:H,y:-D,axis:'y'},-90,'tuck');
      add('lid-right-wing','翻盖右插翼',H+L,-D,wing,D,'lid',{x:H+L,y:-D,axis:'y'},90,'tuck');
    }
    if(type==='lidbox'){
      const clearance=BOARD_THICKNESS*3,lidH=Math.max(8,H*.55),netX=L+2*H+30;
      const lid=addTray('lid',netX,0,L+2*clearance,D+2*clearance,lidH,'base');
      lid.assembly={target:[0,0,-H-clearance],rotationX:180};lid.foldWindow=[.35,1];
    }
    if(type==='drawer-box'){
      const netX=L+2*H+30,gap=BOARD_THICKNESS*3,sd=D+2*gap,sh=H+2*gap;
      const sBottom=add('sleeve-bottom','封套底面',netX+H,H,L,sd,'base');
      sBottom.assembly={target:[0,0,gap],rotationX:0};sBottom.foldWindow=[.45,1];
      const sFront=add('sleeve-front','封套前壁',netX+H,H+sd,L,sh,'sleeve-bottom',{x:netX+H,y:H+sd,axis:'x'},90);sFront.foldWindow=[0,.45];
      const sTop=add('sleeve-top','封套顶面',netX+H,H+sd+sh,L,sd,'sleeve-front',{x:netX+H,y:H+sd+sh,axis:'x'},90);sTop.foldWindow=[0,.45];
      const sBack=add('sleeve-back','封套后壁',netX+H,H-sh,L,sh,'sleeve-bottom',{x:netX+H,y:H,axis:'x'},-90);sBack.foldWindow=[0,.45];
      const glueW=Math.min(15,H*.8);
      const sGlue=add('sleeve-glue','封套粘口',netX+H,H+2*sd+sh,L,glueW,'sleeve-top',{x:netX+H,y:H+2*sd+sh,axis:'x'},90,'glue');sGlue.foldWindow=[0,.45];
      const gc=Math.min(5,glueW*.3);sGlue.points=[[netX+H,sGlue.y],[netX+H+L,sGlue.y],[netX+H+L-gc,sGlue.y+glueW],[netX+H+gc,sGlue.y+glueW]];
    }
    if(type==='book-box'){
      const netX=L+2*H+30,gap=BOARD_THICKNESS*2,cw=L+2*gap,cd=D+2*gap,ch=H+2*gap,x=netX+H;
      const hBase=add('hardcover-base','精装底板',x,H,cw,cd,'base');
      hBase.assembly={target:[0,0,gap],rotationX:0};hBase.foldWindow=[.40,.85];
      const spine=add('spine','书脊',x,H-ch,cw,ch,'hardcover-base',{x,y:H,axis:'x'},-90,'body');spine.foldWindow=[.45,.90];
      const cover=add('cover','精装顶盖',x,H-ch-cd,cw,cd,'spine',{x,y:H-ch,axis:'x'},-90,'flap');cover.foldWindow=[.55,.95];
      const lip=add('lip','磁吸前舌',x,H-2*ch-cd,cw,ch,'cover',{x,y:H-ch-cd,axis:'x'},-90,'tuck');lip.foldWindow=[.65,1];lip.inset=0;
      const lipBevel=Math.min(6,cw*.08,ch*.25);lip.points=[[x,lip.y+ch],[x+cw,lip.y+ch],[x+cw-lipBevel,lip.y],[x+lipBevel,lip.y]];
    }
  }else if(BOX_TYPES[type].family==='container'){
    rootId='body';
    const D=L,W=Math.PI*D,topH=D,bottomH=D;
    add('body',type==='beverage-can'?'罐身标签':'瓶身标签',0,topH,W,H);
    const topLid=add('top-lid',type==='beverage-can'?'罐顶盖':'瓶盖顶标',(W-D)/2,0,D,topH,'body');
    topLid.assembly={target:[0,H/2,0],rotationX:-90};
    const botRim=add('bottom-rim',type==='beverage-can'?'罐底':'瓶底标',(W-D)/2,topH+H,D,bottomH,'body');
    botRim.assembly={target:[0,-H/2,0],rotationX:90};
    for(const p of [topLid,botRim]){
      p.shape='circle';
      p.points=Array.from({length:64},(_,i)=>{const a=i*Math.PI/32;return[p.x+p.w/2+Math.cos(a)*p.w/2,p.y+p.h/2+Math.sin(a)*p.h/2];});
    }
  }else{
    rootId='front';const tuck=Math.min(18,D*.3,H*.65),hasTucks=['carton','reverse-carton','lock-bottom'].includes(type);
    const flap=hasTucks?D:type==='shipper'?D/2:0,y=flap+(hasTucks?tuck:0);
    add('front','正面',D,y,L,H);add('left','左侧',0,y,D,H,'front',{x:D,y,axis:'y'},-90);
    add('right','右侧',D+L,y,D,H,'front',{x:D+L,y,axis:'y'},90);add('back','背面',2*D+L,y,L,H,'right',{x:2*D+L,y,axis:'y'},90);
    const glue=add('glue','侧粘口',2*D+2*L,y,Math.min(14,L*.14),H,'back',{x:2*D+2*L,y,axis:'y'},90,'glue'),corner=Math.min(6,H*.2);
    glue.points=[[glue.x,y],[glue.x+glue.w,y+corner],[glue.x+glue.w,y+H-corner],[glue.x,y+H]];
    if(hasTucks){
      const addClosure=(top,parent,x)=>{
        const id=top?'top':'bottom',edge=top?y:y+H,py=top?y-D:edge,angle=top?-90:90;
        const cover=add(id,top?'顶盖':'底盖',x,py,L,D,parent,{x,y:edge,axis:'x'},angle,'flap');cover.foldWindow=[.35,.88];
        const ty=top?py-tuck:py+D,hingeY=top?py:py+D;
        const tab=add(`${id}-tuck`,top?'上插舌':'下插舌',x,ty,L,tuck,id,{x,y:hingeY,axis:'x'},angle,'tuck'),bevel=Math.min(5,L*.12,tuck*.4);
        tab.points=top?[[x,hingeY],[x+bevel,ty],[x+L-bevel,ty],[x+L,hingeY]]:[[x,ty],[x+L,ty],[x+L-bevel,ty+tuck],[x+bevel,ty+tuck]];
      };
      addClosure(true,'front',D);
      const dust=Math.min(D*.65,L*.45);
      for(const[id,x,label]of[['left',0,'左'],['right',D+L,'右']]) {
        const p=add(`${id}-top`,`${label}上防尘翼`,x,y-dust,D,dust,id,{x,y,axis:'x'},-90,'dust'),a=Math.min(4,D*.15),b=Math.min(6,D*.2);
        p.points=[[x,y],[x+a,y-dust],[x+D-b,y-dust],[x+D,y]];
      }
      if(['carton','reverse-carton'].includes(type)){
        addClosure(false,type==='reverse-carton'?'back':'front',type==='reverse-carton'?2*D+L:D);
        for(const[id,x,label]of[['left',0,'左'],['right',D+L,'右']]) {
          const p=add(`${id}-bottom`,`${label}下防尘翼`,x,y+H,D,dust,id,{x,y:y+H,axis:'x'},90,'dust'),a=Math.min(4,D*.15),b=Math.min(6,D*.2);
          p.points=[[x,y+H],[x+D,y+H],[x+D-b,y+H+dust],[x+a,y+H+dust]];
        }
      }
      if(type==='lock-bottom'){
        const bH=Math.min(D*.75,H*.8),sH=Math.min(D*.5,L*.45);
        const pf=add('front-bottom','前主底扣',D,y+H,L,bH,'front',{x:D,y:y+H,axis:'x'},90,'flap');pf.foldWindow=[.35,.85];
        const fb=Math.min(8,L*.1,bH*.3);pf.points=[[D,y+H],[D+L,y+H],[D+L-fb,y+H+bH],[D+fb,y+H+bH]];
        const pb=add('back-bottom','后副底扣',2*D+L,y+H,L,bH,'back',{x:2*D+L,y:y+H,axis:'x'},90,'flap');pb.foldWindow=[.50,.95];
        pb.inset=-STACK_GAP;
        pb.points=[[2*D+L,y+H],[2*D+2*L,y+H],[2*D+2*L-fb,y+H+bH],[2*D+L+fb,y+H+bH]];
        const pl=add('left-bottom','左底翼',0,y+H,D,sH,'left',{x:0,y:y+H,axis:'x'},90,'dust');pl.foldWindow=[.15,.55];
        const sc=Math.min(sH,D*.3);pl.points=[[0,y+H],[D,y+H],[D-sc,y+H+sH],[sc,y+H+sH]];
        const pr=add('right-bottom','右底翼',D+L,y+H,D,sH,'right',{x:D+L,y:y+H,axis:'x'},90,'dust');pr.foldWindow=[.15,.55];
        pl.inset=pr.inset=-STACK_GAP*2;
        pr.points=[[D+L,y+H],[2*D+L,y+H],[2*D+L-sc,y+H+sH],[D+L+sc,y+H+sH]];
      }
    }
    if(type==='shipper')for(const[id,x,w,label]of[['front',D,L,'前'],['back',2*D+L,L,'后'],['left',0,D,'左'],['right',D+L,D,'右']])for(const[edge,py,hy,angle]of[['top',0,y,-90],['bottom',y+H,y+H,90]]){
      const minor=['left','right'].includes(id),length=minor?Math.min(D/2,L/2):D/2;
      const p=add(`${id}-${edge}`,`${label}${edge==='top'?'上':'下'}摇盖`,x,edge==='top'?y-length:py,w,length,id,{x,y:hy,axis:'x'},angle,minor?'dust':'flap');p.foldWindow=minor?[.18,.60]:[.40,1];
    }
  }
  const points=panels.flatMap(p=>p.points),minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxX=Math.max(...points.map(p=>p[0])),maxY=Math.max(...points.map(p=>p[1]));
  const isContainer=BOX_TYPES[type].family==='container';
  return{
    type,panels,rootId,width:maxX-minX,height:maxY-minY,minX,minY,maxX,maxY,
    rootRotationX:BOX_TYPES[type].family==='tray'?Math.PI/2:0,
    cylinder:isContainer?{diameter:L,height:H,labelHeight:H,topHeight:L,bottomHeight:L}:null,
  };
}
export function foldProgress(panel,progress){
  const window=panel.foldWindow??(panel.kind==='tuck'?[.68,1]:panel.kind==='dust'||panel.kind==='corner'?[.20,.68]:[0,.72]);
  return Math.max(0,Math.min(1,(progress-window[0])/(window[1]-window[0])));
}
export function inPolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const[xi,yi]=points[i],[xj,yj]=points[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
export function panelAt(dieline,x,y){return[...dieline.panels].reverse().find(p=>inPolygon(x,y,p.points));}
export function foldSegments(panel){if(!panel.hinge)return null;const{x,y,axis}=panel.hinge;return axis==='x'?[[panel.x,y],[panel.x+panel.w,y]]:[[x,panel.y],[x,panel.y+panel.h]];}
export function cutSegments(dieline){
  const key=(a,b)=>[a.map(v=>v.toFixed(6)).join(','),b.map(v=>v.toFixed(6)).join(',')].sort().join('|');
  const hinges=new Set(dieline.panels.map(foldSegments).filter(Boolean).map(([a,b])=>key(a,b))),result=new Map();
  for(const panel of dieline.panels)for(let i=0;i<panel.points.length;i++){const a=panel.points[i],b=panel.points[(i+1)%panel.points.length],id=key(a,b);if(!hinges.has(id))result.set(id,[a,b]);}
  return[...result.values()];
}
