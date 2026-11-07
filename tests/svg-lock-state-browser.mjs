import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';
import {makeDieline} from '../src/geometry.js';
const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL==='offline'?pathToFileURL(resolve('折间.html')).href:process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const directory=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/lock-state/verified');mkdirSync(directory,{recursive:true});
const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1800,height:1100}}),errors=[],results=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
const el=(tag,attrs={},children=[])=>({tag,attrs:Object.fromEntries(Object.entries(attrs).map(([key,value])=>[key,String(value)])),children});
let image,sequence=0;
const target=()=>page.locator('#svgcontent #target'),lock=id=>page.locator(`[data-lock-node="${id}"]`),ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
async function fixture({locked=true,parent=false,ownLocked=false,shape=false}={}){
  const project=newProject(),d=makeDieline(project.type,project.dimensions),p=d.panels.find(p=>p.id===d.rootId);project.name='Lock state '+sequence++;project.layers=[];
  const node=el(shape?'rect':'image',{id:'target',x:p.x+20,y:p.y+30,width:30,height:20,...(shape?{fill:'#a24f6e'}:{href:image}),...((parent?ownLocked:locked)?{'data-locked':'true'}:{})});
  project.svgArtwork={outside:{viewBox:[d.minX,d.minY,d.width,d.height],nodes:[parent?el('g',{id:'parent',...(locked?{'data-locked':'true'}:{})},[node]):node]}};
  await page.locator('#project-input').setInputFiles({name:'lock.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(name=>window.__foldStudio.project.name===name,project.name);await ready();
  await page.locator('#expand-layers').click();return project;
}
async function move(dx=25,dy=15){const box=await target().boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:7});await page.mouse.up();return {before:box,after:await target().boundingBox()};}
function moved(result,dx=25,dy=15){assert.ok(Math.abs(result.after.x-result.before.x-dx)<1&&Math.abs(result.after.y-result.before.y-dy)<1,'unlocked artwork must move immediately without resizing first');}
async function immovable(){const result=await move();assert.ok(Math.abs(result.after.x-result.before.x)<.1&&Math.abs(result.after.y-result.before.y)<.1,'locked artwork moved');}
async function check(name,run){try{await run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message,style:await target().getAttribute('style')});await page.screenshot({path:resolve(directory,name+'-failure.png')});}}
try{
  await page.goto(url);await ready();image=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=90;canvas.height=60;const ctx=canvas.getContext('2d');ctx.fillStyle='#477b54';ctx.fillRect(0,0,90,60);ctx.fillStyle='#e5dba6';ctx.fillRect(20,10,50,40);return canvas.toDataURL('image/png');});
  for(const shape of [false,true])await check(shape?'shape-immediate-unlock':'image-immediate-unlock',async()=>{
    await fixture({shape});await immovable();await lock('target').click();assert.equal(await lock('target').getAttribute('aria-pressed'),'false');assert.notEqual(await target().evaluate(n=>getComputedStyle(n).pointerEvents),'none','UI is unlocked but the DOM still blocks pointer hits');moved(await move());
  });
  await check('repeat-lock-unlock',async()=>{
    await fixture({locked:false});for(let index=0;index<4;index++){await lock('target').click();await immovable();await lock('target').click();moved(await move(10,6),10,6);}
  });
  await check('parent-unlock-restores-child',async()=>{
    await fixture({parent:true});assert.equal(await lock('target').isDisabled(),true);await lock('parent').click();assert.equal(await lock('target').isDisabled(),false);assert.equal(await lock('target').getAttribute('aria-pressed'),'false');moved(await move());
  });
  await check('own-lock-survives-parent-unlock',async()=>{
    await fixture({parent:true,ownLocked:true});await lock('parent').click();assert.equal(await lock('target').getAttribute('aria-pressed'),'true');await immovable();await lock('target').click();moved(await move());
  });
  await check('unlock-via-layer-context-menu',async()=>{
    await fixture();await page.locator('[data-node-id="target"]').click({button:'right'});await page.locator('#layer-context-menu [data-layer-command="lock"]').click();moved(await move());
  });
  await check('lock-history-and-project-reopen',async()=>{
    await fixture({locked:false});await lock('target').click();await page.locator('#undo').click();await ready();moved(await move());await page.locator('#undo').click();await ready();await page.locator('#redo').click();await ready();moved(await move());
    await lock('target').click();const project=await page.evaluate(()=>{window.__foldStudio.nativeEditor.flush();return window.__foldStudio.project;});project.name+=' reopened';await page.locator('#project-input').setInputFiles({name:'reopen.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(name=>window.__foldStudio.project.name===name,project.name);await ready();await immovable();await lock('target').click();moved(await move());
  });
  await check('cmyk-image-unlock',async()=>{
    await fixture();await page.locator('#print-settings').click();await page.locator('#print-document-mode').selectOption('cmyk');await page.locator('#apply-print-settings').click();await page.waitForFunction(()=>document.querySelector('#editor-host').dataset.proofReady==='true');await lock('target').click();moved(await move());
    const source=await page.evaluate(()=>window.__foldStudio.nativeEditor.source());assert.ok(!source.includes('pointer-events'),'editor lock hit-testing must not be serialized into the editable SVG');
  });
  console.log(JSON.stringify({results,errors}));assert.ok(results.every(row=>row.passed),'lock state regressions');assert.deepEqual(errors,[]);
}finally{writeFileSync(resolve(directory,'report.json'),JSON.stringify({results,errors},null,2));await browser.close();await server?.close();}
