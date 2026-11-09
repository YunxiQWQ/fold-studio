import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {newProject} from '../src/project.js';

const root=resolve(import.meta.dirname,'..'),dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/page-color-picker/browser');mkdirSync(dir,{recursive:true});
let server,output='',stage='startup';
const url=process.env.FOLD_TEST_OFFLINE?pathToFileURL(resolve(root,'折间.html')).href:await new Promise((yes,no)=>{
  server=spawn(process.execPath,['server.mjs','--port','0'],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});const timeout=setTimeout(()=>{server.kill();no(Error(output));},15000);
  server.on('error',e=>{clearTimeout(timeout);no(e);});const log=b=>{output+=b;const m=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timeout);yes(m[0]+'/fold');}};server.stdout.on('data',log);server.stderr.on('data',log);
});
const exe=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1100}}),checks=[],errors=[],network=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(process.env.FOLD_TEST_OFFLINE&&/^https?:/.test(r.url()))network.push(r.url());});
const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
const source=async()=>createHash('sha256').update(await page.evaluate(()=>window.foldSvgSource())).digest('hex');
const node=()=>page.evaluate(()=>window.__foldStudio.nativeEditor.canvas.getSelectedElements().find(Boolean).id);
async function choose(suffix){await page.evaluate(suffix=>{const a=window.__foldStudio.nativeEditor,n=a.wrapper.querySelector(`[id$="${suffix}"]`);a.canvas.selectOnly([n]);a.refreshProperties();},suffix);}
const field=attribute=>page.locator(`#properties [data-attribute="${attribute}"]`);
const open=attribute=>field(attribute).locator('..').locator('button').click();
const pop=page.locator('#color-studio:popover-open');
async function mock(){await page.evaluate(()=>{window.EyeDropper=class{open({signal}){window.pickSignal=signal;return new Promise((resolve,reject)=>{window.resolvePick=resolve;window.rejectPick=reject;signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});});}};});}
async function pick(color){await page.locator('#color-eyedropper').click();assert.equal(await pop.evaluate(el=>getComputedStyle(el).visibility),'hidden');await page.evaluate(color=>window.resolvePick({sRGBHex:color}),color);await page.waitForFunction(()=>getComputedStyle(document.querySelector('#color-studio')).visibility!=='hidden');}
try{
  await page.goto(url);await ready();const p=newProject();p.name='页面取色测试';p.layers=[];
  await page.locator('#project-input').setInputFiles({name:'pick.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await page.waitForFunction(()=>window.__foldStudio.project.name==='页面取色测试');await ready();
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="90" height="70"><defs><linearGradient id="paint"><stop stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs><rect id="target" x="2" y="2" width="32" height="24" fill="#234567" stroke="#665544"/><rect id="sample" x="45" y="2" width="30" height="24" fill="#336699"/><rect id="gradient" x="2" y="40" width="40" height="20" fill="url(#paint)"/></svg>';
  await page.locator('#image-input').setInputFiles({name:'colors.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await page.locator('#svgcontent [id$="-target"]').waitFor();await choose('-target');await mock();
  stage='native SVG confirmation and undo';const target=await node(),initial=await source();await open('fill');assert.equal(await page.locator('#color-hex-value').inputValue(),'#234567');assert.equal(await source(),initial);
  await pick('#336699');assert.equal(await page.locator('#color-hex-value').inputValue(),'#336699');assert.equal(await source(),initial,'sampling previews the palette until confirmation');await page.locator('#apply-color').click();await page.waitForFunction(id=>document.getElementById(id)?.getAttribute('fill')==='#336699',target);
  await page.locator('#undo').click();await ready();await choose('-target');assert.equal(await field('fill').inputValue(),'#234567');checks.push('SVG fill opens the shared palette, accepts a sampled browser result, commits once and supports undo');
  stage='stroke and cancellation';await open('stroke');await pick('#cc4488');await page.locator('#apply-color').click();await page.waitForFunction(id=>document.getElementById(id)?.getAttribute('stroke')==='#cc4488',target);
  const afterStroke=await source();await open('fill');await page.locator('#color-eyedropper').click();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.pickSignal.aborted),true);await page.waitForFunction(()=>getComputedStyle(document.querySelector('#color-studio')).visibility!=='hidden');assert.ok(await pop.isVisible());assert.equal(await source(),afterStroke);await page.keyboard.press('Escape');assert.equal(await pop.count(),0);assert.equal(await source(),afterStroke);
  checks.push('stroke uses the same palette; Esc cancels sampling without edits, and another Esc closes the palette');
  stage='gradient and no-op cancellation';await choose('-gradient');const raw=await field('fill').inputValue(),beforeGradient=await source();await open('fill');await page.locator('#apply-color').click();assert.equal(await source(),beforeGradient);assert.equal(await field('fill').inputValue(),raw);await open('fill');await pick('#ddaa33');await page.locator('#cancel-color').click();assert.equal(await source(),beforeGradient);assert.equal(await field('fill').inputValue(),raw);
  checks.push('opening or cancelling preserves the exact gradient paint, including its local URL reference');
  stage='unsupported and denied API';await page.evaluate(()=>window.EyeDropper=undefined);await choose('-target');await open('fill');assert.ok(await page.locator('#color-eyedropper').isVisible());assert.ok(await page.locator('#color-eyedropper').isDisabled());assert.match(await page.locator('#color-studio-message').innerText(),/Chrome.*Edge/);await page.locator('#color-hex-value').fill('#448822');await page.locator('#apply-color').click();await page.waitForFunction(id=>document.getElementById(id)?.getAttribute('fill')==='#448822',target);
  await mock();await open('fill');await page.locator('#color-eyedropper').click();await page.evaluate(()=>window.rejectPick(new DOMException('Denied','NotAllowedError')));await page.waitForFunction(()=>getComputedStyle(document.querySelector('#color-studio')).visibility!=='hidden');assert.match(await page.locator('#color-studio-message').innerText(),/未完成/);await page.locator('#cancel-color').click();
  checks.push('unsupported browsers keep a visible explanation and editable palette; denial restores the palette without changing artwork');
  stage='stale asynchronous result';await open('fill');await page.locator('#color-eyedropper').click();await page.evaluate(()=>{window.stalePick=window.resolvePick;document.querySelector('#color-studio').hidePopover();});assert.equal(await page.evaluate(()=>window.pickSignal.aborted),true);await choose('-sample');const beforeStale=await source();await open('fill');await page.evaluate(()=>window.stalePick({sRGBHex:'#ff0000'}));assert.equal(await page.locator('#color-hex-value').inputValue(),'#336699');assert.equal(await source(),beforeStale);await page.locator('#cancel-color').click();
  checks.push('closing the palette aborts its pending picker; a late result cannot recolor the next selection');
  stage='paper and barcode';await page.locator('#paper-color').locator('..').locator('.modern-color-trigger').click();const paper=await page.evaluate(()=>window.__foldStudio.project.paper);await pick('#c0ffee');assert.equal(await page.evaluate(()=>window.__foldStudio.project.paper),'#c0ffee');await page.locator('#cancel-color').click();assert.equal(await page.evaluate(()=>window.__foldStudio.project.paper),paper);
  await page.locator('#add-barcode').click();await page.locator('#native-barcode-color').locator('..').locator('button').click();await pick('#123456');await page.locator('#apply-color').click();await page.waitForFunction(()=>Object.values(window.__foldStudio.project.svgGenerators??{}).some(g=>g.type==='barcode'&&g.color==='#123456'));assert.ok(await page.locator('#svgcontent path[fill="#123456"]').count()>10);
  await page.locator('#native-barcode-color').locator('..').locator('button').click();await page.screenshot({path:resolve(dir,'palette.png'),fullPage:true});await page.locator('#cancel-color').click();
  checks.push('legacy paper color retains cancel/preview behavior, and the barcode palette commits actual editable vector color');
  stage='project change while sampling';await page.locator('#native-barcode-color').locator('..').locator('button').click();await page.locator('#color-eyedropper').click();await page.evaluate(()=>window.oldProjectPick=window.resolvePick);const replacement=newProject();replacement.name='取色时切换工程';replacement.layers=[];
  await page.locator('#project-input').setInputFiles({name:'replacement.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(replacement))});await page.waitForFunction(()=>window.__foldStudio.project.name==='取色时切换工程');await ready();assert.equal(await page.evaluate(()=>window.pickSignal.aborted),true);await page.evaluate(()=>window.oldProjectPick({sRGBHex:'#ff0000'}));assert.equal(await page.evaluate(()=>window.__foldStudio.project.paper),replacement.paper);assert.equal(await pop.count(),0);checks.push('switching projects cancels an outstanding sample without modifying the new project');
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
}catch(error){await page.screenshot({path:resolve(dir,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{writeFileSync(resolve(dir,'report.json'),JSON.stringify({stage,checks,errors,network},null,2));console.log({stage,checks,errors,network});await browser.close();server?.kill();}
