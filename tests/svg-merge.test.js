import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactSvgLayers,mergeSvgRun} from '../src/svg-merge.js';
import {newProject,validateProject} from '../src/project.js';
import {makeDieline} from '../src/geometry.js';
import {svgAssetMarkup} from '../src/svg-asset.js';
import {proofColor} from '../src/color.js';
const p=newProject(),line=makeDieline(p.type,p.dimensions);
const vector=(id,props={})=>({...p.layers[0],id,type:'svg',svgOriginal:true,svg:{viewBox:[0,0,10,10],nodes:[{tag:'g',attrs:{},children:[{tag:'g',attrs:{transform:'matrix(1 0 0 1 0 0)'},children:[{tag:'rect',attrs:{x:'0',y:'0',width:'10',height:'10',fill:'#145936'},children:[]}]}]}]},...props});
test('SVG compaction merges real layers, keeps independent text and never crosses an unselected or different-side layer',()=>{
  const text={...p.layers[1],id:'text'},layers=[vector('a'),vector('b'),text,vector('c'),vector('d')];
  const compact=compactSvgLayers(layers,line);assert.equal(compact.length,3);assert.equal(compact[1],text);assert.ok(!compact[0].group);validateProject({...p,layers:compact});
  assert.equal(compactSvgLayers(layers,line,['a','c','d']).length,4);
  assert.equal(compactSvgLayers([vector('a'),vector('b',{side:'inside'})],line).length,2);
  assert.equal(compactSvgLayers([vector('a'),vector('b',{locked:true})],line).length,2);
});
test('SVG merging preserves alpha, recolor, flips and optional panel clipping while removing empty wrappers',()=>{
  const a=vector('a',{rotation:30,flipX:true,opacity:.5,svgOriginal:false,color:'#ff5522',clipToPanel:true}),b=vector('b',{panel:'right',x:.2,flipY:true});
  const merged=mergeSvgRun([a,b],line);validateProject({...p,layers:[merged]});const svg=svgAssetMarkup(merged.svg);
  assert.match(svg,/opacity="0.5"/);assert.match(svg,/fill="#ff5522"/);assert.match(svg,/<clipPath/);assert.equal((svg.match(/<rect/g)??[]).length,2);assert.equal((svg.match(/<g>/g)??[]).length,0);
  assert.ok(merged.w>0&&merged.h>0);assert.equal(merged.opacity,1);assert.ok(!merged.clipToPanel);
  assert.ok(svgAssetMarkup(merged.svg,{colorMode:'cmyk'}).includes(proofColor('#ff5522','cmyk')));
});
test('invalid SVG merge input leaves source layers untouched',()=>{
  const a=vector('a'),b=vector('b',{locked:true}),before=structuredClone([a,b]);assert.throws(()=>mergeSvgRun([a,b],line));assert.deepEqual([a,b],before);
});
