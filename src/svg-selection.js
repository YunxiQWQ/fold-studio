const resources='defs,mask,clipPath,pattern,marker,symbol,filter,linearGradient,radialGradient';
const graphics=new Set('g svg path rect circle ellipse line polygon polyline text tspan textPath image use'.split(' '));

export function selectableSvgNode(node,root){
  if(!node||!root||node===root||!root.contains(node)||!graphics.has(node.localName)||node.closest(`${resources},[data-locked="true"],[data-fold-guide]`))return false;
  for(let parent=node;parent&&parent!==root;parent=parent.parentElement){
    const style=getComputedStyle(parent);
    if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;
  }
  return true;
}

const overlaps=(a,b)=>a.left<=b.right&&a.right>=b.left&&a.top<=b.bottom&&a.bottom>=b.top;
const contains=(box,p)=>p.x>=box.left&&p.x<=box.right&&p.y>=box.top&&p.y<=box.bottom;
const segment=(a,b,box)=>{
  // Clip the segment to the rectangle, including horizontal/vertical strokes.
  let low=0,high=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q]of [[-dx,a.x-box.left],[dx,box.right-a.x],[-dy,a.y-box.top],[dy,box.bottom-a.y]]){
    if(Math.abs(p)<1e-12){if(q<0)return false;continue;}
    const t=q/p;if(p<0)low=Math.max(low,t);else high=Math.min(high,t);if(low>high)return false;
  }
  return true;
};

// Test visible descendants, not the large empty viewport of an imported SVG
// or the blank area between members of a group. No source geometry is changed.
export function svgArtworkIntersects(node,box,root){
  if(!selectableSvgNode(node,root))return false;
  if(['g','svg'].includes(node.localName))return [...node.children].some(child=>svgArtworkIntersects(child,box,root));
  const matrix=node.getScreenCTM?.();if(!matrix||Math.abs(matrix.a*matrix.d-matrix.b*matrix.c)<1e-12)return false;
  const style=getComputedStyle(node),fill=style.fill!=='none'&&Number(style.fillOpacity)>0,stroke=style.stroke!=='none'&&Number(style.strokeOpacity)>0&&parseFloat(style.strokeWidth)>0;
  const picture=['image','use'].includes(node.localName);if(!picture&&!fill&&!stroke)return false;
  const scale=Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d)),pad=stroke?parseFloat(style.strokeWidth)*(style.vectorEffect==='non-scaling-stroke'?1:scale)/2:0;
  let bounds;try{bounds=node.getBBox();}catch{return false;}
  const points=[[bounds.x,bounds.y],[bounds.x+bounds.width,bounds.y],[bounds.x+bounds.width,bounds.y+bounds.height],[bounds.x,bounds.y+bounds.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
  const extent={left:Math.min(...points.map(p=>p.x))-pad,right:Math.max(...points.map(p=>p.x))+pad,top:Math.min(...points.map(p=>p.y))-pad,bottom:Math.max(...points.map(p=>p.y))+pad};
  if(!overlaps(extent,box))return false;
  if(box.left<=extent.left&&box.right>=extent.right&&box.top<=extent.top&&box.bottom>=extent.bottom)return true;
  const corners=[[box.left,box.top],[box.right,box.top],[box.right,box.bottom],[box.left,box.bottom]].map(([x,y])=>new DOMPoint(x,y));
  if(typeof node.isPointInFill==='function'){
    const inverse=matrix.inverse();
    for(const corner of corners){const p=corner.matrixTransform(inverse);if(fill&&node.isPointInFill(p)||stroke&&node.isPointInStroke(p))return true;}
    const length=node.getTotalLength();if(!Number.isFinite(length)||length<=0)return false;
    const count=Math.max(8,Math.min(2048,Math.ceil(length*scale/3))),step=length/count;
    const expanded={left:box.left-pad,right:box.right+pad,top:box.top-pad,bottom:box.bottom+pad};
    let previous=node.getPointAtLength(0),previousScreen=previous.matrixTransform(matrix),firstScreen=previousScreen;
    if(contains(expanded,previousScreen))return true;
    for(let index=1;index<=count;index++){
      const point=node.getPointAtLength(index*step),screen=point.matrixTransform(matrix);
      // getPointAtLength jumps between subpaths without adding their gap to
      // path length. Never treat that invisible jump as a drawn line.
      const jump=Math.hypot(point.x-previous.x,point.y-previous.y)>step*1.01+.001;
      if(contains(expanded,screen)||!jump&&segment(previousScreen,screen,expanded))return true;
      if(jump){if(fill&&segment(previousScreen,firstScreen,box))return true;firstScreen=screen;}
      previous=point;previousScreen=screen;
    }
    return fill&&segment(previousScreen,firstScreen,box);
  }
  // Images, text and references use their transformed geometric frame.
  if(points.some(p=>contains(box,p)))return true;
  for(let i=0;i<4;i++)if(segment(points[i],points[(i+1)%4],box))return true;
  const inverse=matrix.inverse();return corners.some(p=>{const q=p.matrixTransform(inverse);return q.x>=bounds.x&&q.x<=bounds.x+bounds.width&&q.y>=bounds.y&&q.y<=bounds.y+bounds.height;});
}

export function svgMarqueeNodes(root,scope,box){
  const nodes=[];let branch=null;
  // Include siblings outside the last edited parent without selecting that
  // parent again or flattening real groups/imported SVGs.
  for(let parent=scope&&root.contains(scope)?scope:root;parent;branch=parent,parent=parent.parentElement){
    for(const child of parent.children)if(child!==branch&&svgArtworkIntersects(child,box,root))nodes.push(child);
    if(parent===root)break;
  }
  return nodes;
}
