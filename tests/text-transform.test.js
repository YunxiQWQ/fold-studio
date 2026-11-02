import test from 'node:test';
import assert from 'node:assert/strict';
import {textGeometry,setTextScale,resizeTextDimension} from '../src/text-transform.js';
import {newProject,validateProject} from '../src/project.js';
import {encodeLayers,decodeLayers,layersForPaste} from '../src/clipboard.js';
import {makeDieline} from '../src/geometry.js';

test('glyph stretching preserves logical layout dimensions and nominal font size',()=>{
  const l={w:.6,h:.2,size:7};const initial=textGeometry(l,60,20);
  setTextScale(l,'x',1.8);setTextScale(l,'y',.75);
  const stretched=textGeometry(l,l.w*100,l.h*100);assert.ok(Math.abs(stretched.width-initial.width)<1e-9);assert.ok(Math.abs(stretched.height-initial.height)<1e-9);assert.equal(stretched.scaleX,1.8);assert.equal(stretched.scaleY,.75);assert.equal(l.size,7);
  resizeTextDimension(l,'w',l.w*1.5,true);assert.ok(Math.abs(textGeometry(l,l.w*100,l.h*100).width-60)<1e-9);
  const scale=l.textScaleX;resizeTextDimension(l,'w',.4,false);assert.equal(l.textScaleX,scale);assert.notEqual(textGeometry(l,40,l.h*100).width,60);
});
test('text stretch survives projects and clipboard, while invalid or non-text stretch is rejected',()=>{
  const p=newProject(),l=p.layers.find(l=>l.type==='text');l.textScaleX=1.7;l.textScaleY=.6;
  assert.equal(validateProject(p).layers.find(x=>x.id===l.id).textScaleX,1.7);
  const d=makeDieline(p.type,p.dimensions),panel=d.panels.find(x=>x.id===l.panel),payload=decodeLayers(encodeLayers([l],panel));
  assert.equal(layersForPaste(p,payload,panel,'inside')[0].textScaleY,.6);
  for(const value of [0,-1,21,NaN,'1']){const invalid=structuredClone(p);invalid.layers.find(x=>x.id===l.id).textScaleX=value;assert.throws(()=>validateProject(invalid),/拉伸/);}
  const legacy=newProject();assert.equal(validateProject(legacy).version,2);assert.equal(textGeometry(legacy.layers[1],50,20).scaleX,1);
});
