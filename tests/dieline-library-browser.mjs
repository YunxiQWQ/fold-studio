import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {BOX_TYPES} from '../src/geometry.js';
import {RETAIL_STYLES} from '../src/retail-cartons.js';
import {installBrowserModuleMap} from './browser-module-map.mjs';

const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});await server.listen();
const url=process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const exe=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/dieline-library');mkdirSync(dir,{recursive:true});
const page=await browser.newPage({viewport:{width:1700,height:1100},acceptDownloads:true}),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
async function choose(type){await page.locator('#open-templates').click();await page.locator(`[data-template="${type}"]`).click();if(await page.locator('#confirm-dialog').isVisible())await page.locator('#accept-confirm').click();await page.waitForFunction(type=>window.__foldStudio.project.type===type,type);await ready();}
async function fold(n){await page.locator('#fold-slider').fill(String(n));await page.locator('#fold-slider').dispatchEvent('input');await page.waitForFunction(n=>window.__foldStudio.stats.fold===n/100,n);}
async function number(key,value){const input=page.locator(`input[type="number"][data-extra-dim="${key}"]`);await input.fill(String(value));await input.dispatchEvent('input');await input.dispatchEvent('change');await page.waitForFunction(([key,value])=>window.__foldStudio.project.dimensions[key]===value,[key,value]);await ready();}
async function download(id,file){const promise=page.waitForEvent('download');await page.locator(id).click();const path=resolve(dir,file);await(await promise).saveAs(path);return path;}
try{
  await page.goto(url);await ready();await page.locator('#open-templates').click();assert.equal(await page.locator('.template-card').count(),Object.keys(BOX_TYPES).length);
  for(const [query,type]of [['挂耳','retail-carton'],['自锁底','retail-carton'],['手提袋','paper-bag-basic'],['硬盒','wrapped-lidbox'],['软盒','lidbox']]){await page.locator('#template-search').fill(query);assert.equal(await page.locator(`[data-template="${type}"]`).isVisible(),true);}
  await page.locator('#close-templates').click();checks.push('library contains 36 actual previews and searches both source names and structural aliases');
  await choose('retail-carton');assert.equal(await page.locator('#retail-style option').count(),Object.keys(RETAIL_STYLES).length);
  for(const style of Object.keys(RETAIL_STYLES)){
    await page.locator('#retail-style').selectOption(style);await page.waitForFunction(style=>window.__foldStudio.geometry.retail.style===style,style);await ready();
    const before=await page.evaluate(()=>window.__foldStudio.stats);for(const n of [0,35,70,100])await fold(n);const after=await page.evaluate(()=>window.__foldStudio.stats);assert.equal(after.geometryBuilds,before.geometryBuilds);assert.equal(after.textureUpdates,before.textureUpdates);
    assert.equal(await page.locator('input[type="number"][data-extra-dim="hangHeight"]').count(),style.startsWith('hanging')?1:0);
  }
  await number('hangHeight',45);await number('hangHoleWidth',25);await page.waitForFunction(()=>window.__foldStudio.geometry.retail.HW===25);await page.locator('#undo').click();await ready();assert.equal(await page.locator('input[type="number"][data-extra-dim="hangHoleWidth"]').inputValue(),'28');await page.locator('#redo').click();await ready();
  await page.screenshot({path:resolve(dir,'hanging-workspace.png')});checks.push('all eight closure graphs fold without mesh/texture rebuilds; conditional hanger controls, dimensions and undo/redo work');
  for(const type of ['retail-carton','paper-bag-basic','wrapped-lidbox']){
    if(type!=='retail-carton')await choose(type);
    if(type==='paper-bag-basic'){
      assert.equal(await page.locator('#bag-handle-style').inputValue(),'none');assert.equal(await page.locator('input[type="number"][data-extra-dim="topFold"]').inputValue(),'0');
      await page.locator('#bag-handle-style').selectOption('rope');await page.waitForFunction(()=>window.__foldStudio.geometry.paperBag.topFold===2);
      await page.locator('#bag-handle-style').selectOption('none');await number('topFold',0);await page.waitForFunction(()=>window.__foldStudio.geometry.panels.length===14);
      await page.locator('[data-bag-preset="portrait"]').click();await page.waitForFunction(()=>window.__foldStudio.project.dimensions.length===220);await page.locator('#undo').click();await ready();assert.equal(await page.locator('#bag-handle-style').inputValue(),'none');
    }
    if(type==='wrapped-lidbox'){
      await number('turnIn',12);await number('lidHeight',18);await number('lidClearance',2.5);await page.waitForFunction(()=>window.__foldStudio.geometry.wrappedLid.C===2.5);
    }
    for(const side of ['inside','outside']){await page.locator('#side-'+side).click();await ready();await page.locator('#add-text').click();await page.locator('#node-text').fill(type+' '+side);await page.locator('#node-text').blur();await page.waitForFunction(text=>JSON.stringify(window.__foldStudio.project.svgArtwork).includes(text),type+' '+side);}
    await page.locator('#export-toggle').click();const svgPath=await download('#export-svg',type+'.svg'),svg=readFileSync(svgPath,'utf8');assert.ok(svg.includes(type));assert.ok(svg.includes('<path'));assert.ok(svg.includes(type+' outside'));
    const saved=await download('#save-project',type+'.fold'),data=JSON.parse(readFileSync(saved,'utf8'));assert.ok(JSON.stringify(data.svgArtwork).includes(type+' inside'));
    await choose('carton');await page.locator('#project-input').setInputFiles(saved);await page.waitForFunction(type=>window.__foldStudio.project.type===type,type);await ready();assert.deepEqual(await page.evaluate(()=>window.__foldStudio.project.dimensions),data.dimensions);
    await page.locator('#project-input').setInputFiles(svgPath);await ready();assert.equal(await page.evaluate(()=>window.__foldStudio.project.type),type);assert.ok(await page.evaluate(text=>JSON.stringify(window.__foldStudio.project.svgArtwork).includes(text),type+' inside'));
    await page.screenshot({path:resolve(dir,type+'-workspace.png')});
  }
  checks.push('basic zero-hem bag supports optional rope holes and presets; lid height, turn-in and half-mm clearance change actual geometry; all three constructions retain both editable sides in .fold and SVG round trips');
  for(const type of ['retail-carton','paper-bag-basic','wrapped-lidbox']){
    await choose(type);await page.locator('#dim-height').fill('15');await page.locator('#dim-height').dispatchEvent('change');await page.waitForFunction(()=>window.__foldStudio.geometry.panels.some(p=>p.h===15));await ready();
    assert.deepEqual(await page.locator('#extra-dimensions input[type="number"]').evaluateAll(inputs=>inputs.filter(i=>!i.checkValidity()).map(i=>({key:i.dataset.extraDim,value:i.value,min:i.min,max:i.max,step:i.step}))),[]);
  }
  checks.push('small dimensions keep every structural input valid, including fractional clamped turn-ins and tongues');
  const harness=await browser.newPage();harness.on('pageerror',e=>errors.push(e.message));await harness.route('**/dieline-harness',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await harness.goto(`http://127.0.0.1:${server.httpServer.address().port}/dieline-harness`);await installBrowserModuleMap(harness);
  const glbs=await harness.evaluate(async()=>{
    const [{exportGLB},{makeDieline},{newProject},{ImageCache},{GLTFLoader},THREE]=await Promise.all([import('/src/export3d.js'),import('/src/geometry.js'),import('/src/project.js'),import('/src/artwork.js'),import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),import('/node_modules/three/build/three.module.js')]);
    const results=[];
    for(const type of ['retail-carton','paper-bag-basic','wrapped-lidbox'])for(const progress of [0,.6,1]){
      const p=newProject(type);if(type==='retail-carton')p.dimensions.retailStyle='hanging-lock';const d=makeDieline(type,p.dimensions),binary=await exportGLB(p,d,new ImageCache(),{fold:progress,resolution:512}),g=await new GLTFLoader().parseAsync(binary,'');
      const size=new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3()).toArray();if(!size.every(n=>Number.isFinite(n)&&n>0))throw Error(type+' invalid GLB bounds');if(progress===0&&Math.abs(Math.min(...size)-.45)>.005)throw Error(type+' non-flat sheet: '+size);
      if(progress===1){const {length:L,depth:D,height:H}=p.dimensions,expected=d.wrappedLid?[L+2*d.wrappedLid.C,H+d.wrappedLid.C,D+2*d.wrappedLid.C]:[L,d.retail?.totalHeight??H,D];for(let i=0;i<3;i++)if(Math.abs(size[i]-expected[i])>1.6)throw Error(type+' wrong formed size: '+size+' expected '+expected);}
      let textured=0,handles=0;const disposed=new Set();g.scene.traverse(o=>{if(o.isMesh){if(o.name.endsWith('_Handle'))handles++;if(o.material.map)textured++;o.geometry.dispose();if(!disposed.has(o.material)){disposed.add(o.material);o.material.map?.dispose();o.material.dispose();}}});if(!textured||handles)throw Error(type+' missing printable meshes or unexpected handles');results.push({type,fold:progress,size,bytes:binary.byteLength,textured});
    }
    return results;
  });await harness.close();assert.equal(glbs.length,9);checks.push('nine GLBs reload: flat, partially folded and formed geometry retains textures and has finite bounds; the basic bag adds no artificial handles');
  const offline=await browser.newPage(),requests=[];offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});offline.on('pageerror',e=>errors.push(e.message));await offline.goto(pathToFileURL(resolve('折间.html')).href);await offline.locator('#editor-host[data-svg-ready="true"]').waitFor();
  for(const type of ['retail-carton','paper-bag-basic','wrapped-lidbox']){await offline.locator('#open-templates').click();await offline.locator(`[data-template="${type}"]`).click();if(await offline.locator('#confirm-dialog').isVisible())await offline.locator('#accept-confirm').click();await offline.waitForFunction(type=>window.__foldStudio.project.type===type,type);}
  assert.deepEqual(requests,[]);await offline.close();checks.push('rebuilt standalone opens every added construction with zero HTTP requests');
  assert.deepEqual(errors,[]);writeFileSync(resolve(dir,'report.json'),JSON.stringify({checks,glbs,errors},null,2));console.log(checks.join('\n'));
}catch(e){console.log({checks,errors});await page.screenshot({path:resolve(dir,'failure.png')});throw e;}
finally{await browser.close();await server?.close();}
