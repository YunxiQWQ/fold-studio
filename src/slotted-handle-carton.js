// Independently parameterised from the user's flat-top handle carton reference.
export const SLOTTED_HANDLE_CARTONS={
  'slotted-handle-carton':{name:'插锁提手盒',english:'SLOTTED HANDLE CARTON',family:'carton',category:'gift',printPanel:'front',description:'平顶对合 · 双片镂空提手 · 穿槽侧翼 · 异形扣底',aliases:['手提盒'],defaults:{length:250,depth:200,height:120,handleHeight:60,handleWidth:112,handleHoleHeight:25,sideFlapHeight:90,sideFlapAngle:38,bottomFlap:158,glueWidth:18}},
};
const bounded=(dims,key,fallback,min,max)=>{
  const value=dims[key]??fallback;if(!Number.isFinite(value))throw Error('手提盒参数需为有效数值');return Math.max(min,Math.min(max,value));
};
export function slottedHandleSettings(dims){
  const {length:L,depth:D,height:H}=dims,R=D/2;
  const T=bounded(dims,'handleHeight',Math.min(60,D*.5,L*.3),Math.min(8,D*.2),Math.max(8,Math.min(150,L*.45,D*.9)));
  const handleWidth=bounded(dims,'handleWidth',L*.45,Math.min(8,L*.3),L*.72),holeHeight=bounded(dims,'handleHoleHeight',T*.4,Math.min(3,T*.2),T*.54);
  const wing=bounded(dims,'sideFlapHeight',D*.75,Math.min(10,D*.3),Math.min(200,D*.95)),angle=bounded(dims,'sideFlapAngle',38,15,65);
  const B=bounded(dims,'bottomFlap',D*.79,D*.52,D*.98),G=bounded(dims,'glueWidth',18,Math.min(3,L*.1),Math.min(45,L*.2,D*.4));
  return {L,D,H,R,T,handleWidth,holeHeight,wing,angle,B,G,Y:R+T,totalHeight:H+Math.max(T,wing*Math.cos(angle*Math.PI/180))};
}
function roundedHole(cx,cy,w,h){
  const r=Math.min(h*.28,w*.1),points=[];
  for(const [x,y,a]of [[cx-w/2+r,cy-h/2+r,Math.PI],[cx+w/2-r,cy-h/2+r,1.5*Math.PI],[cx+w/2-r,cy+h/2-r,0],[cx-w/2+r,cy+h/2-r,Math.PI/2]])for(let i=0;i<=6;i++){const theta=a+i*Math.PI/12;points.push([x+r*Math.cos(theta),y+r*Math.sin(theta)]);}
  return points;
}
export function makeSlottedHandleCarton(dims,add){
  const b=slottedHandleSettings(dims),{L,D,H,R,T,Y,B,G,wing,angle}=b;
  const parts=[['front','正面',G,L,null],['right','右侧',G+L,D,'front'],['back','背面',G+L+D,L,'right'],['left','左侧',G+2*L+D,D,'back']];
  for(const [id,label,x,w,parent]of parts){
    const wall=add(id,label,x,Y,w,H,parent,parent?{x,y:Y,axis:'y'}:null,parent?90:0);wall.inset=0;wall.foldWindow=[0,.34];
    if(id==='front'||id==='back'){
      const roof=add(id+'-roof',label+'半幅顶盖',x,T,L,R,id,{x,y:Y,axis:'x'},-90,'flap');roof.inset=0;roof.foldWindow=[.38,.78];
      const handle=add(id+'-handle',label+'镂空提手',x,0,L,T,roof.id,{x,y:T,axis:'x'},90,'flap');handle.foldWindow=[.38,.78];handle.inset=.28;
      const c=Math.min(T*.18,L*.045),notch=Math.min(T*.28,L*.07),step=Math.min(T*.26,L*.05);
      handle.points=[[x,T],[x+c,T-c],[x+c,step],[x,step],[x,0],[x+notch,0],[x+notch,step*.65],[x+notch+step*.65,0],[x+L-notch-step*.65,0],[x+L-notch,step*.65],[x+L-notch,0],[x+L,0],[x+L,step],[x+L-c,step],[x+L-c,T-c],[x+L,T]];
      handle.holes=[roundedHole(x+L/2,T*.59,b.handleWidth,b.holeHeight)];
    }else{
      const flap=add(id+'-lock-wing',label+'穿槽侧翼',x,Y-wing,D,wing,id,{x,y:Y,axis:'x'},-angle,'flap'),bevel=Math.min(D*.16,wing*.2);
      flap.points=[[x,Y],[x+D,Y],[x+D-bevel,Y-wing],[x+bevel,Y-wing]];flap.foldWindow=[.48,.90];flap.inset=0;
      const low=Math.min(wing*.12,4),high=Math.min(wing*.88,T/Math.cos(angle*Math.PI/180)+3),slotWidth=Math.max(.5,Math.min(1.4,D*.012));
      flap.holes=[roundedHole(x+D/2,Y-(low+high)/2,slotWidth,high-low)];
    }
    const ey=Y+H,bottom=add(id+'-bottom',label+'扣底',x,ey,w,B,id,{x,y:ey,axis:'x'},90,'flap');
    if(id==='front'){
      const inset=L*.25,step=Math.min(B*.24,D*.19);bottom.points=[[x,ey],[x+L,ey],[x+L,ey+B],[x+L-inset,ey+B],[x+L-inset,ey+B-step],[x+inset,ey+B-step],[x+inset,ey+B],[x,ey+B]];bottom.foldWindow=[.54,.88];bottom.inset=0;
    }else if(id==='back'){
      const bevel=Math.min(L*.24,D*.46),toe=Math.min(B*.23,D*.16);bottom.points=[[x,ey],[x+L,ey],[x+L-bevel,ey+B-toe],[x+L-bevel,ey+B],[x+bevel,ey+B],[x+bevel,ey+B-toe]];bottom.foldWindow=[.36,.66];bottom.inset=-.65;
    }else{
      const bevel=Math.min(w*.5,B*.55);bottom.points=id==='right'?[[x,ey],[x+w,ey],[x+w,ey+B],[x+w*.5,ey+B],[x+w*.5,ey+B*.65]]:[[x,ey],[x+w,ey],[x+w-bevel,ey+B*.65],[x+w-bevel,ey+B],[x,ey+B]];bottom.foldWindow=[.14,.42];bottom.inset=-1.3;
    }
  }
  const glue=add('glue','侧粘口',0,Y,G,H,'front',{x:G,y:Y,axis:'y'},-90,'glue'),bevel=Math.min(5,H*.05,G*.3);glue.points=[[G,Y],[0,Y+bevel],[0,Y+H-bevel],[G,Y+H]];glue.foldWindow=[0,.34];glue.inset=-.65;
  return {rootId:'front',slottedHandle:b};
}
