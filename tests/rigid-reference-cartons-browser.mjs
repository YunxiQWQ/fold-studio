import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const projectRoot=fileURLToPath(new URL('..',import.meta.url));
const types=['candy-twist-carton','triangle-slice-box'];
const server=await createServer({root:projectRoot,server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
const url=`http://127.0.0.1:${server.httpServer.address().port}`,installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const artifacts=resolve(projectRoot,'artifacts');mkdirSync(artifacts,{recursive:true});let browser;const errors=[],checks=[];
async function choose(page,type){await page.locator('#open-templates').click();await page.locator(`[data-template="${type}"]`).click();if(await page.locator('#confirm-dialog').isVisible())await page.locator('#accept-confirm').click();await page.waitForFunction(t=>window.__foldStudio.stats.modelType===t,type);}
async function fold(page,value){await page.locator('#fold-slider').fill(String(value));await page.locator('#fold-slider').dispatchEvent('input');await page.waitForFunction(t=>window.__foldStudio.stats.fold===t,value/100);}
try{
  browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1600,height:1050},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');
  await page.locator('#open-templates').click();assert.equal(await page.locator('.template-card').count(),32);assert.equal(await page.locator('[data-template="petal-pyramid-carton"]').count(),0);await page.keyboard.press('Escape');
  for(const type of types){
    await choose(page,type);const before=await page.evaluate(()=>window.__foldStudio.stats);
    for(const progress of [0,45,78,100])await fold(page,progress);
    const after=await page.evaluate(()=>window.__foldStudio.stats);assert.equal(after.geometryBuilds,before.geometryBuilds);assert.equal(after.textureUpdates,before.textureUpdates);
    const printPanel=await page.evaluate(()=>window.__foldStudio.project.layers[0]?.panel??'front');
    for(const side of ['inside','outside']){
      await page.locator(`[data-side="${side}"]`).click();await page.locator('#panel-selector').selectOption(printPanel);await page.locator('#inspect-panel').click();
      const canvas=page.locator('[data-testid="preview-canvas"]'),box=await canvas.boundingBox();await canvas.click({position:{x:box.width/2,y:box.height/2}});
      const selection=await page.evaluate(()=>window.__foldStudio.selection);assert.equal(selection.panelId,printPanel);assert.equal(selection.side,side);await page.locator('#inspect-panel').click();
    }
    const extra={ 'candy-twist-carton':['tailLength','28',22], 'triangle-slice-box':['lockTab','16',12] }[type];
    const input=page.locator(`input[type="number"][data-extra-dim="${extra[0]}"]`);await input.fill(extra[1]);await input.dispatchEvent('change');await page.waitForFunction(([key,value])=>window.__foldStudio.project.dimensions[key]===value,[extra[0],+extra[1]]);
    await page.locator('#undo').click();await page.waitForFunction(([key,value])=>window.__foldStudio.project.dimensions[key]===value,[extra[0],extra[2]]);
    await page.locator('#add-text').click();await page.locator('#prop-text').fill('新增参考结构实测');await page.locator('#prop-text').dispatchEvent('input');
    await page.locator('#export-toggle').click();const download=page.waitForEvent('download');await page.locator('#export-svg').click();const file=resolve(artifacts,type+'-export.svg');await(await download).saveAs(file);
    await page.locator('#project-input').setInputFiles(file);await page.waitForFunction(t=>window.__foldStudio.project.type===t,type);assert.ok(await page.evaluate(()=>window.__foldStudio.project.layers.some(l=>l.text==='新增参考结构实测')));
    await page.locator('#fit-3d').click();await page.waitForTimeout(400);await page.screenshot({path:resolve(artifacts,type+'-workspace.png')});
  }
  checks.push('32 library entries; two new reference constructions fold without rebuilding geometry or repainting textures; inside/outside picking, custom dimensions, undo and SVG project round trips');
  const harness=await browser.newPage({viewport:{width:1500,height:900}});harness.on('pageerror',e=>errors.push(e.message));
  await harness.route('**/rigid-reference-harness',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await harness.goto(url+'/rigid-reference-harness');
  const results=await harness.evaluate(async types=>{
    const [{exportGLB},{BOX_TYPES,makeDieline},{newProject,validateProject},{ImageCache},{GLTFLoader},THREE]=await Promise.all([import('/src/export3d.js'),import('/src/geometry.js'),import('/src/project.js'),import('/src/artwork.js'),import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),import('/node_modules/three/build/three.module.js')]);
    const expected={
      'candy-twist-carton':p=>[p.dimensions.length+2*p.dimensions.tailLength,p.dimensions.depth,p.dimensions.height],
      'triangle-slice-box':p=>[p.dimensions.length,p.dimensions.height,p.dimensions.depth+.8],
    };
    const results=[];
    for(const type of types){
      const p=newProject(type),d=makeDieline(type,p.dimensions);validateProject(JSON.parse(JSON.stringify(p)));
      for(const fold of [0,1]){
        const binary=await exportGLB(p,d,new ImageCache(),{fold,resolution:1024}),loaded=await new GLTFLoader().parseAsync(binary,''),size=new THREE.Box3().setFromObject(loaded.scene,true).getSize(new THREE.Vector3());
        if(!fold){const thickness=BOX_TYPES[type].family==='tray'?size.y:size.z;if(Math.abs(thickness-.45)>.001)throw Error(type+' flat export thickness '+thickness);}
        else{const target=expected[type](p);size.toArray().forEach((actual,i)=>{if(Math.abs(actual-target[i])>1)throw Error(type+' exported bounds '+size.toArray()+' expected '+target);});}
        let meshes=0,textured=0;loaded.scene.traverse(o=>{if(o.isMesh){meshes++;if(o.material.map)textured++;o.geometry.dispose();o.material.map?.dispose();o.material.dispose();}});if(!meshes||!textured)throw Error('Missing meshes or artwork in '+type);
        results.push({type,fold,size:size.toArray(),meshes,bytes:binary.byteLength});
      }
    }
    return results;
  },types);
  assert.equal(results.length,4);checks.push('four reloaded GLBs: flat paper thickness, closed envelopes, real meshes and embedded inside/outside artwork textures');
  const retiredId=await page.evaluate(async()=>{
    const {createDocument}=await import('/src/project-library-storage.js');
    const old=window.__foldStudio.project;old.type='petal-pyramid-carton';old.name='Retired experimental project';
    return createDocument(old);
  });
  await page.reload();await page.waitForSelector('html[data-ready="true"]');
  assert.equal(await page.evaluate(()=>window.__foldStudio.project.type),'carton');
  const preserved=await page.evaluate(async id=>{const {getDocument}=await import('/src/project-library-storage.js');return (await getDocument(id))?.type;},retiredId);
  assert.equal(preserved,'petal-pyramid-carton');
  checks.push('removed model is absent from the library; an active retired project opens a valid new document while preserving its original stored record');
  writeFileSync(resolve(artifacts,'rigid-reference-cartons-verification.json'),JSON.stringify({checks,results,errors},null,2));
  assert.deepEqual(errors,[]);console.log(checks.join('\n'));
}finally{await browser?.close();await server.close();}
