import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';

const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(executablePath)?{executablePath}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const directory=process.env.FOLD_TEST_ARTIFACTS??'artifacts/workspace-editing';mkdirSync(directory,{recursive:true});
const checks=[],errors=[];let page;
try{
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  await page.keyboard.press('Escape');await page.locator('#edit-menu-toggle').click();
  assert.ok(await page.locator('#canvas-edit-menu [data-action="group"]').isDisabled());assert.ok(await page.locator('#canvas-edit-menu [data-action="delete"]').isDisabled());assert.ok(await page.locator('#node-actions').isDisabled());await page.keyboard.press('Escape');
  await page.locator('#add-shape').click();await page.locator('#draw-menu [data-mode="rect"]').click();assert.equal(await page.locator('#draw-menu [data-mode="rect"]').getAttribute('aria-pressed'),'true');await page.keyboard.press('Escape');
  assert.equal(await page.locator('#tool-select').getAttribute('aria-pressed'),'true');checks.push('one toolbar exposes active drawing modes and disables unavailable editing commands');

  const project=newProject('slotted-handle-carton');project.name='Workspace editing';
  await page.locator('#project-input').setInputFiles({name:'ui.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>window.__foldStudio.project.name==='Workspace editing');await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  const metrics=await page.evaluate(()=>{const tree=document.querySelector('#layers .tree-scroll'),settings=document.querySelector('#document-settings');return {tree:tree.clientHeight,settings:settings.clientHeight,content:settings.scrollHeight};});
  assert.ok(metrics.tree>=260,JSON.stringify(metrics));assert.ok(metrics.content>metrics.settings,'long model parameters scroll separately');
  await page.locator('#document-settings').evaluate(el=>el.scrollTop=el.scrollHeight);assert.ok(await page.locator('#layer-search').isVisible());
  const handle=await page.locator('#layer-resizer').boundingBox();await page.mouse.move(handle.x+40,handle.y);await page.mouse.down();await page.mouse.move(handle.x+40,handle.y-65,{steps:5});await page.mouse.up();
  const layerHeight=await page.locator('#layer-section').evaluate(el=>el.clientHeight);await page.reload();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();assert.ok(Math.abs(await page.locator('#layer-section').evaluate(el=>el.clientHeight)-layerHeight)<2);
  checks.push('extended structure settings and layers have independent scrolling; layer height persists');

  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect id="qa-a" x="8" y="8" width="25" height="16" fill="#357252" stroke="#123456" stroke-dasharray="3 2"/><rect id="qa-b" x="65" y="40" width="35" height="24" fill="#b2734d"/><g id="qa-group"><circle id="qa-circle" cx="45" cy="50" r="8" fill="#677ca1"/></g><text id="qa-text" x="12" y="70" font-size="8">Editable text</text></svg>';
  await page.locator('#image-input').setInputFiles({name:'ui.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await page.locator('#svgcontent [id$="-qa-a"]').waitFor();await page.locator('#expand-layers').click();
  const choose=(id,options)=>page.locator(`#layers [data-node-id$="-${id}"]`).click(options);
  await choose('qa-a');assert.ok(await page.locator('[data-property-section="geometry"]').isVisible());assert.ok(await page.locator('[data-property-section="paint"]').isVisible());
  const advanced=page.locator('[data-property-section="advanced"]');assert.equal(await advanced.getAttribute('open'),null);assert.equal(await page.locator('[data-attribute="stroke-dasharray"]').isVisible(),false);
  await advanced.locator('summary').click();await page.locator('[data-attribute="stroke-dasharray"]').fill('5 3');await page.locator('[data-attribute="stroke-dasharray"]').blur();await page.waitForFunction(()=>document.querySelector('#svgcontent [id$="-qa-a"]').getAttribute('stroke-dasharray')==='5 3');
  await page.locator('[data-attribute="fill"]').fill('#254e79');await page.locator('[data-attribute="fill"]').blur();await page.waitForFunction(()=>document.querySelector('#svgcontent [id$="-qa-a"]').getAttribute('fill')==='#254e79');
  checks.push('grouped inspector edits real SVG paint and geometry and preserves editable advanced attributes');

  await choose('qa-b',{modifiers:['Control']});assert.match(await page.locator('#properties h3').innerText(),/2 个对象/);assert.equal(await page.locator('#node-name').count(),0,'multi-selection never edits only the last object silently');
  assert.ok(await page.locator('[data-inspector-action="align-l"]').isEnabled());assert.ok(await page.locator('[data-inspector-action="align-dh"]').isDisabled());
  await page.locator('[data-inspector-action="group"]').click();assert.equal(await page.evaluate(()=>{const a=document.querySelector('#svgcontent [id$="-qa-a"]'),b=document.querySelector('#svgcontent [id$="-qa-b"]');return a.parentElement===b.parentElement;}),true);
  await page.locator('#undo').click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();await page.locator('#expand-layers').click();
  await choose('qa-a');await page.locator('#node-name').fill('可编辑矩形');await page.locator('#node-name').blur();await page.waitForFunction(()=>document.querySelector('#svgcontent [id$="-qa-a"]').getAttribute('data-name')==='可编辑矩形');
  checks.push('multi-selection offers batch group/order/alignment and undo; layer naming edits the source');

  await page.locator('#layers [data-visibility-node$="-qa-a"]').click();
  assert.equal(await page.locator('#layers .tree-label[tabindex="0"]').count(),1,'visibility buttons preserve a keyboard entry into the layer tree');
  await page.locator('#layers [data-visibility-node$="-qa-a"]').click();await choose('qa-a');
  const label=page.locator('#layers [data-node-id$="-qa-a"]');await label.focus();
  const next=await label.evaluate(button=>{const labels=[...document.querySelectorAll('#layers .tree-label')].filter(n=>n.getClientRects().length);return labels[labels.indexOf(button)+1].dataset.nodeId;});
  const position=await page.locator('#svgcontent [id$="-qa-a"]').getAttribute('transform');await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.nodeId),next);assert.equal(await page.locator('#svgcontent [id$="-qa-a"]').getAttribute('transform'),position,'tree navigation does not nudge canvas objects');
  await page.keyboard.press('F2');await page.locator('.tree-rename').fill('键盘重命名');await page.keyboard.press('Enter');assert.ok(await page.locator('#layers .tree-label').filter({hasText:'键盘重命名'}).count());
  await page.locator('#layer-search').fill('missing QA layer');assert.ok(await page.locator('.tree-empty').isVisible());await page.locator('#clear-layer-search').click();assert.equal(await page.locator('#layer-search').inputValue(),'');
  await page.locator('#collapse-layers').click();await page.locator('#expand-layers').click();assert.ok(await page.locator('#layers [data-node-id$="-qa-circle"]').isVisible());
  checks.push('layer keyboard navigation preserves focus, F2 renames, search clears, and groups expand/collapse');

  await choose('qa-text');await page.locator('#node-text').fill('工具栏与属性联动');await page.locator('#node-text').blur();await page.waitForFunction(()=>document.querySelector('#svgcontent [id$="-qa-text"]').textContent==='工具栏与属性联动');
  await page.locator('#document-settings').evaluate(el=>el.scrollTop=0);await page.screenshot({path:resolve(directory,'desktop.png')});
  await page.evaluate(()=>window.__foldStudio.setTheme('slate'));await page.screenshot({path:resolve(directory,'slate.png')});
  await page.setViewportSize({width:1024,height:768});await page.locator('#toggle-inspector').click();await page.locator('#right-sidebar').waitFor({state:'visible'});await page.keyboard.press('Escape');assert.equal(await page.locator('#toggle-inspector').getAttribute('aria-expanded'),'false');
  await page.setViewportSize({width:390,height:844});await page.locator('#right-sidebar:not([inert])').waitFor();
  await page.locator('#node-text').fill('手机上也能编辑');await page.setViewportSize({width:400,height:844});
  assert.equal(await page.locator('#node-text').inputValue(),'手机上也能编辑','viewport changes preserve the focused property draft');
  await page.locator('#node-text').blur();await page.waitForFunction(()=>document.querySelector('#svgcontent [id$="-qa-text"]').textContent==='手机上也能编辑');await page.screenshot({path:resolve(directory,'phone.png'),fullPage:true});
  checks.push('desktop, slate theme, tablet drawers and phone keep SVG editing reachable');assert.deepEqual(errors,[]);console.log({checks,errors});
}catch(error){await page?.screenshot({path:resolve(directory,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{writeFileSync(resolve(directory,'report.json'),JSON.stringify({checks,errors},null,2));await browser.close();await server?.close();}
