import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSvgAsset,svgAssetMarkup} from '../src/svg-asset.js';
import {newProject,validateProject} from '../src/project.js';
import {encodeLayers,decodeLayers,layersForPaste} from '../src/clipboard.js';
import {makeDieline} from '../src/geometry.js';

const asset=()=>({viewBox:[0,0,20,10],nodes:[{tag:'defs',attrs:{},children:[{tag:'linearGradient',attrs:{id:'g'},children:[{tag:'stop',attrs:{offset:'0','stop-color':'#123456'},children:[]}]}]},{tag:'path',attrs:{d:'M 0 0 L 20 10',fill:'url(#g)',stroke:'none'},children:[]}]});
test('vector assets preserve native paths, isolate definition IDs and recolor visible paint without changing clip/definition content',()=>{
  const a=validateSvgAsset(asset()),markup=svgAssetMarkup(a,{prefix:'copy-',color:'#abcdef'});
  assert.match(markup,/<path/);assert.match(markup,/id="copy-g"/);assert.match(markup,/fill="#abcdef"/);assert.match(markup,/stop-color="#123456"/);assert.match(markup,/stroke="none"/);
  assert.match(svgAssetMarkup(a,{prefix:'other-'}),/fill="url\(#other-g\)"/);
});
test('untrusted project SVG data rejects scripts, events, styles, remote references and malformed trees',()=>{
  const invalid=[{tag:'script',attrs:{},children:[]},{tag:'path',attrs:{onload:'alert(1)'},children:[]},{tag:'path',attrs:{style:'fill:red'},children:[]},{tag:'path',attrs:{fill:'url(https://example.org/a)'},children:[]},{tag:'image',attrs:{href:'data:image/svg+xml;base64,PHN2Zz4='},children:[]},{tag:'path',attrs:{fill:'url(#missing)'},children:[]}];
  for(const node of invalid)assert.throws(()=>validateSvgAsset({viewBox:[0,0,10,10],nodes:[node]}));
  const a=asset();a.nodes[1].children.push(a.nodes[1]);assert.throws(()=>validateSvgAsset(a));
  assert.throws(()=>validateSvgAsset({...asset(),viewBox:[0,0,0,10]}));
});
test('editable vectors survive project and clipboard round trips with independent IDs and colors',()=>{
  const p=newProject(),panel=makeDieline(p.type,p.dimensions).panels.find(p=>p.id==='front'),layer={...p.layers[0],id:'vector',type:'svg',svg:asset(),svgOriginal:true};p.layers=[layer];
  assert.deepEqual(validateProject(p).layers,p.layers);
  const copied=layersForPaste(p,decodeLayers(encodeLayers(p.layers,panel)),panel,'inside')[0];
  assert.deepEqual(copied.svg,layer.svg);assert.notEqual(copied.id,layer.id);assert.equal(copied.side,'inside');
});
