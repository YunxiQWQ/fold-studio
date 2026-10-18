import{test}from'node:test';import assert from'node:assert/strict';
import{newProject,validateProject}from'../src/project.js';import{makeDieline}from'../src/geometry.js';import{hitLayer,layerBounds}from'../src/artwork.js';import{printRegions,inPrintRegions,regionPath}from'../src/artwork-space.js';import{editLayers,expandGroups}from'../src/editor-commands.js';import{layersForPaste,encodeLayers,decodeLayers}from'../src/clipboard.js';
test('existing layers span neighboring panels by default on both print sides',()=>{
  for(const side of ['outside','inside']){const p=newProject(),d=makeDieline(p.type,p.dimensions),a=d.panels.find(p=>p.id==='front'),l={...p.layers[0],id:'seam',side,x:.98,y:.5,w:.5,h:.1};p.layers=[l];const b=layerBounds(l,a),x=side==='inside'?a.x-5:a.x+a.w+5,target=side==='inside'?'left':'right';assert.equal(hitLayer(p,d,x,b.y,side,target)?.id,l.id);assert.equal(printRegions(d,l,side).length,d.panels.length);assert.equal(inPrintRegions(printRegions(d,l,side),x,b.y),true);l.clipToPanel=true;assert.equal(hitLayer(p,d,x,b.y,side,target),null);assert.equal(printRegions(d,l,side).length,1);}
});
test('a fully moved layer remains selectable on a different face without rewriting its anchor',()=>{
  const p=newProject(),d=makeDieline(p.type,p.dimensions),a=d.panels.find(p=>p.id==='front'),l={...p.layers[0],id:'moved',x:1.3,y:.5,w:.2,h:.1};p.layers=[l];const b=layerBounds(l,a);assert.equal(hitLayer(p,d,b.x,b.y,'outside','right')?.id,l.id);assert.equal(l.panel,'front');const copy=editLayers(p,d,[l.id],'duplicate');assert.ok(p.layers.find(l=>l.id===copy[0]).x>1.3);const pasted=layersForPaste(p,decodeLayers(encodeLayers([l],a)),a,'outside',0);assert.equal(pasted[0].x,1.3);validateProject({...p,layers:pasted});
});
test('cross-face groups retain all members and clipping preference survives validation',()=>{
  const p=newProject(),d=makeDieline(p.type,p.dimensions);p.layers=p.layers.slice(0,2).map((l,i)=>({...l,panel:i?'right':'front'}));const ids=p.layers.map(l=>l.id);editLayers(p,d,ids,'group');assert.deepEqual(expandGroups(p,[ids[0]]),ids);p.layers[0].clipToPanel=true;assert.equal(validateProject(p).layers[0].clipToPanel,true);p.layers[0].clipToPanel='yes';assert.throws(()=>validateProject(p));
});
test('sheet clipping uses all physical contours with consistent winding on the mirrored inside',()=>{
  const p=newProject(),d=makeDieline(p.type,p.dimensions),regions=printRegions(d,{},'inside',true),path=regionPath(regions);assert.equal(path.filter(c=>c[0]==='M').length,d.panels.length);assert.equal(path.filter(c=>c[0]==='Z').length,d.panels.length);const a=d.panels[0];assert.equal(inPrintRegions(regions,d.minX+d.maxX-a.x-a.w/2,a.y+a.h/2),true);assert.equal(inPrintRegions(regions,d.minX-50,d.minY-50),false);
});
