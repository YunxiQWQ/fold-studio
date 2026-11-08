import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BOX_TYPES,makeDieline} from '../src/geometry.js';
import {TEMPLATE_CATALOG,templateId,projectTemplate} from '../src/template-catalog.js';
import {RETAIL_STYLES} from '../src/retail-cartons.js';
import {TEMPLATE_PREVIEWS} from '../src/template-previews.generated.js';
import {newProject,validateProject} from '../src/project.js';

test('eight flat retail cards select the existing project type with distinct closure parameters',()=>{
  assert.equal(Object.keys(TEMPLATE_CATALOG).length,Object.keys(BOX_TYPES).length+7);
  assert.equal(Object.hasOwn(TEMPLATE_CATALOG,'retail-carton'),false);
  for(const [id,info]of Object.entries(TEMPLATE_CATALOG)){
    const p=newProject(info.type,info.defaults);
    assert.equal(templateId(p),id);assert.equal(projectTemplate(p).name,info.name);
    assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
    if(info.type==='retail-carton')assert.equal(makeDieline(p.type,p.dimensions).retail.style,info.defaults.retailStyle);
  }
});
test('legacy retail documents resolve to the right card without migrating their type, size or artwork',()=>{
  for(const style of Object.keys(RETAIL_STYLES)){
    const p=newProject('retail-carton');p.dimensions={...p.dimensions,length:143,depth:57,height:208,retailStyle:style};
    const serialized=JSON.stringify(p),loaded=validateProject(JSON.parse(serialized));
    assert.equal(templateId(loaded),'retail-carton-'+style);assert.equal(projectTemplate(loaded).name,RETAIL_STYLES[style]);
    assert.equal(JSON.stringify(loaded),serialized);
  }
  const p=newProject('retail-carton');delete p.dimensions.retailStyle;
  assert.equal(templateId(p),'retail-carton-straight');assert.equal(Object.hasOwn(p.dimensions,'retailStyle'),false);
});
test('all named options from both reference panels and the lid tool have searchable direct entries',()=>{
  const panels=[
    [['直线盒','retail-carton-straight'],['自锁底盒','retail-carton-lock'],['手提袋','paper-bag-basic'],['手提盒','slotted-handle-carton'],['吊挂盒','retail-carton-hanging-lock']],
    [['直线盒','retail-carton-straight'],['锁底盒','retail-carton-lock'],['飞机盒','retail-carton-airplane'],['上盖盒','retail-carton-upper'],['同向盖','retail-carton-same'],['粘底盒','retail-carton-glue'],['挂耳盒','retail-carton-hanging'],['手提盒','slotted-handle-carton'],['纸箱','shipper']],
    [['硬盒','wrapped-lidbox'],['软盒','lidbox']],
  ];
  assert.deepEqual(panels.map(p=>p.length),[5,9,2]);
  assert.equal(new Set(panels.slice(0,2).flat().map(([,id])=>id)).size,11);
  for(const [query,id]of panels.flat()){
    const t=TEMPLATE_CATALOG[id];assert.ok(t,id);
    assert.ok([t.name,t.description,...(t.aliases??[])].join(' ').includes(query),query);
  }
});
test('every direct card has a model-derived preview, including eight different retail previews',()=>{
  assert.deepEqual(Object.keys(TEMPLATE_PREVIEWS),Object.keys(TEMPLATE_CATALOG));
  const retail=new Set();
  for(const [id,info]of Object.entries(TEMPLATE_CATALOG)){
    const preview=TEMPLATE_PREVIEWS[id];assert.ok(preview.src.startsWith('data:image/png;base64,'));
    assert.ok(preview.occupied>1000);assert.deepEqual(preview.dimensions,info.defaults);
    if(info.type==='retail-carton')retail.add(preview.src);
  }
  assert.equal(retail.size,8);
});
