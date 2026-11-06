import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});await server.listen();
const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const type='slotted-handle-carton',directory=process.env.FOLD_TEST_ARTIFACTS??'artifacts/slotted-handle';mkdirSync(directory,{recursive:true});
const checks=[],errors=[],page=await browser.newPage({viewport:{width:1800,height:1100},acceptDownloads:true});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
async function choose(page,type){await page.locator('#open-templates').click();await page.locator(`[data-template="${type}"]`).click();if(await page.locator('#confirm-dialog').isVisible())await page.locator('#accept-confirm').click();await page.waitForFunction(type=>window.__foldStudio.project.type===type,type);await page.locator('#editor-host[data-svg-ready="true"]').waitFor();}
async function fold(page,value){await page.locator('#fold-slider').fill(String(value));await page.locator('#fold-slider').dispatchEvent('input');await page.waitForFunction(value=>window.__foldStudio.stats.fold===value/100,value);}
async function download(button,name){const promise=page.waitForEvent('download');await page.locator(button).click();const path=resolve(directory,name);await(await promise).saveAs(path);return path;}
try{
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await ready();await choose(page,type);
  for(const [key,value]of [['length','250'],['depth','200'],['height','120']])assert.equal(await page.locator('#dim-'+key).inputValue(),value);
  assert.equal(await page.locator('#current-template-name').textContent(),'插锁提手盒');assert.equal(await page.locator('#current-template-art img').getAttribute('width'),'384');
  await page.locator('#open-templates').click();assert.equal(await page.locator('.template-card').count(),33);await page.keyboard.press('Escape');
  assert.match(await page.locator('#dim-height').locator('..').textContent(),/身高/);assert.equal(await page.locator('#extra-dimensions input[type="number"]').count(),7);
  const builds=await page.evaluate(()=>window.__foldStudio.stats.geometryBuilds);for(const value of [0,20,45,70,100,40,0,100])await fold(page,value);assert.equal(await page.evaluate(()=>window.__foldStudio.stats.geometryBuilds),builds);
  checks.push('33 library entries, actual model thumbnail, seven structural controls and reversible folding without geometry rebuilds');
  const angle=page.locator('input[type="number"][data-extra-dim="sideFlapAngle"]');await angle.fill('45');await angle.dispatchEvent('change');await page.waitForFunction(()=>window.__foldStudio.geometry.slottedHandle.angle===45);assert.match(await page.locator('#val-sideFlapAngle').textContent(),/45 °/);
  await page.locator('#undo').click();await ready();assert.equal(await angle.inputValue(),'38');
  const width=page.locator('input[type="number"][data-extra-dim="handleWidth"]');await width.fill('100');await width.dispatchEvent('change');await page.waitForFunction(()=>window.__foldStudio.geometry.slottedHandle.handleWidth===100);await page.locator('#undo').click();await ready();assert.equal(await width.inputValue(),'112');
  checks.push('side-wing angles display degrees; handle-hole dimensions and undo restore the actual geometry');
  for(const side of ['outside','inside']){
    await page.locator('#side-'+side).click();await ready();await page.locator('#add-text').click();await page.locator('#node-text').fill('手提盒 '+side);await page.locator('#node-text').blur();await page.waitForFunction(text=>JSON.stringify(window.__foldStudio.project.svgArtwork).includes(text),'手提盒 '+side);
  }
  await page.locator('#side-outside').click();await ready();await page.locator('#export-toggle').click();const svgPath=await download('#export-svg','slotted-handle.svg');
  const svg=readFileSync(svgPath,'utf8');assert.ok(svg.includes('slotted-handle-carton'));assert.ok(svg.includes('front-handle'));assert.ok(svg.includes('left-lock-wing'));
  const projectPath=await download('#save-project','slotted-handle.fold'),saved=JSON.parse(readFileSync(projectPath,'utf8'));assert.equal(saved.type,type);assert.ok(JSON.stringify(saved.svgArtwork).includes('手提盒 inside'));
  await choose(page,'carton');await page.locator('#project-input').setInputFiles(projectPath);await page.waitForFunction(()=>window.__foldStudio.project.type==='slotted-handle-carton');await ready();assert.equal(await page.locator('#dim-length').inputValue(),String(saved.dimensions.length));
  checks.push('both print sides remain editable and native SVG plus .fold exports preserve the new construction and artwork');
  const pngs=[];
  for(const side of ['outside','inside']){
    await page.locator('#side-'+side).click();await ready();await page.locator('#export-toggle').click();await page.locator('#export-flat').click();await page.locator('#flat-include-lines').uncheck();const path=await download('#confirm-export-flat','slotted-handle-'+side+'.png');
    const pixels=await page.evaluate(async({base64,side})=>{
      const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const d=window.__foldStudio.geometry,scale=3072/Math.max(d.width,d.height),alphas=[];
      for(const p of d.panels.filter(p=>p.holes)){const h=p.holes[0],x=h.reduce((n,p)=>n+p[0],0)/h.length,y=h.reduce((n,p)=>n+p[1],0)/h.length,px=Math.floor((side==='inside'?d.maxX-x:x-d.minX)*scale),py=Math.floor((y-d.minY)*scale);alphas.push(ctx.getImageData(px,py,1,1).data[3]);}return {width:c.width,height:c.height,alphas};
    },{base64:readFileSync(path).toString('base64'),side});assert.deepEqual(pixels.alphas,[0,0,0,0]);assert.equal(Math.max(pixels.width,pixels.height),3072);pngs.push({side,...pixels});
  }
  await page.locator('#side-outside').click();await ready();checks.push('actual flat PNG downloads on both surfaces preserve transparency in both handles and both wing slots');
  await page.locator('#fit-3d').click();await page.waitForTimeout(500);await page.screenshot({path:resolve(directory,'workspace.png')});
  const glbs=await page.evaluate(async()=>{
    const [{exportGLB},{ImageCache},{GLTFLoader},THREE,{foldMatrices}]=await Promise.all([import('/src/export3d.js'),import('/src/artwork.js'),import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),import('/node_modules/three/build/three.module.js'),import('/src/folding.js')]);
    const project=window.__foldStudio.project,d=window.__foldStudio.geometry,root=d.panels.find(p=>p.id===d.rootId),cx=root.x+root.w/2,cy=root.y+root.h/2,results=[];
    for(const progress of [0,.5,1]){
      const binary=await exportGLB(project,d,new ImageCache(),{fold:progress,resolution:1024}),loaded=await new GLTFLoader().parseAsync(binary,'');loaded.scene.updateMatrixWorld(true);
      const size=new THREE.Box3().setFromObject(loaded.scene,true).getSize(new THREE.Vector3()),matrices=foldMatrices(d,progress,cx,cy);let textured=0,holeChecks=0;
      for(const id of ['front-handle','back-handle','left-lock-wing','right-lock-wing']){
        const panel=d.panels.find(p=>p.id===id),hole=panel.holes[0],x=hole.reduce((s,q)=>s+q[0],0)/hole.length,y=hole.reduce((s,q)=>s+q[1],0)/hole.length,center=new THREE.Vector3(x-cx,cy-y,0).applyMatrix4(matrices.get(id)),normal=new THREE.Vector3(0,0,1).transformDirection(matrices.get(id)),object=loaded.scene.getObjectByName(panel.label+'_'+id);
        if(!object)throw Error('Missing GLB panel '+id);const ray=new THREE.Raycaster(center.clone().addScaledVector(normal,4),normal.negate());if(ray.intersectObject(object,true).length)throw Error('Export filled hole '+id);holeChecks++;
      }
      if(progress===0&&Math.abs(size.z-.45)>.002)throw Error('Flat GLB is not a single sheet: '+size.toArray());
      if(progress===1)for(const [i,expected]of [d.slottedHandle.L,d.slottedHandle.totalHeight,d.slottedHandle.D].entries())if(Math.abs(size.toArray()[i]-expected)>1.6)throw Error('Wrong formed envelope: '+size.toArray());
      const disposed=new Set();loaded.scene.traverse(o=>{if(o.isMesh){if(o.material.map)textured++;o.geometry.dispose();if(!disposed.has(o.material)){disposed.add(o.material);o.material.map?.dispose();o.material.dispose();}}});if(!textured)throw Error('No GLB artwork');results.push({fold:progress,bytes:binary.byteLength,size:size.toArray(),textured,holeChecks});
    }return results;
  });assert.equal(glbs.length,3);checks.push('flat, half-folded and closed GLBs reload with both-side textures, correct dimensions and all four real openings');
  const offline=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true}),requests=[];offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});offline.on('pageerror',e=>errors.push(e.message));await offline.goto(pathToFileURL(resolve('折间.html')).href);await offline.locator('#editor-host[data-svg-ready="true"]').waitFor();await choose(offline,type);await fold(offline,0);await fold(offline,100);assert.deepEqual(requests,[]);await offline.close();checks.push('rebuilt standalone HTML opens the new construction and folds with zero HTTP requests');
  assert.deepEqual(errors,[]);writeFileSync(resolve(directory,'report.json'),JSON.stringify({checks,pngs,glbs,errors},null,2));console.log(checks.join('\n'));
}catch(error){console.log({checks,errors});await page.screenshot({path:resolve(directory,'failure.png')});throw error;}
finally{await browser.close();await server.close();}
