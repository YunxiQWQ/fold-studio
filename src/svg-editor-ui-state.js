// Availability is shared by menus and the multi-selection inspector. It never
// changes the document or adds a second selection model.
export function svgCommandState(canvas, active, root) {
  const nodes=canvas?.getSelectedElements().filter(Boolean)??[];
  const resource='defs,mask,clipPath,pattern,marker,symbol,filter,linearGradient,radialGradient';
  const editable=nodes.length>0&&nodes.every(node=>!node.closest(`[data-locked="true"],${resource}`));
  return {nodes,can(command){
    if(command==='new-layer'||command==='source')return true;
    if(command==='up-context')return !!root&&canvas.getCurrentGroup()!==root&&root.contains(canvas.getCurrentGroup());
    if(command==='lock')return !!active&&!active.closest(resource);
    if(command==='copy')return nodes.length>0;
    if(command==='group')return editable&&nodes.length>1;
    if(command==='ungroup')return editable&&nodes.some(node=>['g','svg'].includes(node.localName)||node.hasAttribute('data-fold-group'));
    if(command==='nodes')return editable&&nodes.length===1&&nodes[0].localName==='path';
    if(command==='convert')return editable&&nodes.length===1&&['rect','circle','ellipse','line','polyline','polygon','path'].includes(nodes[0].localName);
    if(command.startsWith('align-'))return editable&&nodes.length>=(['align-dh','align-dv'].includes(command)?3:2);
    return editable;
  }};
}
