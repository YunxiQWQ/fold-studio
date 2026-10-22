import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {SELECTED_BOXES} from '../src/selected-structures.js';
import {SELECTED_CONTAINERS} from '../src/selected-containers.js';

const types=[...Object.keys(SELECTED_BOXES),...Object.keys(SELECTED_CONTAINERS)];
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}`;
const installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const artifacts=resolve('artifacts');mkdirSync(artifacts,{recursive:true});let browser;const errors=[],checks=[];
async function choose(page,type){await page.locator('#open-templates').click();await page.locator(`[data-template="${type}"]`).click();if(await page.locator('#confirm-dialog').isVisible())await page.locator('#accept-confirm').click();await page.waitForFunction(t=>window.__foldStudio.stats.modelType===t,type);}
async function fold(page,value){await page.locator('#fold-slider').fill(String(value));await page.locator('#fold-slider').dispatchEvent('input');await page.waitForFunction(t=>window.__foldStudio.stats.fold===t,value/100);}
try{
  browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');
  await page.locator('#open-templates').click();assert.equal(await page.locator('.template-card').count(),30);await page.keyboard.press('Escape');
  for(const type of types){
    await choose(page,type);const before=await page.evaluate(()=>window.__foldStudio.stats);
    for(const progress of [0,45,78,100])await fold(page,progress);
    const after=await page.evaluate(()=>window.__foldStudio.stats);assert.equal(after.geometryBuilds,before.geometryBuilds);assert.equal(after.textureUpdates,before.textureUpdates);
    for(const side of ['inside','outside']){await page.locator(`[data-side="${side}"]`).click();await page.locator('#inspect-panel').click();const canvas=page.locator('[data-testid="preview-canvas"]'),b=await canvas.boundingBox();await canvas.click({position:{x:b.width/2,y:b.height/2}});assert.equal((await page.evaluate(()=>window.__foldStudio.selection)).side,side);await page.locator('#inspect-panel').click();}
    await page.locator('#add-text').click();await page.locator('#prop-text').fill('新增模型实测');await page.locator('#prop-text').dispatchEvent('input');
    await page.waitForFunction(()=>window.__foldStudio.project.layers.some(l=>l.text==='新增模型实测'));
    await page.locator('#export-toggle').click();const dl=page.waitForEvent('download');await page.locator('#export-svg').click();const file=await dl;const dest=resolve(artifacts,`selected-${type}.svg`);await file.saveAs(dest);
    await page.locator('#project-input').setInputFiles(dest);await page.waitForFunction(t=>window.__foldStudio.project.type===t,type);
    assert.ok(await page.evaluate(()=>window.__foldStudio.project.layers.some(l=>l.text==='新增模型实测')));
  }
  checks.push('30 library entries; all ten new models support four fold states, inside/outside pointer picking, text editing and SVG project round trips');
  await choose(page,'gable-handle-carton');await page.locator('#fit-3d').click();await page.screenshot({path:resolve(artifacts,'selected-gable-workspace.png')});
  await choose(page,'screw-metal-tin');await page.locator('#fit-3d').click();await page.screenshot({path:resolve(artifacts,'selected-tin-workspace.png')});
  // A clean module harness checks the exported binary through the actual GLTF loader.
  const harness=await browser.newPage({viewport:{width:1800,height:930}});harness.on('pageerror',e=>errors.push(e.message));
  await harness.route('**/selected-harness',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await harness.goto(url+'/selected-harness');
  const results=await harness.evaluate(async types=>{
    const [{exportGLB},{BOX_TYPES,makeDieline},{newProject,validateProject},{ImageCache},{GLTFLoader},THREE]=await Promise.all([import('/src/export3d.js'),import('/src/geometry.js'),import('/src/project.js'),import('/src/artwork.js'),import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),import('/node_modules/three/build/three.module.js')]);
    const results=[];
    for(const type of types){
      const p=newProject(type),d=makeDieline(type,p.dimensions);validateProject(JSON.parse(JSON.stringify(p)));
      for(const progress of [0,1]){
        const binary=await exportGLB(p,d,new ImageCache(),{fold:progress,resolution:1024}),loaded=await new GLTFLoader().parseAsync(binary,''),size=new THREE.Box3().setFromObject(loaded.scene).getSize(new THREE.Vector3());
        if(!progress){const thickness=BOX_TYPES[type].family==='tray'?size.y:size.z;if(Math.abs(thickness-.45)>.001)throw Error(type+' flat export thickness '+thickness);}
        else{const dim=p.dimensions;for(const [actual,expected]of [[size.x,dim.length],[size.y,dim.height],[size.z,dim.depth]])if(Math.abs(actual-expected)>2)throw Error(type+' exported size '+size.toArray());}
        let meshes=0,textured=0;loaded.scene.traverse(o=>{if(o.isMesh){meshes++;if(o.material.map)textured++;o.geometry.dispose();o.material.map?.dispose();o.material.dispose();}});if(!textured)throw Error('Missing artwork in '+type);
        results.push({type,fold:progress,size:size.toArray(),meshes,bytes:binary.byteLength});
      }
    }
    return results;
  },types);
  assert.equal(results.length,20);checks.push('20 GLB exports reloaded: closed dimensions, flat paper thickness, real meshes and embedded artwork textures');
  const overview=await harness.evaluate(async types=>{
    const [{Preview3D},{ImageCache},{BOX_TYPES,makeDieline},{newProject}]=await Promise.all([import('/src/preview3d.js'),import('/src/artwork.js'),import('/src/geometry.js'),import('/src/project.js')]);
    document.body.style='margin:0;background:#f6f4ef;font:16px sans-serif;color:#302d28';document.body.innerHTML='<h1 style="margin:30px 36px 7px;font-size:28px">折间 · 本轮新增模型</h1><p style="margin:0 36px;color:#817567">P1–P5 / C1–C3 · 食品罐头组合含高罐、矮罐与盐纸盒 · 共新增 10 款</p><div id="grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin:25px 28px"></div><div id="host" style="position:fixed;left:-500px;width:320px;height:280px"></div>';
    const preview=new Preview3D(document.querySelector('#host'),new ImageCache(),()=>{},()=>{});preview.setQuality('balanced');preview.renderer.toneMappingExposure=.96;
    for(const [i,type]of types.entries()){
      const p=newProject(type);p.layers=[];p.paper=i<6?'#b7c6d6':'#b4cbb8';p.insidePaper='#eee5cd';p.fold=type==='display-hinged'?.82:type==='card-deck-lock'?.96:1;
      preview.build(p,makeDieline(type,p.dimensions));preview.fit();preview.render();const src=preview.renderer.domElement.toDataURL();
      const tile=document.createElement('div');tile.style='background:white;border:1px solid #dedbd3;border-radius:14px;padding:10px 12px 17px;text-align:center';
      const image=document.createElement('img');image.src=src;image.style='width:100%;height:280px;object-fit:contain';await image.decode();tile.append(image);
      const title=document.createElement('strong');title.textContent=BOX_TYPES[type].name;tile.append(title);const detail=document.createElement('p');detail.style='font-size:13px;color:#817567;margin:8px 0 0';detail.textContent=Object.values(p.dimensions).join(' × ')+' mm';tile.append(detail);document.querySelector('#grid').append(tile);
    }
    preview.dispose();preview.renderer.forceContextLoss();document.querySelector('#host').remove();return true;
  },types);
  assert.ok(overview);await harness.screenshot({path:resolve(artifacts,'selected-models-overview.png')});
  const offline=await browser.newPage({viewport:{width:1500,height:960}}),requests=[];offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});offline.on('pageerror',e=>errors.push(e.message));
  await offline.goto(pathToFileURL(resolve('折间.html')).href);await offline.waitForSelector('html[data-ready="true"]');
  for(const type of ['card-deck-lock','gable-handle-carton','food-tin-tall','food-tin-low','screw-metal-tin']){await choose(offline,type);await fold(offline,0);await fold(offline,100);}
  assert.deepEqual(requests,[]);checks.push('rebuilt offline HTML loads the new paper and CC0 mesh models with zero network requests');
  assert.deepEqual(errors,[]);writeFileSync(resolve(artifacts,'selected-models-verification.json'),JSON.stringify({checks,results,errors},null,2));console.log(checks.join('\n'));
}finally{await browser?.close();await server.close();}
