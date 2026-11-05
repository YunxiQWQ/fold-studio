import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject} from '../src/project.js';
import {makeDieline} from '../src/geometry.js';
import {svgSceneLayers} from '../src/svg-scene.js';
import {copySvgNodes} from '../src/svg-asset.js';
const asset=()=>({viewBox:[-12,-8,420,300],nodes:[{tag:'path',attrs:{id:'editable',d:'M 1 2 L 30 40',stroke:'#123456',fill:'none'},children:[]}]});

test('legacy group metadata survives project validation and copies use independent groups',()=>{
  const document=asset();
  document.nodes[0].attrs['data-fold-group']='legacy-123';
  const project=newProject();project.svgArtwork={outside:document};
  assert.equal(validateProject(project).svgArtwork.outside.nodes[0].attrs['data-fold-group'],'legacy-123');
  const copy=copySvgNodes(document,{prefix:'paste-'});
  assert.equal(copy[0].attrs['data-fold-group'],'paste-legacy-123');
  assert.equal(document.nodes[0].attrs['data-fold-group'],'legacy-123');
});
test('native main SVG scenes survive project validation and share physical coordinates with both print surfaces',()=>{
  const p=newProject(),d=makeDieline(p.type,p.dimensions);p.svgArtwork={outside:asset(),inside:asset()};
  const saved=validateProject(p);assert.deepEqual(saved.svgArtwork,p.svgArtwork);
  const layers=svgSceneLayers(saved,d);assert.equal(layers.length,2);
  for(const l of layers){const panel=d.panels[0];assert.equal(l.w*panel.w,420);assert.equal(l.h*panel.h,300);assert.ok(Math.abs(panel.x+(l.side==='inside'?1-l.x:l.x)*panel.w-198)<1e-8);}
  for(const bad of [{outside:{...asset(),nodes:[{tag:'script',attrs:{},children:[]}]}},{unknown:asset()},[]])assert.throws(()=>validateProject({...p,svgArtwork:bad}));
});
test('native barcode metadata is validated independently and cannot bypass layer validation',()=>{
  const p=newProject(),barcode={...p.layers[0],id:'barcode',type:'barcode',code:'6901234567892',color:'#000000'};p.svgGenerators={[barcode.id]:barcode};assert.deepEqual(validateProject(p).svgGenerators,p.svgGenerators);
  assert.throws(()=>validateProject({...p,svgGenerators:{bad:{...barcode,type:'script'}}}));
  assert.throws(()=>validateProject({...p,svgGenerators:{bad:{...barcode,code:'x'.repeat(1000)}}}));
});
