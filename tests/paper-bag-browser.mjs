import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {PAPER_BAG_PRESETS} from '../src/paper-bag.js';

const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
const url=`http://127.0.0.1:${server.httpServer.address().port}`,installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
mkdirSync('artifacts',{recursive:true});let browser;const errors=[],checks=[];
async function choose(page){await page.locator('#open-templates').click();assert.equal(await page.locator('[data-template="paper-shopping-bag"]').count(),1);await page.locator('[data-template="paper-shopping-bag"]').click();if(await page.locator('#confirm-dialog').isVisible())await page.locator('#accept-confirm').click();await page.waitForFunction(()=>window.__foldStudio.stats.modelType==='paper-shopping-bag');}
async function fold(page,n){await page.locator('#fold-slider').fill(String(n));await page.locator('#fold-slider').dispatchEvent('input');await page.waitForFunction(n=>window.__foldStudio.stats.fold===n,n/100);}
try{
 browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1050},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForSelector('html[data-ready="true"]');await choose(page);
 for(const [id,preset]of Object.entries(PAPER_BAG_PRESETS)){
  await page.locator(`[data-bag-preset="${id}"]`).click();await page.waitForFunction(d=>window.__foldStudio.project.dimensions.length===d.length&&window.__foldStudio.project.dimensions.height===d.height,preset);
  for(const key of ['length','depth','height'])assert.equal(+await page.locator('#dim-'+key).inputValue(),preset[key]);
  assert.equal(await page.locator('#bag-handle-style').inputValue(),preset.handleStyle);assert.equal(await page.locator('#bag-handle-pose').inputValue(),preset.handlePose);
  const before=await page.evaluate(()=>window.__foldStudio.stats);
  for(const n of [0,45,78,100])await fold(page,n);
  const after=await page.evaluate(()=>window.__foldStudio.stats);assert.equal(after.geometryBuilds,before.geometryBuilds);assert.equal(after.textureUpdates,before.textureUpdates);
  for(const side of ['inside','outside']){await page.locator(`[data-side="${side}"]`).click();await page.locator('#inspect-panel').click();const canvas=page.locator('[data-testid="preview-canvas"]'),b=await canvas.boundingBox();await canvas.click({position:{x:b.width/2,y:b.height/2}});assert.deepEqual(await page.evaluate(()=>({panelId:window.__foldStudio.selection.panelId,side:window.__foldStudio.selection.side})),{panelId:'front',side});await page.locator('#inspect-panel').click();}
 }
 await page.locator('#dim-length').fill('240');await page.locator('#dim-length').dispatchEvent('change');await page.waitForFunction(()=>window.__foldStudio.project.dimensions.length===240);
 const extra=page.locator('input[type="number"][data-extra-dim="topFold"]');await extra.fill('40');await extra.dispatchEvent('change');await page.waitForFunction(()=>window.__foldStudio.project.dimensions.topFold===40);
 await page.locator('#bag-handle-style').selectOption('ribbon');await page.locator('#bag-handle-pose').selectOption('raised');
 const dimensions=await page.evaluate(()=>window.__foldStudio.project.dimensions);assert.equal(dimensions.handleStyle,'ribbon');assert.equal(dimensions.handlePose,'raised');
 await page.locator('[data-bag-preset="square"]').click();await page.locator('#undo').click();assert.equal(await page.locator('#dim-length').inputValue(),'240');await page.locator('#redo').click();assert.equal(await page.locator('#dim-length').inputValue(),'330');
 await page.locator('#add-text').click();await page.locator('#prop-text').fill('纸袋预设实测');await page.locator('#prop-text').dispatchEvent('input');
 await page.locator('#export-toggle').click();const dl=page.waitForEvent('download');await page.locator('#export-svg').click();await(await dl).saveAs(resolve('artifacts/paper-bag-export.svg'));
 await page.locator('#project-input').setInputFiles(resolve('artifacts/paper-bag-export.svg'));await page.waitForFunction(()=>window.__foldStudio.project.layers.some(l=>l.text==='纸袋预设实测'));assert.equal(await page.locator('#bag-handle-style').inputValue(),'rope');
 await page.locator('#panel-selector').selectOption('front');await page.locator('#fit-3d').click();await page.waitForTimeout(3200);await page.screenshot({path:'artifacts/paper-bag-workspace.png'});
 checks.push('one library entry; three reference presets; custom dimensions and handle options; undo/redo; both print sides; SVG project round trip; stable geometry/textures while folding');
 const harness=await browser.newPage({viewport:{width:1560,height:800}});harness.on('pageerror',e=>errors.push(e.message));await harness.route('**/bag-harness',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await harness.goto(url+'/bag-harness');
 const results=await harness.evaluate(async()=>{
  const [{exportGLB},{makeDieline},{newProject},{ImageCache},{GLTFLoader},{PAPER_BAG_PRESETS},{Preview3D},THREE]=await Promise.all([import('/src/export3d.js'),import('/src/geometry.js'),import('/src/project.js'),import('/src/artwork.js'),import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),import('/src/paper-bag.js'),import('/src/preview3d.js'),import('/node_modules/three/build/three.module.js')]);
  document.body.style='margin:0;background:#f7f5f0;font:15px sans-serif;color:#302d28';document.body.innerHTML='<h1 style="margin:28px 32px 8px">折间 · 手提纸袋</h1><p style="margin:0 32px;color:#7d776b">一个模型，横 / 方 / 竖三组尺寸；缎带 / 绳提手、提起 / 垂落可切换</p><div id="grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:25px 26px"></div><div id="host" style="position:fixed;left:-600px;width:480px;height:560px"></div>';
  const preview=new Preview3D(document.querySelector('#host'),new ImageCache(),()=>{},()=>{});preview.setQuality('balanced');preview.renderer.toneMappingExposure=.98;
  const results=[];
  for(const [id,dimensions]of Object.entries(PAPER_BAG_PRESETS)){
   const p=newProject('paper-shopping-bag');p.dimensions={...dimensions};const d=makeDieline(p.type,p.dimensions);
   preview.build(p,d);preview.render();const tile=document.createElement('div');tile.style='background:white;border:1px solid #e0dcd1;border-radius:12px;text-align:center;padding:12px';const img=document.createElement('img');img.src=preview.renderer.domElement.toDataURL();img.style='width:100%;height:560px;object-fit:contain';await img.decode();tile.append(img);const title=document.createElement('strong');title.textContent=dimensions.name+' · '+dimensions.length+' × '+dimensions.depth+' × '+dimensions.height+' mm';tile.append(title);document.querySelector('#grid').append(tile);
   for(const t of [0,1]){
    const binary=await exportGLB(p,d,new ImageCache(),{fold:t,resolution:768}),loaded=await new GLTFLoader().parseAsync(binary,''),bounds=new THREE.Box3().setFromObject(loaded.scene),size=bounds.getSize(new THREE.Vector3());let handles=0,textured=0;const paperBounds=new THREE.Box3();loaded.scene.updateMatrixWorld(true);
    loaded.scene.traverse(o=>{if(o.isMesh){if(o.name.endsWith('_Handle'))handles++;else paperBounds.union(new THREE.Box3().setFromObject(o));if(o.material.map)textured++;o.geometry.dispose();o.material.map?.dispose();o.material.dispose();}});
    if(handles!==(t?2:0)||!textured)throw Error(id+' export handles/texture mismatch');
    if(!t&&Math.abs(size.z-.45)>.001)throw Error('Flat bag thickness '+size.z);
    const bodySize=paperBounds.getSize(new THREE.Vector3());if(t&&(Math.abs(bodySize.x-dimensions.length)>.6||Math.abs(bodySize.z-dimensions.depth)>2))throw Error(id+' bag footprint '+bodySize.toArray());
    results.push({preset:id,fold:t,size:size.toArray(),bodySize:bodySize.toArray(),handles,bytes:binary.byteLength});
   }
  }
  preview.dispose();preview.renderer.forceContextLoss();document.querySelector('#host').remove();return results;
 });
 assert.equal(results.length,6);await harness.screenshot({path:'artifacts/paper-bag-presets.png'});checks.push('six GLB exports reloaded: both printable surfaces, flat thickness, bag footprint, and two separate handles only in formed models');
 const offline=await browser.newPage({viewport:{width:1440,height:1000}}),requests=[];offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});offline.on('pageerror',e=>errors.push(e.message));await offline.goto(pathToFileURL(resolve('折间.html')).href);await offline.waitForSelector('html[data-ready="true"]');await choose(offline);for(const id of Object.keys(PAPER_BAG_PRESETS)){await offline.locator(`[data-bag-preset="${id}"]`).click();await fold(offline,0);await fold(offline,100);}assert.deepEqual(requests,[]);checks.push('rebuilt offline file supports all three bag presets with zero network requests');
 assert.deepEqual(errors,[]);writeFileSync('artifacts/paper-bag-verification.json',JSON.stringify({checks,results,errors},null,2));console.log(checks.join('\n'));
}finally{await browser?.close();await server.close();}
