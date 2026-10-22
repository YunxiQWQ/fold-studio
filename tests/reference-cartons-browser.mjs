import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
const url=`http://127.0.0.1:${server.httpServer.address().port}`,installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const types=['triangular-prism-carton','rope-gable-carton'],errors=[],checks=[];mkdirSync('artifacts',{recursive:true});let browser;
async function choose(page,type){await page.locator('#open-templates').click();assert.equal(await page.locator(`[data-template="${type}"]`).count(),1);await page.locator(`[data-template="${type}"]`).click();if(await page.locator('#confirm-dialog').isVisible())await page.locator('#accept-confirm').click();await page.waitForFunction(t=>window.__foldStudio.stats.modelType===t,type);}
async function fold(page,n){await page.locator('#fold-slider').fill(String(n));await page.locator('#fold-slider').dispatchEvent('input');await page.waitForFunction(n=>window.__foldStudio.stats.fold===n,n/100);}
try{
 browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1050},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForSelector('html[data-ready="true"]');
 await page.locator('#open-templates').click();assert.equal(await page.locator('.template-card').count(),30);await page.keyboard.press('Escape');
 for(const type of types){
  await choose(page,type);const before=await page.evaluate(()=>window.__foldStudio.stats);
  for(const value of [0,45,78,100])await fold(page,value);
  const after=await page.evaluate(()=>window.__foldStudio.stats);assert.equal(after.geometryBuilds,before.geometryBuilds);assert.equal(after.textureUpdates,before.textureUpdates);
  for(const side of ['inside','outside']){await page.locator(`[data-side="${side}"]`).click();await page.locator('#inspect-panel').click();const canvas=page.locator('[data-testid="preview-canvas"]'),b=await canvas.boundingBox();await canvas.click({position:{x:b.width/2,y:b.height/2}});assert.equal((await page.evaluate(()=>window.__foldStudio.selection)).panelId,'front');assert.equal((await page.evaluate(()=>window.__foldStudio.selection)).side,side);await page.locator('#inspect-panel').click();}
  if(type==='triangular-prism-carton'){
   assert.ok((await page.locator('#dim-height').locator('..').textContent()).includes('斜边'));
   await page.locator('#reference-orientation').selectOption('standing');assert.equal((await page.evaluate(()=>window.__foldStudio.project.dimensions)).orientation,'standing');
   await page.locator('#dim-height').fill('20');await page.locator('#dim-height').dispatchEvent('change');assert.equal(await page.locator('#dim-height').inputValue(),'74');
   await page.locator('#dim-depth').fill('160');await page.locator('#dim-depth').dispatchEvent('change');assert.ok(+(await page.locator('#dim-height').inputValue())>80);await page.locator('#undo').click();assert.equal(await page.locator('#dim-depth').inputValue(),'74');
   await page.locator('#reference-orientation').selectOption('lying');
  }else{
   const rise=page.locator('input[type="number"][data-extra-dim="roofDepth"]');await rise.fill('67');await rise.dispatchEvent('change');await page.waitForFunction(()=>window.__foldStudio.project.dimensions.roofDepth===67);await page.locator('#undo').click();assert.equal((await page.evaluate(()=>window.__foldStudio.project.dimensions)).roofDepth,61);
  }
  await page.locator('#add-text').click();await page.locator('#prop-text').fill('结构新增实测');await page.locator('#prop-text').dispatchEvent('input');
  await page.locator('#export-toggle').click();const download=page.waitForEvent('download');await page.locator('#export-svg').click();const file=resolve('artifacts',type+'-export.svg');await(await download).saveAs(file);await page.locator('#project-input').setInputFiles(file);await page.waitForFunction(()=>window.__foldStudio.project.layers.some(l=>l.text==='结构新增实测'));
  await page.locator('#panel-selector').selectOption('front');await page.locator('#fit-3d').click();await page.waitForTimeout(3200);await page.screenshot({path:resolve('artifacts',type+'-workspace.png')});
 }
 checks.push('30 library entries; both reference constructions fold without rebuilding geometry or repainting textures; inside/outside picking; custom dimensions, prism orientation and valid sides; undo/redo and SVG project round trips');
 const harness=await browser.newPage({viewport:{width:1800,height:900}});harness.on('pageerror',e=>errors.push(e.message));await harness.route('**/reference-harness',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await harness.goto(url+'/reference-harness');
 const results=await harness.evaluate(async()=>{
  const [{exportGLB},{makeDieline},{newProject},{ImageCache},{GLTFLoader},{Preview3D},THREE]=await Promise.all([import('/src/export3d.js'),import('/src/geometry.js'),import('/src/project.js'),import('/src/artwork.js'),import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),import('/src/preview3d.js'),import('/node_modules/three/build/three.module.js')]);
  document.body.style='margin:0;background:#f7f5ef;font:16px sans-serif;color:#302d28';document.body.innerHTML='<h1 style="margin:30px 32px 8px">折间 · 本轮新增结构</h1><p style="margin:0 32px;color:#817567">三角柱盒：平放 / 竖立共用一个模型 · 绳提手折顶礼盒：折顶、穿槽与锁底</p><div id="grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:27px"></div><div id="host" style="position:fixed;left:-650px;width:550px;height:620px"></div>';
  const preview=new Preview3D(document.querySelector('#host'),new ImageCache(),()=>{},()=>{});preview.setQuality('balanced');preview.renderer.toneMappingExposure=.98;
  const scenarios=[{type:'triangular-prism-carton',orientation:'lying',title:'三角柱盒 · 平放'},{type:'triangular-prism-carton',orientation:'standing',title:'三角柱盒 · 竖立'},{type:'rope-gable-carton',title:'绳提手折顶礼盒'}],results=[];
  for(const info of scenarios){
   const p=newProject(info.type);if(info.orientation)p.dimensions.orientation=info.orientation;const d=makeDieline(p.type,p.dimensions);preview.build(p,d);preview.render();
   const tile=document.createElement('div');tile.style='background:white;border:1px solid #dedbd3;border-radius:14px;text-align:center;padding:12px 10px 20px';const img=document.createElement('img');img.src=preview.renderer.domElement.toDataURL();img.style='width:100%;height:620px;object-fit:contain';await img.decode();tile.append(img);const title=document.createElement('strong');title.textContent=info.title;tile.append(title);const detail=document.createElement('p');detail.style='font-size:13px;color:#817567;margin:10px 0 0';detail.textContent='刀版 '+d.width.toFixed(0)+' × '+d.height.toFixed(0)+' mm';tile.append(detail);document.querySelector('#grid').append(tile);
   for(const progress of [0,1]){
    const binary=await exportGLB(p,d,new ImageCache(),{fold:progress,resolution:1024}),loaded=await new GLTFLoader().parseAsync(binary,'');loaded.scene.updateMatrixWorld(true);const paper=new THREE.Box3(),full=new THREE.Box3().setFromObject(loaded.scene,true).getSize(new THREE.Vector3());let handles=0,eyelets=0,textured=0;
    loaded.scene.traverse(o=>{if(o.isMesh){if(o.name.endsWith('_Handle'))handles++;else if(o.name.includes('_Eyelet_'))eyelets++;else paper.union(new THREE.Box3().setFromObject(o,true));if(o.material.map)textured++;}});
    const size=paper.getSize(new THREE.Vector3());if(!textured)throw Error('Missing artwork');
    if(handles!==((info.type==='rope-gable-carton'&&progress)?2:0)||eyelets!==((info.type==='rope-gable-carton'&&progress)?4:0))throw Error('Handle/eyelet visibility mismatch');
    if(!progress&&Math.abs(Math.min(...size.toArray())-.45)>.001)throw Error('Flat thickness '+size.toArray());
    if(progress){const expected=d.triangle?(info.orientation==='standing'?[d.triangle.altitude,p.dimensions.length,p.dimensions.depth]:[p.dimensions.length,d.triangle.altitude,p.dimensions.depth]):[p.dimensions.length,p.dimensions.height+d.ropeGable.rise,p.dimensions.depth];size.toArray().forEach((v,i)=>{if(Math.abs(v-expected[i])>2)throw Error(info.title+' export bounds '+size.toArray());});}
    results.push({type:info.type,orientation:info.orientation??null,fold:progress,size:size.toArray(),full:full.toArray(),handles,eyelets,bytes:binary.byteLength});
    loaded.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.map?.dispose();o.material.dispose();}});
   }
  }
  preview.dispose();preview.renderer.forceContextLoss();document.querySelector('#host').remove();return results;
 });
 assert.equal(results.length,6);await harness.screenshot({path:'artifacts/reference-cartons-overview.png'});checks.push('six reloaded GLBs: flat paper thickness, actual prism standing/lying bounds, fold-top body envelope, two ropes/four eyelets only in the formed gift carton');
 const offline=await browser.newPage({viewport:{width:1500,height:1000}}),requests=[];offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});offline.on('pageerror',e=>errors.push(e.message));await offline.goto(pathToFileURL(resolve('折间.html')).href);await offline.waitForSelector('html[data-ready="true"]');
 for(const type of types){await choose(offline,type);if(type==='triangular-prism-carton')await offline.locator('#reference-orientation').selectOption('standing');await fold(offline,0);await fold(offline,100);}assert.deepEqual(requests,[]);checks.push('rebuilt offline file supports both new constructions and prism orientation with zero HTTP requests');
 assert.deepEqual(errors,[]);writeFileSync('artifacts/reference-cartons-verification.json',JSON.stringify({checks,results,errors},null,2));console.log(checks.join('\n'));
}finally{await browser?.close();await server.close();}
