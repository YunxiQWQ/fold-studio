import {chromium} from 'playwright';
import {BOX_TYPES} from '../src/geometry.js';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium-1228/chrome-win64/chrome.exe'),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const url=`http://127.0.0.1:${server.httpServer.address().port}`,dir='artifacts/svg-editor-workflow';mkdirSync(dir,{recursive:true});
const context=await browser.newContext({viewport:{width:1800,height:1100},acceptDownloads:true,permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage(),errors=[],checks=[];page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(9000);
const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
const persisted=value=>page.waitForFunction(value=>JSON.stringify(window.__foldStudio.project).includes(value),value);
const click=selector=>page.locator(selector).click();
const action=async name=>{await click('#edit-menu-toggle');await click(`[data-action="${name}"]`);};
const draw=async mode=>{await click('#add-shape');await click(`[data-mode="${mode}"]`);};
async function choose(selector,options){
  const item=page.locator(selector).first();
  const closed=await item.evaluate(node=>{const result=[];for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open)result.unshift(parent.querySelector(':scope>summary [data-toggle-node]').dataset.toggleNode);return result;});
  for(const id of closed)await click(`[data-toggle-node="${id}"]`);
  await item.click(options);
}
async function drag(locator,dx,dy){const box=await locator.boundingBox();assert.ok(box);await dragFrom(box.x+box.width/2,box.y+box.height/2,dx,dy);}
async function dragFrom(x,y,dx,dy){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();}
async function fileInput(selector,name,source,mimeType='image/svg+xml'){await page.locator(selector).setInputFiles({name,mimeType,buffer:Buffer.from(source)});}

try{
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');await ready();
  const sheet=page.locator('#svgcontent'),host=await page.locator('#editor-host').boundingBox(),initial=await sheet.boundingBox();
  await click('#tool-pan');await dragFrom(host.x+host.width*.65,host.y+150,70,25);
  let moved=await sheet.boundingBox();assert.ok(Math.abs(moved.x-initial.x-70)<2&&Math.abs(moved.y-initial.y-25)<2);
  await click('#tool-select');await page.keyboard.down('Space');await dragFrom(host.x+host.width*.65,host.y+150,-24,18);await page.keyboard.up('Space');
  const shifted=await sheet.boundingBox();assert.ok(Math.abs(shifted.x-moved.x+24)<2&&Math.abs(shifted.y-moved.y-18)<2);
  const pointer={x:host.x+host.width*.63,y:host.y+host.height*.42};
  const atPointer=()=>page.evaluate(({x,y})=>{const svg=document.querySelector('#svgcontent'),point=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM().inverse());return [point.x,point.y];},pointer);
  const oldPoint=await atPointer();await page.mouse.move(pointer.x,pointer.y);await page.mouse.wheel(0,-300);await page.waitForFunction(width=>document.querySelector('#svgcontent').getBoundingClientRect().width>width,shifted.width);
  const newPoint=await atPointer();assert.ok(Math.hypot(oldPoint[0]-newPoint[0],oldPoint[1]-newPoint[1])<1);
  await click('#fit-2d');checks.push('hand tool and Space pan, pointer-anchored wheel zoom and Fit');

  const text=page.locator('#svgcontent text[data-name="品牌名称"]');const original=await text.textContent(),originalFill=await text.locator('tspan').first().evaluate(n=>getComputedStyle(n).fill),box=await text.boundingBox();
  await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);await page.locator('#text.is-inline').waitFor();
  await page.keyboard.press('Control+A');await page.keyboard.type('Fold',{delay:65});await page.keyboard.press('Enter');await page.keyboard.insertText('第二行');await page.keyboard.press('Escape');
  await persisted('第二行');assert.equal(await text.locator('tspan').count(),2);assert.equal(await text.locator('tspan').first().evaluate(n=>getComputedStyle(n).fill),originalFill);
  await click('#undo');await ready();assert.equal(await text.textContent(),original);await click('#redo');await ready();assert.match(await text.textContent(),/第二行/);
  const spanId=await text.locator('tspan').first().getAttribute('id');await choose(`[data-node-id="${spanId}"]`);await draw('rect');await dragFrom(host.x+host.width*.7,host.y+135,30,25);
  await page.waitForFunction(()=>window.svgCanvas.getSelectedElements().filter(Boolean).some(n=>n.localName==='rect'));
  assert.equal(await sheet.locator('text rect').count(),0);checks.push('double-click multiline text, original paint, single undo and drawing after span selection');
  await draw('line');await dragFrom(host.x+host.width*.45,host.y+130,34,18);
  await page.waitForFunction(()=>[...document.querySelectorAll('#svgcontent line')].some(n=>getComputedStyle(n).stroke!=='none'));
  await page.waitForFunction(()=>window.svgCanvas.getMode()==='select');
  await draw('ellipse');await dragFrom(host.x+host.width*.55,host.y+147,26,20);await sheet.locator('ellipse').first().waitFor();
  await page.waitForFunction(()=>window.svgCanvas.getMode()==='select');
  await draw('fhpath');await dragFrom(host.x+host.width*.52,host.y+113,37,23);
  await page.waitForFunction(()=>window.svgCanvas.getSelectedElements().filter(Boolean).some(n=>n.localName==='path'||n.localName==='polyline'));
  await page.waitForFunction(()=>window.svgCanvas.getMode()==='select');
  await draw('path');const pen={x:host.x+host.width*.76,y:host.y+139};
  await page.mouse.click(pen.x,pen.y);await page.mouse.click(pen.x+32,pen.y+8);await page.mouse.click(pen.x+12,pen.y+33);await page.mouse.click(pen.x,pen.y);
  await page.waitForFunction(()=>window.svgCanvas.getMode()==='pathedit');
  await page.locator('circle[id^="pathpointgrip_"]').filter({visible:true}).last().click();
  await click('#edit-menu-toggle');await page.locator('#node-actions').selectOption('node-add');await click('#tool-select');
  checks.push('rectangle, ellipse, visible line, freehand and closed pen path with node insertion');

  const source='<svg xmlns="http://www.w3.org/2000/svg" width="170" height="95"><g transform="translate(12 7)" fill="#e33a4a"><rect id="testA" width="40" height="25" style="opacity:.65"/></g><g transform="translate(94 40)" fill="#286baf"><rect id="testB" width="40" height="25"/></g></svg>';
  await fileInput('#image-input','workflow.svg',source);await persisted('testA');
  const a=sheet.locator('rect[id$="testA"]'),b=sheet.locator('rect[id$="testB"]'),idA=await a.getAttribute('id'),idB=await b.getAttribute('id');
  const rgb=await a.evaluate(n=>getComputedStyle(n).fill);
  await click('#color-mode-toggle');await page.waitForFunction(({id,rgb})=>getComputedStyle(document.getElementById(id)).fill!==rgb,{id:idA,rgb});
  const proof=await page.evaluate(async()=>{const {exportSVG}=await import('/src/export-svg.js');const p=window.__foldStudio.project,d=window.__foldStudio.geometry;return [await exportSVG(p,d,undefined,{colorMode:'rgb'}),await exportSVG(p,d,undefined,{colorMode:'cmyk'})].map(svg=>new DOMParser().parseFromString(svg,'image/svg+xml').querySelector('rect[id$="testA"]').parentElement.getAttribute('fill'));});
  assert.notEqual(proof[0],proof[1]);await click('#color-mode-toggle');assert.equal(await a.evaluate(n=>getComputedStyle(n).fill),rgb);checks.push('CMYK soft proof changes preview and vector export while retaining SVG source colour');
  await choose(`[data-node-id="${idA}"]`);const rect=await a.boundingBox(),outline=await page.locator('#selectedBox0').boundingBox();assert.ok(Math.abs(outline.x-rect.x)<5&&Math.abs(outline.y-rect.y)<5);
  await drag(page.locator('#selectorGrip_resize_se'),18,12);assert.ok((await a.boundingBox()).width>rect.width+14);
  assert.equal(await a.evaluate(n=>getComputedStyle(n).opacity),'0.65');
  const places=await Promise.all([a.boundingBox(),b.boundingBox()]);await choose(`[data-node-id="${idA}"]`);await choose(`[data-node-id="${idB}"]`,{modifiers:['Shift']});await action('group');
  for(const [index,object]of [a,b].entries()){const current=await object.boundingBox();assert.ok(Math.abs(current.x-places[index].x)<1&&Math.abs(current.y-places[index].y)<1);}
  await action('ungroup');await choose(`[data-node-id="${idA}"]`);await click(`[data-lock-node="${idA}"]`);await page.keyboard.press('Delete');assert.equal(await a.count(),1);
  await click(`[data-lock-node="${idA}"]`);await choose(`[data-node-id="${idA}"]`);await click(`[data-node-id="${idA}"] + .tree-eye`);assert.equal(await a.getAttribute('display'),'none');await click(`[data-node-id="${idA}"] + .tree-eye`);
  await choose(`[data-node-id="${idA}"]`);await click('#copy-layer');await page.waitForFunction(async()=> (await navigator.clipboard.readText()).startsWith('FOLD-SVG\n'));
  const beforePaste=await sheet.locator('rect').count();await click('#side-inside');await ready();await page.keyboard.press('Control+V');await page.waitForFunction(()=>!!window.__foldStudio.project.svgArtwork?.inside);
  assert.ok(await sheet.locator('rect').count()>0);await click('#side-outside');await ready();assert.equal(await sheet.locator('rect').count(),beforePaste);checks.push('nested SVG handles, cross-group position, visibility, locking and system clipboard across sides');
  await choose(`[data-node-id="${idA}"]`);await page.keyboard.press('Control+D');await page.waitForFunction(count=>document.querySelectorAll('#svgcontent rect').length===count+1,beforePaste);
  await page.keyboard.press('Control+X');await page.waitForFunction(count=>document.querySelectorAll('#svgcontent rect').length===count,beforePaste);
  await click('#paste-layer');await page.waitForFunction(count=>document.querySelectorAll('#svgcontent rect').length===count+1,beforePaste);
  await action('new-layer');await page.locator('#layers .tree-label').filter({hasText:'新图层'}).waitFor();
  checks.push('duplicate, cut, local paste and new layer');

  await click('#side-inside');await ready();await fileInput('#image-input','inside-direct.svg',source.replaceAll('testA','insideA').replaceAll('testB','insideB'));await persisted('insideB');
  const inside=sheet.locator('rect[id$="insideB"]'),insideBefore=await inside.boundingBox();await drag(inside,31,13);const insideAfter=await inside.boundingBox();assert.ok(Math.abs(insideAfter.x-insideBefore.x-31)<2&&Math.abs(insideAfter.y-insideBefore.y-13)<2);
  await click('#undo');await ready();assert.ok(Math.abs((await inside.boundingBox()).x-insideBefore.x)<1);
  await click('#redo');await ready();assert.ok(Math.abs((await inside.boundingBox()).x-insideAfter.x)<1);
  checks.push('dragging a fresh import directly on the inside face and undo/redo');

  await click('#add-barcode');await page.locator('#native-barcode-format').selectOption('code128');await page.locator('#native-code').fill('FOLD-2026-11');await page.locator('#native-code').blur();await persisted('FOLD-2026-11');
  await page.locator('#native-code').fill('无效');await page.locator('#native-code').blur();assert.equal(await page.locator('#native-code').getAttribute('aria-invalid'),'true');
  await click('#add-qrcode');await page.locator('#native-qrcode-level').selectOption('H');await page.locator('#native-code').fill('https://example.org/fold-qa');await page.locator('#native-code').blur();await persisted('https://example.org/fold-qa');
  await click('#add-symbol');assert.equal(await page.locator('#symbol-library [data-symbol-id]').count(),34);await page.locator('#symbol-search').fill('易碎');await click('#symbol-library [data-symbol-id="fragile"]');await ready();
  await page.locator('#layers .tree-label').filter({hasText:'易碎'}).first().waitFor();checks.push('barcode validation and Code 128, QR H level, 34-symbol library search and insertion');

  await action('source');const markup=await page.locator('#source-text').inputValue();await page.locator('#source-text').fill(markup.replace('</svg>','<script>alert(1)</script></svg>'));await click('#source-apply');assert.ok(await page.locator('#source-dialog').isVisible());assert.match(await page.locator('#message').textContent(),/script/);await page.locator('#source-text').fill(markup.replace('</svg>','<circle id="source-audit" cx="30" cy="30" r="4"/></svg>'));await click('#source-apply');await persisted('source-audit');
  await click('#undo');await ready();assert.equal(await sheet.locator('#source-audit').count(),0);await click('#redo');await ready();assert.equal(await sheet.locator('#source-audit').count(),1);checks.push('SVG source validates before apply and round-trips undo/redo');
  const sourceDownload=page.waitForEvent('download');await click('#export-toggle');await click('#export-artwork-svg');await(await sourceDownload).saveAs(`${dir}/artwork.svg`);const exported=readFileSync(`${dir}/artwork.svg`,'utf8');assert.ok(exported.includes('source-audit')&&exported.includes('mm'));assert.ok(!exported.includes('fold-paper-guide'));

  await page.locator('#project-name').fill('交付回归工程');await page.locator('#project-name').blur();await click('.project-library-trigger');await click('[data-library-action="snapshot"]');
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('版本'));
  await click('.is-current [data-library-action="duplicate"]');await page.waitForFunction(()=>window.__foldStudio.project.name.includes('副本'));
  const prior=page.locator('.project-library-item').filter({hasText:'交付回归工程'}).filter({hasNotText:'副本'}).first();await prior.locator('[data-library-action="open"]').click();await page.waitForFunction(()=>window.__foldStudio.project.name==='交付回归工程');
  await ready();await click('.project-library-trigger');await click('.is-current [data-library-action="history"]');await page.locator('[data-library-action="restore"]').first().click();await page.locator('.project-library-dialog').waitFor({state:'hidden'});await ready();
  const save=page.waitForEvent('download');await click('#save-project');const fold=await save;await fold.saveAs(`${dir}/review.fold`);assert.equal(JSON.parse(readFileSync(`${dir}/review.fold`,'utf8')).version,3);
  const png=page.waitForEvent('download');await click('#export-toggle');await click('#export-png');await(await png).saveAs(`${dir}/preview.png`);assert.equal(readFileSync(`${dir}/preview.png`).subarray(1,4).toString(),'PNG');
  await page.setViewportSize({width:390,height:844});await click('#open-templates');assert.equal(await page.locator('.template-card').count(),Object.keys(BOX_TYPES).length);await page.keyboard.press('Escape');
  const header=await page.locator('.flat-pane > .pane-heading').boundingBox(),canvas=await page.locator('#editor-host').boundingBox();
  assert.ok(canvas.y-header.y-header.height<2&&header.height<=42);
  await click('#edit-menu-toggle');
  const edit=await page.locator('#canvas-edit-menu').boundingBox();
  assert.ok(edit.x>=0&&edit.x+edit.width<=390&&edit.y>=0&&edit.y+edit.height<=844);
  await page.keyboard.press('Escape');await page.locator('#canvas-edit-menu').waitFor({state:'hidden'});
  await click('#add-shape');await click('#insert-rect');await ready();
  checks.push('local project snapshot, duplicate, reopen, history, .fold, 3D PNG and narrow-screen structure library');
  assert.deepEqual(errors,[]);writeFileSync(`${dir}/report.json`,JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'));
}catch(error){console.log({checks,errors,toast:await page.locator('#toast').textContent(),message:await page.locator('#message').textContent()});await page.screenshot({path:`${dir}/failure.png`});throw error;}
finally{await browser.close();await server.close();}
