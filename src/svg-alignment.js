import {editableSvgSelection,svgSelectionBounds,transformSvgNode} from './svg-design-tools.js';

export const ALIGNMENTS=[['l','左对齐'],['c','水平居中'],['r','右对齐'],['t','上对齐'],['m','垂直居中'],['b','下对齐'],['dh','水平分布'],['dv','垂直分布']];
export function alignmentOptions(editor){return editor.alignment??={target:'auto',distribution:'centers',gap:''};}
export function canAlign(count,command,options={}){
  const target=options.target==='auto'||!options.target?(count===1?'panel':'selection'):options.target;
  if(['dh','dv'].includes(command))return target!=='key'&&count>=(options.distribution==='gaps'&&String(options.gap??'').trim()!==''?2:3);
  return count>=(['selection','key'].includes(target)?2:1);
}
export function alignSvgSelection(editor,command){
  if(!ALIGNMENTS.some(([id])=>id===command))throw Error('不支持的对齐操作');
  editor.up();const nodes=editableSvgSelection(editor),options=alignmentOptions(editor),active=editor.api.selected;
  if(!canAlign(nodes.length,command,options))throw Error(['dh','dv'].includes(command)?'自动分布需至少三个对象；指定间距可排列两个对象':'请选择两个对象，或改为对齐当前面板／整张刀版');
  const target=options.target==='auto'?(nodes.length===1?'panel':'selection'):options.target;
  const boxes=new Map(nodes.map(node=>[node,svgSelectionBounds(editor,[node])])),panel=editor.dieline.panels.find(p=>p.id===editor.panelId);
  let key=nodes.includes(editor.api.selected)?editor.api.selected:nodes.at(-1),reference;
  if(target==='panel'){
    if(!panel)throw Error('请先选择包装面板');
    reference={x:editor.side==='inside'?editor.dieline.minX+editor.dieline.maxX-panel.x-panel.w:panel.x,y:panel.y,width:panel.w,height:panel.h};
  }else if(target==='sheet')reference={x:editor.dieline.minX,y:editor.dieline.minY,width:editor.dieline.width,height:editor.dieline.height};
  else if(target==='key')reference=boxes.get(key);
  else if(target==='selection')reference=svgSelectionBounds(editor,nodes);
  else throw Error('不支持的对齐参照');
  const moves=new Map(),horizontal=['l','c','r','dh'].includes(command),axis=horizontal?'x':'y',size=horizontal?'width':'height';
  if(['dh','dv'].includes(command)){
    const ordered=[...nodes].sort((a,b)=>{const x=boxes.get(a),y=boxes.get(b);return (options.distribution==='gaps'?x[axis]-y[axis]:x[axis]+x[size]/2-y[axis]-y[size]/2);});
    if(options.distribution==='gaps'){
      const specified=String(options.gap??'').trim()!=='',gap=specified?Number(options.gap):(reference[size]-nodes.reduce((s,n)=>s+boxes.get(n)[size],0))/(nodes.length-1);
      if(!Number.isFinite(gap)||specified&&(gap<0||gap>1000))throw Error('指定间距须为 0–1000 mm');
      let position=reference[axis];for(const node of ordered){const b=boxes.get(node);moves.set(node,position-b[axis]);position+=b[size]+gap;}
    }else{
      const first=boxes.get(ordered[0]),last=boxes.get(ordered.at(-1)),start=target==='selection'?first[axis]+first[size]/2:reference[axis]+first[size]/2,end=target==='selection'?last[axis]+last[size]/2:reference[axis]+reference[size]-last[size]/2;
      ordered.forEach((node,i)=>{const b=boxes.get(node);moves.set(node,start+(end-start)*i/(nodes.length-1)-b[axis]-b[size]/2);});
    }
  }else{
    const fraction=['c','m'].includes(command)?.5:['r','b'].includes(command)?1:0;
    for(const node of nodes){if(target==='key'&&node===key)continue;const b=boxes.get(node);moves.set(node,reference[axis]+reference[size]*fraction-b[axis]-b[size]*fraction);}
  }
  const sheet=editor.api.wrapper.getScreenCTM(),matrix=new DOMMatrix([sheet.a,sheet.b,sheet.c,sheet.d,sheet.e,sheet.f]);
  return editor.api.transaction('对齐与分布',batch=>{
    for(const [node,distance]of moves){if(Math.abs(distance)<1e-9)continue;const old=transformSvgNode(node,matrix,new DOMMatrix().translate(horizontal?distance:0,horizontal?0:distance));batch.addSubCommand(new editor.api.canvas.history.ChangeElementCommand(node,old));}
    return {selection:nodes,active};
  });
}
