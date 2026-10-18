import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject, validateProject, sideOf, surfaceOf } from '../src/project.js';
import { makeDieline } from '../src/geometry.js';
import { layerBounds, hitLayer } from '../src/artwork.js';
import { encodeLayers, decodeLayers, layersForPaste, CLIPBOARD_PREFIX } from '../src/clipboard.js';

test('legacy single-sided projects migrate without losing artwork or outside colors',()=>{
  const legacy=newProject();legacy.version=1;delete legacy.insidePaper;delete legacy.insidePanelColors;
  legacy.layers.forEach(l=>delete l.side);legacy.panelColors.front='#123456';
  const migrated=validateProject(legacy);
  assert.equal(migrated.version,2);
  assert.equal(migrated.layers.length,legacy.layers.length);assert.ok(migrated.layers.every(l=>sideOf(l)==='outside'));
  assert.equal(migrated.insidePaper,'#eeeadd');assert.deepEqual(migrated.insidePanelColors,{});assert.equal(migrated.panelColors.front,'#123456');
});
test('inside colors and artwork survive project serialization independently of outside',()=>{
  const p=newProject();p.insidePaper='#e2d6f1';p.insidePanelColors.front='#aabbcc';
  p.layers.push({...p.layers[2],id:crypto.randomUUID(),side:'inside',text:'INSIDE'});
  const saved=validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(surfaceOf(saved,'outside').paper,'#f3f0df');assert.equal(surfaceOf(saved,'inside').colors.front,'#aabbcc');
  assert.equal(saved.layers.find(l=>l.side==='inside').text,'INSIDE');
  saved.layers[0].side='sideways';assert.throws(()=>validateProject(saved));
});
test('inside hit-testing selects only inside artwork at its reversed physical location',()=>{
  const p=newProject(),d=makeDieline(p.type,p.dimensions),panel=d.panels.find(p=>p.id==='front');
  const inside={...p.layers[2],id:crypto.randomUUID(),side:'inside',x:.2,y:.5,w:.15,h:.1,rotation:30};p.layers.push(inside);
  const bounds=layerBounds(inside,panel);
  assert.equal(bounds.x,panel.x+.8*panel.w);
  assert.equal(hitLayer(p,d,bounds.x,bounds.y,'inside').id,inside.id);
  assert.notEqual(hitLayer(p,d,panel.x+.2*panel.w,bounds.y,'inside')?.id,inside.id);
  assert.notEqual(hitLayer(p,d,bounds.x,bounds.y,'outside')?.id,inside.id);
});
test('clipboard retains text formatting and image bytes while assigning a new target face, side, and ID',()=>{
  const source=newProject(),destination=newProject('tray');
  const sourcePanel=makeDieline(source.type,source.dimensions).panels.find(p=>p.id==='front');
  const target=makeDieline(destination.type,destination.dimensions).panels.find(p=>p.id==='base');
  const image={...source.layers[0],id:crypto.randomUUID(),type:'image',src:'data:image/png;base64,YQ==',side:'inside',w:.5,h:.2};
  const payload=decodeLayers(encodeLayers([source.layers[2],image],sourcePanel));
  const pasted=layersForPaste(destination,payload,target,'inside',0);
  assert.equal(pasted[0].text,source.layers[2].text);assert.equal(pasted[0].size,source.layers[2].size);assert.equal(pasted[1].src,image.src);
  assert.ok(pasted.every(l=>l.side==='inside'&&l.panel==='base'));assert.notEqual(pasted[0].id,source.layers[2].id);
  assert.ok(Math.abs(pasted[1].w*target.w-image.w*sourcePanel.w)<1e-8);
  assert.ok(Math.abs(pasted[1].h*target.h-image.h*sourcePanel.h)<1e-8);
  assert.equal(pasted[0].x,source.layers[2].x);
});
test('untrusted clipboard payloads fail before changing the destination project',()=>{
  const p=newProject(),before=structuredClone(p),panel=makeDieline(p.type,p.dimensions).panels[0];
  assert.equal(decodeLayers('普通文字'),null);assert.throws(()=>decodeLayers(CLIPBOARD_PREFIX+'{bad json}'));
  const payload=decodeLayers(encodeLayers([p.layers[0]],panel));payload.layers[0].opacity=Infinity;
  assert.throws(()=>layersForPaste(p,payload,panel,'inside'));assert.deepEqual(p,before);
});
