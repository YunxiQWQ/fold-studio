import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';
const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL==='offline'?pathToFileURL(resolve('折间.html')).href:process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const directory=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/import-interactions/verified');mkdirSync(directory,{recursive:true});
const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1800,height:1100}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
const snapshot=()=>page.evaluate(()=>({mode:window.svgCanvas.getMode(),started:window.svgCanvas.getStarted(),rubber:window.svgCanvas.getRubberBox()?.getAttribute('display'),selected:window.svgCanvas.getSelectedElements().filter(Boolean).map(n=>n.id),selectors:window.svgCanvas.selectorManager.selectors.map(s=>({id:s.id,node:s.selectedElement?.id,locked:s.locked,display:s.selectorGroup.getAttribute('display')})),project:JSON.stringify(window.__foldStudio.project)}));
async function noGhosts(){
  const state=await snapshot();assert.equal(state.mode,'select',JSON.stringify(state));assert.equal(state.started,false);assert.notEqual(state.rubber,'inline');const seen=new Set();
  for(const s of state.selectors)if(s.display!=='none'){assert.ok(s.locked&&state.selected.includes(s.node),'orphan selector '+JSON.stringify(s));assert.ok(!seen.has(s.node),'duplicate selector '+s.node);seen.add(s.node);}
  const alignment=await page.evaluate(()=>window.svgCanvas.selectorManager.selectors.filter(s=>s.selectedElement&&s.selectorGroup.getAttribute('display')!=='none').map(s=>{
    const n=s.selectedElement,b=n.getBBox(),m=n.getScreenCTM(),sx=1/Math.hypot(m.a,m.b),sy=1/Math.hypot(m.c,m.d),points=[[b.x-sx,b.y-sy],[b.x+b.width+sx,b.y-sy],[b.x+b.width+sx,b.y+b.height+sy],[b.x-sx,b.y+b.height+sy]],v=s.selectorRect.getAttribute('d').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number),sm=s.selectorRect.getScreenCTM();
    return Math.max(...points.map(([x,y],i)=>{const a=new DOMPoint(x,y).matrixTransform(m),b=new DOMPoint(v[i*2],v[i*2+1]).matrixTransform(sm);return Math.hypot(a.x-b.x,a.y-b.y);}));
  }));assert.ok(alignment.every(e=>e<.6),'selector alignment error '+alignment.join(','));
}
async function marquee(box,outside=false){const host=await page.locator('#editor-host').boundingBox(),a={x:box.x-12,y:box.y-12},b=outside?{x:host.x+host.width+70,y:host.y+host.height-40}:{x:box.x+box.width+12,y:box.y+box.height+12};await page.mouse.move(a.x,a.y);await page.mouse.down();assert.equal(await page.evaluate(()=>window.svgCanvas.getMode()),'multiselect');await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();}
try{
  await page.goto(url);await ready();const project=newProject();project.name='Placed SVG gesture QA';project.layers=[];
  await page.locator('#project-input').setInputFiles({name:'placed.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>window.__foldStudio.project.name==='Placed SVG gesture QA');await ready();
  await page.locator('#image-input').setInputFiles({name:'placed.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="70" viewBox="0 0 100 70"><g id="ARTWORK"><rect id="block" x="10" y="10" width="35" height="20" fill="#417e51"/><text id="words" x="10" y="50" font-size="8">SVG 文字</text></g></svg>')});await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project.svgArtwork??{}).includes('ARTWORK'));await ready();
  const id=await page.evaluate(()=>window.svgCanvas.getSelectedElements().find(Boolean).id),object=page.locator(`[id="${id}"]`);let box=await object.boundingBox();
  await page.mouse.move(box.x+box.width*.3,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.3+22,box.y+box.height*.2+15,{steps:8});await page.mouse.up();await noGhosts();checks.push('placed SVG moves without orphan selectors');
  box=await object.boundingBox();const before=await snapshot();await marquee(box,true);await page.screenshot({path:resolve(directory,'outside-release.png')});await noGhosts();assert.equal((await snapshot()).project,before.project);checks.push('marquee released over the neighboring 3D pane ends and hides its rectangle');
  await page.locator('#tool-select').click();await marquee(await object.boundingBox());assert.ok((await snapshot()).selected.includes(id));await noGhosts();checks.push('the next marquee still selects the imported SVG');
  for(let i=0;i<4;i++){const host=await page.locator('#editor-host').boundingBox();await page.mouse.move(host.x+host.width*.5,host.y+host.height*.5);await page.mouse.wheel(0,i%2?100:-100);await noGhosts();}
  checks.push('zoom after interrupted selection leaves no moving residual frame');
  const text=page.locator('#svgcontent text'),p=await text.evaluate(n=>{const b=n.getExtentOfChar(1),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(n.getScreenCTM());return{x:p.x,y:p.y};});await page.mouse.dblclick(p.x,p.y);await page.locator('#text.is-inline').waitFor();await page.keyboard.press('Escape');
  await marquee(await object.boundingBox());assert.ok((await snapshot()).selected.length>0,'marquee after editing imported text must hit the nested artwork');await noGhosts();checks.push('marquee uses actual screen coordinates after entering nested imported SVG text');
  const stable=(await snapshot()).project;
  for(const interruption of ['wheel','cancel','blur']){
    box=await object.boundingBox();await page.mouse.move(box.x-12,box.y-12);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:4});
    if(interruption==='wheel')await page.mouse.wheel(0,-60);else if(interruption==='cancel')await page.locator('body').dispatchEvent('pointercancel',{pointerId:1});else await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await page.mouse.up();await noGhosts();await marquee(await object.boundingBox());await noGhosts();assert.ok((await snapshot()).selected.length>0);assert.equal((await snapshot()).project,stable);
  }
  checks.push('wheel, pointer cancel outside the canvas and window blur reset an active marquee without changing artwork');
  await page.locator('#tool-pan').click();const host=await page.locator('#editor-host').boundingBox();await page.mouse.move(host.x+host.width*.5,host.y+host.height*.5);await page.mouse.down();await page.mouse.move(host.x+host.width*.5+25,host.y+host.height*.5+18,{steps:6});await page.mouse.up();await page.locator('#tool-select').click();await noGhosts();assert.equal((await snapshot()).project,stable);checks.push('nested selection outlines stay aligned after panning');
  await page.evaluate(()=>window.svgCanvas.clearSelection());await page.mouse.wheel(0,80);await noGhosts();assert.equal((await snapshot()).selectors.filter(s=>s.display!=='none').length,0);checks.push('deselection followed by zoom cannot revive an old imported selection frame');
  assert.deepEqual(errors,[]);console.log({checks,errors});
}catch(error){await page.screenshot({path:resolve(directory,'failure.png')});writeFileSync(resolve(directory,'failure-state.json'),JSON.stringify(await snapshot(),null,2));throw error;}
finally{writeFileSync(resolve(directory,'report.json'),JSON.stringify({checks,errors},null,2));await browser.close();await server?.close();}
