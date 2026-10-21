import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const artifacts=resolve('artifacts');mkdirSync(artifacts,{recursive:true});
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
const url=`http://127.0.0.1:${server.httpServer.address().port}`;
const installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
let browser;const checks=[],errors=[];
async function choose(page){
  await page.locator('#open-templates').click();await page.locator('[data-template="curved-twist-carton"]').click();
  if(await page.locator('#confirm-dialog').isVisible())await page.locator('#accept-confirm').click();
  await page.waitForFunction(()=>window.__foldStudio.stats?.modelType==='curved-twist-carton');
}
async function fold(page,value){
  await page.locator('#fold-slider').fill(String(value));await page.locator('#fold-slider').dispatchEvent('input');
  await page.waitForFunction(f=>window.__foldStudio.stats.fold===f,value/100);
}
try{
  browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1700,height:1020},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');await choose(page);
  assert.equal(await page.locator('#sheet-size').textContent(),'333 × 352 mm');
  assert.deepEqual(await page.evaluate(()=>window.__foldStudio.project.dimensions),{length:80,depth:80,height:160});
  checks.push('library selection, real model thumbnail, 80 × 80 × 160 mm and reference flap arrangement');
  const before=await page.evaluate(()=>window.__foldStudio.stats);
  for(const t of [0,25,55,78,100]){await fold(page,t);await page.locator('#fit-3d').click();}
  const after=await page.evaluate(()=>window.__foldStudio.stats);
  assert.equal(after.geometryBuilds,before.geometryBuilds);assert.equal(after.textureUpdates,before.textureUpdates);
  checks.push('five fold states update deformed meshes without geometry rebuilds or texture uploads');
  await page.screenshot({path:resolve(artifacts,'curved-carton-workspace.png')});
  await page.locator('#panel-selector').selectOption('shoulder-3');await page.locator('#inspect-panel').click();
  const canvas=page.locator('[data-testid="preview-canvas"]');const bounds=await canvas.boundingBox();
  await canvas.click({position:{x:bounds.width/2,y:bounds.height/2}});
  assert.equal((await page.evaluate(()=>window.__foldStudio.selection)).panelId,'shoulder-3');
  await page.locator('#inspect-panel').click();checks.push('folded upper curved face can be inspected and selected by pointer');
  await page.locator('[data-side="inside"]').click();await page.locator('#panel-selector').selectOption('front');
  await page.locator('#inspect-panel').click();await canvas.click({position:{x:bounds.width/2,y:bounds.height/2}});
  assert.equal((await page.evaluate(()=>window.__foldStudio.selection)).side,'inside');
  await page.locator('#inspect-panel').click();await page.locator('[data-side="outside"]').click();
  checks.push('independent inside surface and folded skin picking');
  await page.locator('#dim-length').fill('90');await page.locator('#dim-length').dispatchEvent('input');await page.locator('#dim-length').dispatchEvent('change');
  await page.waitForFunction(()=>window.__foldStudio.project.dimensions.depth===90);
  await page.locator('#dim-depth').fill('80');await page.locator('#dim-depth').dispatchEvent('input');await page.locator('#dim-depth').dispatchEvent('change');
  await page.waitForFunction(()=>window.__foldStudio.project.dimensions.length===80);
  checks.push('square side dimensions stay linked in both directions');
  await page.locator('#export-toggle').click();const svgDownload=page.waitForEvent('download');await page.locator('#export-svg').click();
  const svgPath=resolve(artifacts,'curved-carton-export.svg');await(await svgDownload).saveAs(svgPath);
  const svg=readFileSync(svgPath,'utf8');assert.equal((svg.match(/data-crease="arc-/g)??[]).length,8);
  assert.equal((svg.match(/data-crease="arc-[^"]+" d="[^"]*Q/g)??[]).length,8);
  checks.push('SVG preserves eight quadratic vector scores and round-trips project metadata');
  await page.locator('#export-toggle').click();await page.locator('#export-glb').click();
  await page.locator('input[name="glb-fold"][value="closed"]').check();
  const glbDownload=page.waitForEvent('download');await page.locator('#confirm-export-glb').click();
  const glbPath=resolve(artifacts,'curved-carton-closed.glb');await(await glbDownload).saveAs(glbPath);
  const buf=readFileSync(glbPath);assert.equal(buf.readUInt32LE(0),0x46546c67);
  const json=JSON.parse(buf.subarray(20,20+buf.readUInt32LE(12)).toString('utf8'));
  assert.ok(json.meshes.length>=19);assert.equal(json.images.length,2);
  assert.ok(json.accessors.some(a=>a.type==='VEC3'&&a.count>300));
  const frontNode=json.nodes.find(n=>n.name?.endsWith('_front'));
  const frontPosition=json.accessors[json.meshes[frontNode.mesh].primitives[0].attributes.POSITION];
  assert.ok(frontPosition.max[2]-frontPosition.min[2]>10,'GLB must contain the deformed body, not a flat sheet');
  await page.locator('#export-toggle').click();await page.locator('#export-glb').click();
  await page.locator('input[name="glb-fold"][value="flat"]').check();
  const flatDownload=page.waitForEvent('download');await page.locator('#confirm-export-glb').click();
  const flatPath=resolve(artifacts,'curved-carton-flat.glb');await(await flatDownload).saveAs(flatPath);
  const flatBuf=readFileSync(flatPath),flatJSON=JSON.parse(flatBuf.subarray(20,20+flatBuf.readUInt32LE(12)).toString('utf8'));
  const flatNode=flatJSON.nodes.find(n=>n.name?.endsWith('_front'));
  const flatPosition=flatJSON.accessors[flatJSON.meshes[flatNode.mesh].primitives[0].attributes.POSITION];
  assert.ok(Math.abs(flatPosition.max[2]-flatPosition.min[2]-.45)<1e-4,'flat GLB retains only paper thickness in Z');
  checks.push('closed and flat GLBs contain correct deformed/planar vertices, caps and both embedded artwork textures');
  await page.locator('#project-input').setInputFiles(svgPath);
  await page.waitForFunction(()=>window.__foldStudio.geometry.extraCreases.length===10);
  // Large, uncluttered review image with the source arrangement and actual 3D mesh.
  const review=await browser.newPage({viewport:{width:1450,height:920}});
  await review.route('**/curve-review',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await review.goto(url+'/curve-review');
  await review.evaluate(async()=>{
    const [{Preview3D},{ImageCache},{makeDieline,BOX_TYPES,creasePaths,cutSegments},{newProject}]=await Promise.all([import('/src/preview3d.js'),import('/src/artwork.js'),import('/src/geometry.js'),import('/src/project.js')]);
    document.body.style='margin:0;background:#faf8f4;font:18px sans-serif;color:#342c25';
    document.body.innerHTML='<h1 style="margin:34px 44px 6px;font-size:28px">弧线扭转盒</h1><p style="margin:0 44px;color:#776a5c">80 × 80 × 160 mm · 八条弧形压痕 · 上下反向插盖</p><div style="display:flex;gap:12px;margin:20px 32px"><div><canvas id="flat" width="700" height="740"></canvas></div><div id="model" style="width:650px;height:740px"></div></div>';
    const project=newProject('curved-twist-carton');project.layers=[];project.paper='#e88b39';project.insidePaper='#eedbbb';
    const d=makeDieline(project.type,project.dimensions),canvas=document.querySelector('#flat'),ctx=canvas.getContext('2d'),s=1.9,ox=28,oy=25;
    ctx.setTransform(s,0,0,s,ox,oy);ctx.fillStyle='#f3e9d7';
    for(const p of d.panels){ctx.beginPath();p.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
    ctx.beginPath();for(const [a,b]of cutSegments(d)){ctx.moveTo(...a);ctx.lineTo(...b);}ctx.strokeStyle='#3d342b';ctx.lineWidth=.65;ctx.stroke();
    ctx.beginPath();for(const {points}of creasePaths(d))points.forEach((pt,i)=>i?ctx.lineTo(...pt):ctx.moveTo(...pt));ctx.strokeStyle='#527662';ctx.lineWidth=.65;ctx.setLineDash([3,2]);ctx.stroke();ctx.setLineDash([]);
    ctx.setTransform(1,0,0,1,0,0);ctx.font='16px sans-serif';ctx.fillStyle='#776a5c';ctx.textAlign='center';ctx.fillText('展开：333 × 352 mm',350,735);
    const preview=new Preview3D(document.querySelector('#model'),new ImageCache(),()=>{},()=>{});preview.setQuality('crisp');preview.build(project,d);preview.renderer.toneMappingExposure=.88;preview.fit();preview.render();window.reviewPreview=preview;
  });
  await review.screenshot({path:resolve(artifacts,'curved-carton-review.png')});await review.close();
  const offline=await browser.newPage({viewport:{width:1500,height:960}}),requests=[];
  offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});offline.on('pageerror',e=>errors.push(e.message));
  await offline.goto(pathToFileURL(resolve('折间.html')).href);await offline.waitForSelector('html[data-ready="true"]');await choose(offline);
  await fold(offline,45);await fold(offline,100);assert.deepEqual(requests,[]);
  checks.push('rebuilt offline HTML works with no HTTP or external requests');
  assert.deepEqual(errors,[]);writeFileSync(resolve(artifacts,'curved-carton-verification.json'),JSON.stringify({checks,errors,glbBytes:buf.length},null,2));
  console.log(checks.join('\n'));
}finally{await browser?.close();await server.close();}
