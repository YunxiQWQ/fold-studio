// Parametric constructions implemented from the inspected flat structures.
// No third-party JSX/JSXBIN or exported artwork is included here.
export const RETAIL_STYLES={straight:'直线盒 · 反向插盖',same:'同向盖盒 · 带锁肩',upper:'上盖盒 · 圆舌',airplane:'飞机式插扣盒',lock:'四片插扣底／自锁底盒',glue:'平粘底盒',hanging:'挂耳粘底盒', 'hanging-lock':'吊挂扣底盒'};
export const RETAIL_CARTONS={
  'retail-carton':{name:'常用彩盒刀版（8 款）',english:'RETAIL CARTON DIELINES',family:'carton',category:'carton',printPanel:'front',description:'直线／同向／上盖／插扣／粘底／吊挂 · 圆舌与锁肩可调',aliases:[...Object.values(RETAIL_STYLES),'锁底盒','包装盒型'],defaults:{length:60,depth:50,height:80,retailStyle:'straight',tuckLength:12,glueWidth:11,hangHeight:50,hangHoleWidth:28,hangHoleHeight:8}},
};
const bound=(dims,key,fallback,min,max)=>{const n=dims[key]??fallback;if(!Number.isFinite(n))throw Error('彩盒结构参数需为有效数值');return Math.max(min,Math.min(max,n));};
export function retailSettings(dims){
  const {length:L,depth:D,height:H}=dims,style=dims.retailStyle??'straight';if(!Object.hasOwn(RETAIL_STYLES,style))throw Error('不支持的彩盒刀版');
  const T=bound(dims,'tuckLength',12,2,Math.max(2,Math.min(D*.7,H*.6,40))),G=bound(dims,'glueWidth',11,2,Math.max(2,Math.min(45,L*.35,D*.6)));
  const HH=bound(dims,'hangHeight',D,Math.min(8,H*.4),Math.max(8,Math.min(150,H*.8))),HW=bound(dims,'hangHoleWidth',L*.46,Math.min(6,L*.3),L*.72),holeH=bound(dims,'hangHoleHeight',8,Math.min(2,HH*.15),HH*.35);
  const hanging=style.startsWith('hanging'),Y=Math.max(D+T,hanging?HH:0);
  return {L,D,H,T,G,HH,HW,holeH,Y,style,hanging,totalHeight:H+(hanging?HH:0)};
}
function cleanPoints(points){return points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>1e-8).filter((p,i,a)=>!i||i<a.length-1||Math.hypot(p[0]-a[0][0],p[1]-a[0][1])>1e-8);}
function roundedRect(x,y,w,h,r){
  const out=[];for(const [cx,cy,start]of [[x+r,y+r,Math.PI],[x+w-r,y+r,1.5*Math.PI],[x+w-r,y+h-r,0],[x+r,y+h-r,Math.PI/2]])for(let i=0;i<=8;i++){const a=start+i*Math.PI/16;out.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}return cleanPoints(out);
}
function tonguePoints(x,base,w,h,up){
  const r=Math.min(w*.18,h*.8),tip=base+(up?-h:h),sign=up?-1:1,points=[[x,base],[x,tip-sign*r]];
  for(let i=0;i<=8;i++){const a=Math.PI-i*Math.PI/16;points.push([x+r+r*Math.cos(a),tip-sign*r+sign*r*Math.sin(a)]);}
  points.push([x+w-r,tip]);
  for(let i=0;i<=8;i++){const a=Math.PI/2-i*Math.PI/16;points.push([x+w-r+r*Math.cos(a),tip-sign*r+sign*r*Math.sin(a)]);}
  points.push([x+w,base]);return cleanPoints(points);
}
export function makeRetailCarton(dims,add){
  const b=retailSettings(dims),{L,D,H,T,G,Y,style}=b;
  const positions={front:G,right:G+L,back:G+L+D,left:G+2*L+D};
  for(const [id,label,w,parent]of [['front','正面',L,null],['right','右侧',D,'front'],['back','背面',L,'right'],['left','左侧',D,'back']]){
    const p=add(id,label,positions[id],Y,w,H,parent,parent?{x:positions[id],y:Y,axis:'y'}:null,parent?90:0);p.foldWindow=[0,.32];
  }
  const glue=add('glue','侧粘口',0,Y,G,H,'front',{x:G,y:Y,axis:'y'},-90,'glue'),c=Math.min(4,G*.3,H*.1);
  glue.points=[[G,Y],[G,Y+H],[0,Y+H-c],[0,Y+c]];
  const shoulder=style==='upper'?0:Math.min(3,L*.08);
  const closure=(id,parent,up)=>{
    const x=positions[parent],edge=up?Y:Y+H,outer=up?edge-D:edge+D,angle=up?-90:90;
    const cover=add(id,up?'上盖':'底盖',x,up?outer:edge,L,D,parent,{x,y:edge,axis:'x'},angle,'flap');cover.foldWindow=[.48,.84];
    if(shoulder){cover.points=up?[[x,edge],[x,outer],[x+shoulder,outer],[x+L-shoulder,outer],[x+L,outer],[x+L,edge]]:[[x,edge],[x+L,edge],[x+L,outer],[x+L-shoulder,outer],[x+shoulder,outer],[x,outer]];}
    const tab=add(id+'-tuck',up?'上圆插舌':'下圆插舌',x+shoulder,up?outer-T:outer,L-2*shoulder,T,id,{segment:[[x+shoulder,outer],[x+L-shoulder,outer]]},angle,'tuck');tab.points=tonguePoints(tab.x,outer,tab.w,T,up);tab.foldWindow=[.82,1];
  };
  const dust=(id,parent,up,height=Math.min(D*.7,L*.45))=>{
    const x=positions[parent],edge=up?Y:Y+H,y=up?edge-height:edge,p=add(id,up?'上防尘翼':'下防尘翼',x,y,D,height,parent,{x,y:edge,axis:'x'},up?-90:90,'dust'),a=Math.min(3,D*.12,height*.2);
    p.points=up?[[x,edge],[x+a,y],[x+D-a,y],[x+D,edge]]:[[x,edge],[x+D,edge],[x+D-a,y+height],[x+a,y+height]];p.foldWindow=[.30,.62];
  };
  const top=['straight','airplane','lock','hanging-lock'].includes(style)?'front':'back';closure('top',top,true);
  for(const parent of ['left','right'])dust(parent+'-top',parent,true);
  if(['straight','same','upper','airplane'].includes(style)){
    closure('bottom',style==='straight'?'back':style==='airplane'?'front':'back',false);
    for(const parent of ['left','right'])dust(parent+'-bottom',parent,false);
  }else{
    const lock=style==='lock'||style==='hanging-lock',B=lock?Math.min(D*.75,H*.8):D;
    for(const parent of ['front','right','back','left']){
      const x=positions[parent],w=parent==='front'||parent==='back'?L:D,h=parent==='front'||parent==='back'?B:Math.min(B,L*.45),edge=Y+H;
      const p=add(parent+'-bottom',lock?'插扣底片':'胶合底片',x,edge,w,h,parent,{x,y:edge,axis:'x'},90,lock?'flap':parent==='front'||parent==='back'?'flap':'dust');p.foldWindow=parent==='front'?[.65,1]:parent==='back'?[.40,.78]:[.15,.48];p.inset=parent==='front'?0:parent==='back'?-.6:-1.2;
      if(lock&&parent==='front'){
        const n=Math.min(12,L*.18),q=h*.32;p.points=[[x,edge],[x+w,edge],[x+w,edge+h],[x+(w+n)/2,edge+h],[x+(w+n)/2,edge+h-q],[x+(w-n)/2,edge+h-q],[x+(w-n)/2,edge+h],[x,edge+h]];
      }else if(lock&&parent==='back')p.points=[[x,edge],[x+w,edge],[x+w*.6,edge+h*.6],[x+w*.6,edge+h],[x+w*.4,edge+h],[x+w*.4,edge+h*.6]];
      else if(lock&&parent==='right')p.points=[[x,edge],[x+w,edge],[x+w,edge+h],[x+w*.5,edge+h],[x+w*.5,edge+h*.6]];
      else if(lock)p.points=[[x,edge],[x+w,edge],[x+w*.5,edge+h*.6],[x+w*.5,edge+h],[x,edge+h]];
      else if(parent==='front'||parent==='right'||parent==='left'){const bevel=Math.min(5,w*.1,h*.2);p.points=[[x,edge],[x+w,edge],[x+w-bevel,edge+h],[x+bevel,edge+h]];}
    }
  }
  if(b.hanging){
    const parent=style==='hanging-lock'?'back':'front',x=positions[parent],y=Y-b.HH,p=add('hang-tab','吊挂片',x,y,L,b.HH,parent,{x,y:Y,axis:'x'},0,'flap'),r=Math.min(6,b.HH*.15,L*.1);
    p.points=[[x,Y],[x,y+r],[x+r,y],[x+L-r,y],[x+L,y+r],[x+L,Y]];p.inset=0;
    const holeX=x+(L-b.HW)/2,holeY=y+b.HH*.43-b.holeH/2;p.holes=[roundedRect(holeX,holeY,b.HW,b.holeH,Math.min(b.holeH/2,b.HW/2))];
  }
  return {rootId:'front',retail:b};
}
