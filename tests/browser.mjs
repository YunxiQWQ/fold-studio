import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { newProject } from '../src/project.js';

const artifacts=resolve('artifacts');mkdirSync(artifacts,{recursive:true});
const port=await new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const server=spawn(process.execPath,['server.mjs','--port',String(port)],{stdio:'pipe'});
let serverOutput='';server.stdout.on('data',d=>serverOutput+=d);server.stderr.on('data',d=>serverOutput+=d);
const url=`http://127.0.0.1:${port}`;
let browser;
try{
  let ready=false;for(let n=0;n<100;n++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,serverOutput);
  const installed=process.env.FOLD_BROWSER_PATH ?? (process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium-1228/chrome-win64/chrome.exe') : '');
  browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1,acceptDownloads:true});
  page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.stack??e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');
  await page.waitForFunction(()=>window.__foldStudio?.stats?.triangles>0);
  const initial=await page.evaluate(()=>window.__foldStudio.stats);
  assert.ok(initial.triangles>0&&initial.triangles<1000);assert.ok(initial.textureUpdates<6);assert.ok(initial.drawCalls>0&&initial.drawCalls<50);
  await page.screenshot({path:resolve(artifacts,'01-workspace.png'),fullPage:true});

  await page.waitForTimeout(400);const idleStart=await page.evaluate(()=>window.__foldStudio.stats.frames);await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>window.__foldStudio.stats.frames),idleStart,'Idle preview must stop rendering');
  const beforeFold=await page.evaluate(()=>window.__foldStudio.stats);
  for(const value of [0,25,50,75,100]){await page.locator('#fold-slider').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},value);await page.waitForTimeout(30);}
  const afterFold=await page.evaluate(()=>window.__foldStudio.stats);
  assert.equal(afterFold.textureUpdates,beforeFold.textureUpdates,'Folding must not repaint the atlas');assert.equal(afterFold.geometryBuilds,beforeFold.geometryBuilds,'Folding must not rebuild geometry');

  await page.locator('[data-select]').filter({hasText:'品牌名称'}).click();
  const oldText=await page.locator('#prop-text').inputValue();await page.locator('#prop-text').fill('山野新作');await page.locator('#prop-text').blur();
  await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>window.__foldStudio.project.layers.find(l=>l.name==='品牌名称').text),'山野新作');
  await page.locator('#undo').click();assert.equal(await page.evaluate(()=>window.__foldStudio.project.layers.find(l=>l.name==='品牌名称').text),oldText);
  await page.locator('#redo').click();
  assert.equal(await page.evaluate(()=>window.__foldStudio.project.layers.find(l=>l.name==='品牌名称').text),'山野新作');
  await page.locator('[data-select]').filter({hasText:'品牌名称'}).click();
  const canvas=await page.locator('[data-testid="editor-canvas"]').boundingBox();
  const drag=await page.evaluate(()=>{const app=window.__foldStudio,p=app.geometry.panels.find(p=>p.id==='front'),l=app.project.layers.find(l=>l.name==='品牌名称'),v=app.view;return{x:v.x+(p.x+l.x*p.w)*v.scale,y:v.y+(p.y+l.y*p.h)*v.scale};});
  await page.mouse.move(canvas.x+drag.x,canvas.y+drag.y);await page.mouse.down();await page.mouse.move(canvas.x+drag.x+17,canvas.y+drag.y+13,{steps:12});await page.mouse.up();
  assert.notEqual(await page.evaluate(()=>window.__foldStudio.project.layers.find(l=>l.name==='品牌名称').x),.5,'Dragging must move the selected text');
  await page.screenshot({path:resolve(artifacts,'02-editing.png'),fullPage:true});
  console.log('Passed: initial render, idle render, fold, text, history, canvas drag');

  const builds=await page.evaluate(()=>window.__foldStudio.stats.geometryBuilds);
  await page.locator('#dim-length').fill('135');await page.locator('#dim-length').blur();await page.waitForTimeout(160);
  assert.equal(await page.evaluate(()=>window.__foldStudio.project.dimensions.length),135);assert.ok(await page.evaluate(()=>window.__foldStudio.stats.geometryBuilds)>builds);
  await page.locator('#quality').selectOption('economy');await page.waitForTimeout(80);assert.ok((await page.evaluate(()=>window.__foldStudio.stats.atlas[0]))<=770);

  await page.locator('#add-text').click();await page.locator('#prop-text').fill('新建测试图层');await page.locator('#prop-text').blur();
  const count=await page.evaluate(()=>window.__foldStudio.project.layers.length);await page.locator('#duplicate-layer').click();assert.equal(await page.evaluate(()=>window.__foldStudio.project.layers.length),count+1);
  await page.locator('#delete-layer').click();assert.equal(await page.evaluate(()=>window.__foldStudio.project.layers.length),count);
  console.log('Passed: dimensions, quality, layer actions');
  const image=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#e8b36a';ctx.fillRect(0,0,80,80);return c.toDataURL('image/png').split(',')[1];}),'base64');
  await page.locator('#image-input').setInputFiles({name:'test-image.png',mimeType:'image/png',buffer:image});
  await page.waitForFunction(()=>window.__foldStudio.project.layers.some(l=>l.type==='image'));
  console.log('Passed: image upload');

  const exportWait=page.waitForEvent('download');await page.locator('#save-project').click();const exported=await exportWait;await exported.saveAs(resolve(artifacts,'roundtrip.fold'));
  const svgWait=page.waitForEvent('download');await page.locator('#export-toggle').click();await page.locator('#export-svg').click();const svg=await svgWait;await svg.saveAs(resolve(artifacts,'roundtrip.svg'));
  const pngWait=page.waitForEvent('download');await page.locator('#export-toggle').click();await page.locator('#export-png').click();await(await pngWait).saveAs(resolve(artifacts,'preview.png'));
  const expected=await page.evaluate(()=>window.__foldStudio.project);
  await page.locator('#project-name').fill('临时更名');await page.locator('#project-name').blur();await page.locator('#project-input').setInputFiles(resolve(artifacts,'roundtrip.svg'));
  await page.waitForFunction(name=>window.__foldStudio.project.name===name,expected.name);
  assert.deepEqual(await page.evaluate(()=>window.__foldStudio.project),expected);
  await page.waitForTimeout(800);await page.reload();await page.waitForSelector('html[data-ready="true"]');assert.deepEqual(await page.evaluate(()=>window.__foldStudio.project),expected);

  for(const type of ['tray','sleeve','carton']){
    await page.locator('#open-templates').click();
    await page.waitForSelector('#templates-dialog[open]');
    await page.locator(`[data-template="${type}"]`).click();
    const confirm=page.locator('#confirm-dialog');
    if(await confirm.isVisible({timeout:400}).catch(()=>false)){await page.locator('#accept-confirm').click();await confirm.waitFor({state:'hidden'});}
    await page.locator('#templates-dialog').waitFor({state:'hidden'});
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>window.__foldStudio.project.type),type);
    await page.screenshot({path:resolve(artifacts,`03-${type}.png`),fullPage:true});
  }
  const stable=await page.evaluate(()=>window.__foldStudio.project);
  const invalid=newProject();invalid.layers[0].w=-4;
  await page.locator('#project-input').setInputFiles({name:'invalid.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await page.waitForTimeout(60);assert.deepEqual(await page.evaluate(()=>window.__foldStudio.project),stable,'Invalid project must leave current work intact');
  await page.locator('#play-fold').click();await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>window.__foldStudio.project.fold),1);
  await page.setViewportSize({width:1100,height:800});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:resolve(artifacts,'04-laptop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:resolve(artifacts,'05-mobile.png'),fullPage:true});
  const offline=await browser.newPage({viewport:{width:1440,height:950}}),offlineRequests=[];
  offline.on('pageerror',e=>errors.push(e.message));
  offline.on('request',r=>{if(/^https?:/.test(r.url()))offlineRequests.push(r.url());});
  await offline.goto(pathToFileURL(resolve('折间.html')).href);await offline.waitForSelector('html[data-ready="true"]');await offline.waitForFunction(()=>window.__foldStudio?.stats?.triangles>0);
  await offline.locator('#add-text').click();await offline.locator('#prop-text').fill('离线编辑测试');await offline.locator('#prop-text').blur();await offline.waitForTimeout(800);
  await offline.reload();await offline.waitForSelector('html[data-ready="true"]');assert.ok(await offline.evaluate(()=>window.__foldStudio.project.layers.some(l=>l.text==='离线编辑测试')));
  assert.deepEqual(offlineRequests,[],'Standalone HTML must work without network requests');
  await offline.screenshot({path:resolve(artifacts,'06-offline.png'),fullPage:true});
  assert.deepEqual(errors,[],'Browser must have no JavaScript or WebGL errors');
  const report={checkedAt:new Date().toISOString(),initialStats:initial,foldDelta:{textureUpdates:afterFold.textureUpdates-beforeFold.textureUpdates,geometryBuilds:afterFold.geometryBuilds-beforeFold.geometryBuilds},idleFramesAdded:0,checks:['template closure covered by geometry tests','idle rendering','fold without rebake','text edit','undo/redo','canvas drag','dimensions','quality','layers','image upload','project and SVG roundtrip','PNG export','IndexedDB restore','three templates','invalid import preservation','animation','laptop layout','mobile layout','offline single-file edit and restore','zero offline network requests','zero console errors'],errors};
  writeFileSync(resolve(artifacts,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();server.kill();}
