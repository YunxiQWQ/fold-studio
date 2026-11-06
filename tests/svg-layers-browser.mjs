import {chromium} from 'playwright';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});await server.listen();
const installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1800,height:1100},acceptDownloads:true}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
mkdirSync('artifacts/svg-layers',{recursive:true});
const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
const label=id=>page.locator(`[data-node-id="${id}"]`);
const row=id=>page.locator(`[data-tree-node="${id}"] > .tree-row`);
const selected=()=>page.evaluate(()=>window.svgCanvas.getSelectedElements().filter(Boolean).map(node=>node.id));
async function choose(id,options){
  const button=label(id),closed=await button.evaluate(node=>{
    const ids=[];for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open){const toggle=parent.querySelector(':scope>summary [data-toggle-node]');if(toggle)ids.unshift(toggle.dataset.toggleNode);}
    return ids;
  });
  for(const key of closed)await page.locator(`[data-toggle-node="${key}"]`).click();
  await button.click(options);
}
async function reorder(source,target,position){
  const bounds=await row(target).boundingBox();
  await row(source).dragTo(row(target),{targetPosition:{x:bounds.width*.5,y:position==='inside'?bounds.height*.5:position==='before'?2:bounds.height-2}});
}
try{
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await ready();
  const source='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><defs><linearGradient id="ink"><stop stop-color="#185b32"/><stop offset="1" stop-color="#95bf8a"/></linearGradient></defs><g id="ARTWORK"><g id="row-items" transform="translate(10 10)" fill="#c32d51"><rect id="first" data-name="底色" width="35" height="22"/><rect id="middle" data-name="中间图形" x="8" y="7" width="35" height="22"/><text id="top" data-name="标题" x="5" y="22" font-size="10">层级测试</text></g><g id="folder" data-name="目标组合" transform="translate(70 25) scale(.8)" fill="#276baa"><rect id="folder-art" width="25" height="15"/></g><g id="svg_522"><path d="M0 60L50 60L25 90Z" fill="url(#ink)"/></g></g></svg>';
  await page.locator('#image-input').setInputFiles({name:'layers.svg',mimeType:'image/svg+xml',buffer:Buffer.from(source)});
  await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project.svgArtwork).includes('ARTWORK'));await ready();
  const ids=await page.evaluate(()=>Object.fromEntries(['ARTWORK','row-items','first','middle','top','folder','folder-art','svg_522'].map(key=>[key,[...document.querySelectorAll('#svgcontent [id]')].find(node=>node.id.endsWith('-'+key)).id])));
  await choose(ids.top);
  const visualOrder=await row(ids.top).evaluate(element=>[...element.parentElement.parentElement.children].map(wrapper=>wrapper.querySelector(':scope>.tree-row .tree-label')?.dataset.nodeId).filter(Boolean));
  assert.deepEqual(visualOrder,[ids.top,ids.middle,ids.first]);
  assert.equal(await label(ids.svg_522).textContent(),'组合');
  assert.equal(await page.locator('.tree-resources').evaluate(node=>node.open),false);
  assert.equal(await page.locator('.tree-scroll .tree-label').filter({hasText:'defs'}).count(),0);
  checks.push('front-to-back layer order, readable generated names and separately collapsed SVG resources');
  await choose(ids.first,{modifiers:['Shift']});
  assert.deepEqual(new Set(await selected()),new Set([ids.first,ids.middle,ids.top]));
  assert.equal(await page.locator('.tree-label.selected').count(),3);
  await choose(ids.middle,{modifiers:['Control']});assert.equal((await selected()).length,2);
  checks.push('Shift ranges and Ctrl toggle select every corresponding object and highlight all selected rows');
  await choose(ids.middle);await label(ids.middle).dblclick();
  await page.locator('.tree-rename').fill('新名称');await page.locator('.tree-rename').press('Enter');
  await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project.svgArtwork).includes('新名称'));
  assert.equal(await label(ids.middle).textContent(),'新名称');
  await page.locator('#layer-search').fill('新名称');assert.equal(await label(ids.first).count(),0);await label(ids.middle).waitFor({state:'visible'});
  await page.locator('#layer-search').fill('');
  checks.push('inline rename saves, text/name search keeps ancestor paths and clearing restores the full hierarchy');
  await choose(ids.first);await reorder(ids.first,ids.top,'before');
  assert.equal(await page.evaluate(id=>document.getElementById(id).parentElement.lastElementChild.id,ids.first),ids.first);
  await page.locator('#undo').click();await ready();
  assert.equal(await page.evaluate(id=>document.getElementById(id).parentElement.firstElementChild.id,ids.first),ids.first);
  await page.locator('#redo').click();await ready();
  assert.equal(await page.evaluate(id=>document.getElementById(id).parentElement.lastElementChild.id,ids.first),ids.first);
  checks.push('actual drag sorting updates stacking and supports global undo/redo');
  await choose(ids.middle);await choose(ids.folder);
  const before=await page.locator(`[id="${ids.middle}"]`).boundingBox();
  const fill=await page.evaluate(id=>getComputedStyle(document.getElementById(id)).fill,ids.middle);
  await page.locator('#color-mode-toggle').click();
  await reorder(ids.middle,ids.folder,'inside');
  assert.equal(await page.evaluate(id=>document.getElementById(id).parentElement.id,ids.middle),ids.folder);
  const after=await page.locator(`[id="${ids.middle}"]`).boundingBox();
  for(const key of ['x','y','width','height'])assert.ok(Math.abs(before[key]-after[key])<1,`reparent changed ${key}`);
  assert.equal(await page.evaluate(id=>document.getElementById(id).getAttribute('fill'),ids.middle),'#c32d51');
  await page.locator('#color-mode-toggle').click();
  assert.equal(await page.evaluate(id=>getComputedStyle(document.getElementById(id)).fill,ids.middle),fill);
  checks.push('drag into a transformed group preserves artwork position, dimensions and inherited paint');
  await page.locator(`[data-lock-node="${ids.folder}"]`).click();
  await choose(ids.middle);await page.keyboard.press('Delete');
  assert.equal(await page.locator(`[id="${ids.middle}"]`).count(),1);
  await page.locator(`[data-lock-node="${ids.folder}"]`).click();
  await page.locator(`[data-visibility-node="${ids.folder}"]`).click();
  assert.equal(await page.evaluate(id=>document.getElementById(id).getAttribute('display'),ids.folder),'none');
  await page.locator(`[data-visibility-node="${ids.folder}"]`).click();
  await choose(ids.first);await choose(ids.top,{modifiers:['Control']});
  await page.locator('.tree-actions [data-layer-command="group"]').click();
  const group=(await selected())[0];
  assert.equal(await page.evaluate(id=>document.getElementById(id).localName,group),'g');
  await page.locator('.tree-actions [data-layer-command="ungroup"]').click();
  assert.equal(await page.locator(`#svgcontent [id="${group}"]`).count(),0);
  checks.push('inherited locking protects descendants, group visibility, and panel group/ungroup actions');
  await page.locator('#save-project').click();const expected=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project));
  await page.waitForTimeout(500);await page.reload();await ready();
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),expected);
  await page.screenshot({path:'artifacts/svg-layers/workspace.png'});
  assert.deepEqual(errors,[]);
  writeFileSync('artifacts/svg-layers/report.json',JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'));
}catch(error){console.log({checks,errors});await page.screenshot({path:'artifacts/svg-layers/failure.png'});throw error;}
finally{await browser.close();await server.close();}
