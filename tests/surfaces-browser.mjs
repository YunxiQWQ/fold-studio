import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const artifacts=resolve('artifacts');mkdirSync(artifacts,{recursive:true});
const port=await new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const server=spawn(process.execPath,['server.mjs','--port',String(port)],{stdio:'pipe'});
const url=`http://127.0.0.1:${port}`;let browser,a,b,c;const errors=[],checks=[];
const ready=async page=>{await page.waitForSelector('html[data-ready="true"]');await page.waitForFunction(()=>window.__foldStudio?.stats?.triangles>0);};
const layers=async page=>page.evaluate(()=>window.__foldStudio.project.layers);
const waitPaint=async page=>page.waitForTimeout(120);
async function paste(page,inPlace=false){await page.bringToFront();await page.keyboard.press(inPlace?'Control+Shift+V':'Control+V');await waitPaint(page);}
try{
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
  browser=await chromium.launch({headless:true,...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
  const context=await browser.newContext({viewport:{width:1600,height:1000},permissions:['clipboard-read','clipboard-write']});
  const makePage=async address=>{const p=await context.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await p.goto(address);await ready(p);return p;};
  a=await makePage(url);b=await makePage(url);
  await a.bringToFront();await a.locator('[data-select]').filter({hasText:'品牌名称'}).click();await a.keyboard.press('Control+C');
  await b.bringToFront();const clip=await b.evaluate(()=>navigator.clipboard.readText());assert.ok(clip.startsWith('FOLD_STUDIO_LAYERS_V1\n'),'Copy must write to the operating system clipboard');
  const outsideBefore=await layers(b);await b.locator('#side-inside').click();assert.equal(await b.locator('[data-select]').count(),0);
  const texturesBefore=await b.evaluate(()=>window.__foldStudio.stats.sideTextureUpdates);
  await paste(b);let inside=(await layers(b)).filter(l=>l.side==='inside');assert.equal(inside.length,1);assert.equal(inside[0].text,'山野之间');
  assert.deepEqual((await layers(b)).filter(l=>l.side==='outside'),outsideBefore);
  assert.equal(await b.evaluate(()=>window.__foldStudio.stats.sideTextureUpdates.outside),texturesBefore.outside,'Inside edits must not update the outside atlas');
  checks.push('real system clipboard between two pages','inside paste does not alter outside layers or texture');

  await b.locator('#prop-text').fill('INSIDE\n内面图案');await b.locator('#prop-text').blur();
  await b.locator('#layer-color').fill('#315f9e');await b.locator('#layer-color').dispatchEvent('input');await b.locator('#layer-color').dispatchEvent('change');
  await b.locator('#paper-color').fill('#e4edfa');await b.locator('#paper-color').dispatchEvent('input');await b.locator('#paper-color').dispatchEvent('change');
  const beforeDrag=(await layers(b)).find(l=>l.side==='inside');
  const drag=await b.evaluate(()=>{const app=window.__foldStudio,p=app.geometry.panels.find(p=>p.id===app.selection.panelId),l=app.project.layers.find(l=>l.id===app.selection.selected),v=app.view;const wx=p.x+(1-l.x)*p.w;return{x:v.x+(app.geometry.minX+app.geometry.maxX-wx)*v.scale,y:v.y+(p.y+l.y*p.h)*v.scale};});
  const box=await b.locator('[data-testid="editor-canvas"]').boundingBox();
  await b.mouse.move(box.x+drag.x,box.y+drag.y);await b.mouse.down();await b.mouse.move(box.x+drag.x+17,box.y+drag.y+9,{steps:10});await b.mouse.up();
  assert.ok((await layers(b)).find(l=>l.side==='inside').x>beforeDrag.x,'Inside drag right must move right in the editing view');
  await b.locator('#inspect-surface').click();await waitPaint(b);
  await b.screenshot({path:resolve(artifacts,'07-inside-editing.png'),fullPage:true});
  const positions=await b.evaluate(()=>{const a=window.__foldStudio,p=a.geometry.panels.find(p=>p.id===a.selection.panelId),l=a.project.layers.find(l=>l.id===a.selection.selected),v=a.view;return{view:v,panel:p,layer:l,extent:a.geometry.minX+a.geometry.maxX};});
  const handleX=positions.view.x+(positions.extent-(positions.panel.x+(1-positions.layer.x)*positions.panel.w-positions.layer.w*positions.panel.w/2))*positions.view.scale;
  const handleY=positions.view.y+(positions.panel.y+positions.layer.y*positions.panel.h+positions.layer.h*positions.panel.h/2)*positions.view.scale;
  const beforeWidth=positions.layer.w;
  await b.mouse.move(box.x+handleX,box.y+handleY);await b.mouse.down();await b.mouse.move(box.x+handleX+12,box.y+handleY+6,{steps:6});await b.mouse.up();
  assert.ok((await layers(b)).find(l=>l.side==='inside').w>beforeWidth,'Inside resize handle must enlarge in the correct direction');
  checks.push('independent inside paper color','inside text drawing, hit test, drag and resize');

  await b.locator('#side-outside').click();assert.equal(await b.locator('#paper-color').inputValue(),'#f3f0df');assert.equal(await b.locator('[data-select]').count(),8);
  await b.locator('#side-inside').click();await b.locator('[data-select]').click();await b.keyboard.press('Control+C');
  const original=JSON.parse((await b.evaluate(()=>navigator.clipboard.readText())).split('\n').slice(1).join('\n')).layers[0];
  await paste(b,true);inside=(await layers(b)).filter(l=>l.side==='inside');assert.equal(inside.length,2);assert.equal(inside[1].x,original.x);assert.equal(inside[1].y,original.y);
  await b.locator('#layer-side').selectOption('outside');assert.equal(await b.evaluate(()=>window.__foldStudio.selection.side),'outside');
  await b.locator('#undo').click();assert.equal((await layers(b)).filter(l=>l.side==='inside').length,2);
  checks.push('surface switching preserves artwork','paste in place','move layer between sides and undo');

  await a.bringToFront();
  const image=Buffer.from(await a.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=60;const x=c.getContext('2d');x.fillStyle='#d8aa6d';x.fillRect(0,0,100,60);x.fillStyle='#6c8553';x.fillRect(10,10,40,40);return c.toDataURL().split(',')[1];}),'base64');
  await a.locator('#image-input').setInputFiles({name:'clipboard-image.png',mimeType:'image/png',buffer:image});await a.waitForFunction(()=>window.__foldStudio.project.layers.some(l=>l.type==='image'));
  await a.locator('[data-select]').filter({hasText:'clipboard-image.png'}).click();const sourceImage=(await layers(a)).find(l=>l.type==='image');
  await a.keyboard.press('Control+X');assert.equal((await layers(a)).some(l=>l.id===sourceImage.id),false);
  await b.bringToFront();await b.locator('#open-templates').click();await b.waitForSelector('#templates-dialog[open]');await b.locator('#box-templates button[data-template="tray"]').click();await b.locator('#accept-confirm').click();await b.locator('#templates-dialog').waitFor({state:'hidden'});await b.locator('#side-inside').click();
  await paste(b);const targetImage=(await layers(b)).find(l=>l.type==='image');assert.ok(targetImage);assert.equal(targetImage.panel,'base');assert.equal(targetImage.side,'inside');assert.equal(targetImage.src,sourceImage.src);assert.ok(Math.abs(targetImage.w*170-sourceImage.w*110)<1e-7);
  checks.push('cut and paste image across pages and box templates with image bytes and physical width retained');

  await b.locator('[data-select]').filter({hasText:'clipboard-image.png'}).click();await b.keyboard.press('Control+C');
  c=await makePage(pathToFileURL(resolve('折间.html')).href);await c.locator('#side-inside').click();await paste(c);
  assert.equal((await layers(c)).find(l=>l.type==='image').src,sourceImage.src);checks.push('HTTP page clipboard to offline file page');
  await c.locator('[data-select]').filter({hasText:'clipboard-image.png'}).click();await c.keyboard.press('Control+C');
  await a.bringToFront();await a.locator('#side-inside').click();await paste(a);assert.equal((await layers(a)).find(l=>l.type==='image').side,'inside');checks.push('offline file clipboard back to HTTP page');

  await a.locator('#add-text').click();await a.locator('#prop-text').fill('来自网页的普通文字');await a.locator('#prop-text').focus();await a.keyboard.press('Control+A');await a.keyboard.press('Control+C');
  await b.bringToFront();await b.locator('#side-outside').click();await paste(b);assert.ok((await layers(b)).some(l=>l.text==='来自网页的普通文字'&&l.side==='outside'));
  const countBefore=(await layers(b)).length;await b.locator('#prop-text').focus();await b.keyboard.press('Control+A');await b.keyboard.press('Control+V');assert.equal((await layers(b)).length,countBefore);checks.push('ordinary text paste','native textarea copy and paste remains intact');
  await b.locator('#side-inside').click();await b.locator('[data-select]').click();await b.keyboard.press('Control+C');
  // A native image ClipboardItem from another application is also accepted.
  await b.evaluate(async()=>{const c=document.createElement('canvas');c.width=25;c.height=25;c.getContext('2d').fillRect(0,0,25,25);const blob=await new Promise(r=>c.toBlob(r));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);});
  await paste(b);assert.equal((await layers(b)).filter(l=>l.type==='image'&&l.side==='inside').length,2);checks.push('native image clipboard paste');

  await b.locator('#shortcut-help').click();await b.waitForSelector('#shortcuts-dialog[open]');await b.locator('#close-shortcuts').click();
  await b.locator('#side-outside').click();await b.keyboard.press('2');assert.equal(await b.evaluate(()=>window.__foldStudio.selection.side),'inside');await b.keyboard.press('1');assert.equal(await b.evaluate(()=>window.__foldStudio.selection.side),'outside');await b.keyboard.press('f');await b.keyboard.press('g');checks.push('shortcut panel and keyboard side, fit and guides controls');
  const saved=await b.evaluate(()=>window.__foldStudio.project);await b.waitForTimeout(800);await b.reload();await ready(b);assert.deepEqual(await b.evaluate(()=>window.__foldStudio.project),saved);checks.push('both surfaces persist after reload');
  await b.locator('#side-inside').click();const download=b.waitForEvent('download');await b.locator('#export-toggle').click();await b.locator('#export-svg').click();await(await download).saveAs(resolve(artifacts,'inside-roundtrip.svg'));
  const beforeImport=await b.evaluate(()=>window.__foldStudio.project);await b.locator('#project-input').setInputFiles(resolve(artifacts,'inside-roundtrip.svg'));await b.waitForTimeout(150);assert.deepEqual(await b.evaluate(()=>window.__foldStudio.project),beforeImport);checks.push('inside SVG exports and reopens with both surfaces');
  await b.locator('#side-inside').click();await b.locator('#inspect-surface').click();await b.screenshot({path:resolve(artifacts,'08-inside-tray.png'),fullPage:true});
  const restricted=await browser.newContext({viewport:{width:1440,height:900}});
  const d=await restricted.newPage();await d.goto(pathToFileURL(resolve('折间.html')).href);await ready(d);
  const f=await restricted.newPage();await f.goto(pathToFileURL(resolve('折间.html')).href);await ready(f);
  await d.bringToFront();await d.locator('[data-select]').filter({hasText:'品牌名称'}).click();await d.keyboard.press('Control+C');
  await f.bringToFront();await f.locator('#side-inside').click();await paste(f);assert.ok((await layers(f)).some(l=>l.side==='inside'&&l.text==='山野之间'));await restricted.close();
  checks.push('native copy/paste between two file pages without clipboard API permissions');
  assert.deepEqual(errors,[]);writeFileSync(resolve(artifacts,'surfaces-verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}catch(error){for(const [name,p] of [['a',a],['b',b],['c',c]])if(p&&!p.isClosed())await p.screenshot({path:resolve(artifacts,`failure-${name}.png`),fullPage:true}).catch(()=>{});throw error;}
finally{await browser?.close();server.kill();}
