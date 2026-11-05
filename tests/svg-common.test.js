import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSvgAsset,svgAssetMarkup} from '../src/svg-asset.js';
import {normalizeSvgValue} from '../src/svg-format.js';
import {newProject,validateProject} from '../src/project.js';
import {encodeLayers,decodeLayers,layersForPaste} from '../src/clipboard.js';
import {makeDieline} from '../src/geometry.js';

const node=(tag,attrs={},children=[])=>({tag,attrs,children});
const artwork=()=>({viewBox:[0,0,200,100],nodes:[
  node('defs',{},[
    node('mask',{id:'蒙版'},[node('rect',{width:'200',height:'100',fill:'#ffffff'})]),
    node('linearGradient',{id:'gradient'},[node('stop',{offset:'0','stop-color':'#225533'})]),
    node('symbol',{id:'icon',viewBox:'0 0 10 10'},[node('rect',{width:'10',height:'10',fill:'url(#gradient)'})]),
  ]),
  {...node('g',{mask:'url(#蒙版)'},[node('use',{href:'#icon',width:'50',height:'50'})]),css:{'mix-blend-mode':'multiply'}},
]});

test('advanced SVG references survive project/clipboard and definitions remain unchanged when recoloring',()=>{
  const asset=validateSvgAsset(artwork()),svg=svgAssetMarkup(asset,{prefix:'layer-1-',color:'#ee4455'});
  assert.match(svg,/id="layer-1-蒙版"/);assert.match(svg,/mask="url\(#layer-1-蒙版\)"/);
  assert.match(svg,/href="#layer-1-icon"/);assert.match(svg,/fill="#ffffff"/);
  assert.match(svg,/stop-color="#225533"/);assert.match(svg,/style="mix-blend-mode:multiply"/);
  const project=newProject(),panel=makeDieline(project.type,project.dimensions).panels.find(p=>p.id==='front');
  project.layers=[{...project.layers[0],type:'svg',svgOriginal:true,svg:asset}];
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))).layers,project.layers);
  const copies=layersForPaste(project,decodeLayers(encodeLayers(project.layers,panel)),panel,'inside');
  assert.deepEqual(copies[0].svg,asset);assert.equal(copies[0].side,'inside');
});

test('untrusted SVG project definitions reject reference cycles, external resources and executable CSS',()=>{
  const loop={viewBox:[0,0,10,10],nodes:[node('g',{id:'loop'},[node('use',{href:'#loop'})])]};
  assert.throws(()=>validateSvgAsset(loop),/循环/);
  const bad=[
    node('use',{href:'https://example.org/asset.svg#icon'}),
    node('image',{href:'data:image/svg+xml;base64,PHN2Zz4='}),
    {...node('rect'),css:{'mix-blend-mode':'multiply; background:url(https://example.org/a)'}},
    {...node('rect'),css:{'background-image':'url(https://example.org/a)'}},
    node('rect',{mask:'url(#missing)'}),
  ];
  for(const child of bad)assert.throws(()=>validateSvgAsset({viewBox:[0,0,10,10],nodes:[child]}));
  assert.equal(normalizeSvgValue('rect','fill','url(\'#画纸\') #123456'),'url(#画纸) #123456');
  assert.equal(normalizeSvgValue('g','filter','blur(2px) drop-shadow(2px 3px 4px rgba(0,0,0,.4))'),'blur(2px) drop-shadow(2px 3px 4px rgba(0,0,0,.4))');
  assert.equal(normalizeSvgValue('g','filter','blur(2px) url(https://example.org/filter)'),null);
});
