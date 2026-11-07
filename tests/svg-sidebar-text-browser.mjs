import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';
import {makeDieline} from '../src/geometry.js';
import {chooseExport} from './helpers/export-ui.mjs';

const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL==='offline'?pathToFileURL(resolve('折间.html')).href:process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/sidebar-text/current');mkdirSync(dir,{recursive:true});
const exe=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1760,height:1080},acceptDownloads:true}),checks=[],errors=[],network=[];
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.stack));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
const node=(tag,attrs={},children=[])=>({tag,attrs:Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,String(v)])),children});
const project=newProject();project.name='Sidebar text sync QA';project.layers=[];
const d=makeDieline(project.type,project.dimensions),front=d.panels.find(p=>p.id==='front');
const asset={viewBox:[d.minX,d.minY,d.width,d.height],nodes:[node('g',{id:'fixtures',transform:`translate(${front.x+5} ${front.y+10})`},[
  node('defs',{},[node('path',{id:'curve',d:'M0 95 Q30 70 65 95'})]),
  node('text',{id:'plain',x:0,y:15,'font-size':8,fill:'#305039'},['原来的文字']),
  node('text',{id:'mixed',x:0,y:35,'font-size':7},[node('tspan',{id:'red',fill:'#b52d4a'},['山野']),node('tspan',{id:'blue',fill:'#204fac','font-weight':700},[' FOLD'])]),
  node('text',{id:'multiline',x:0,y:50,'font-size':6},[node('tspan',{id:'line1',x:0,y:50},['第一行']),node('tspan',{id:'line2',x:0,y:60},['第二行'])]),
  node('text',{id:'curved','font-size':6},[node('textPath',{id:'on-curve',href:'#curve'},['路径文字'])]),
  node('rect',{id:'shape',x:0,y:110,width:30,height:15,fill:'#b94f73'}),
]) ]};project.svgArtwork={outside:asset,inside:structuredClone(asset)};
const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
const element=id=>page.locator(`#svgcontent [id="${id}"]`);
const field=()=>page.locator('#node-text');
async function choose(id){await page.evaluate(id=>window.__foldStudio.nativeEditor.select(document.getElementById(id)),id);await field().waitFor();}
async function live(id,value){
  await field().fill(value);
  // This assertion intentionally precedes blur/change: the SVG itself must
  // already match the sidebar while it still owns keyboard focus.
  assert.equal(await element(id).textContent(),value.replaceAll('\n',''));
  await page.waitForFunction(({id,value})=>{
    const find=n=>typeof n==='string'?null:n.attrs.id===id?n:n.children.map(find).find(Boolean);
    const text=n=>typeof n==='string'?n:n.children.map(text).join('');
    const n=window.__foldStudio.project.svgArtwork?.[window.__foldStudio.selection.side]?.nodes.map(find).find(Boolean);
    return n&&text(n)===value.replaceAll('\n','');
  },{id,value});
  assert.equal(await field().evaluate(n=>document.activeElement===n),true);
}
async function undo(){await page.locator('#undo').click();await ready();}
async function redo(){await page.locator('#redo').click();await ready();}
try{
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');
  await page.locator('#project-input').setInputFiles({name:'sidebar.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await page.waitForFunction(()=>window.__foldStudio.project.name==='Sidebar text sync QA');await ready();
  await choose('plain');await live('plain','右侧实时更新');
  checks.push('sidebar text updates the actual SVG and saved project before blur, retaining focus');
  await page.evaluate(()=>{window.sidebarField=document.querySelector('#node-text');window.sidebarNode=document.querySelector('#svgcontent #plain');});
  await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await page.keyboard.insertText('😀');
  await page.keyboard.press('Backspace');assert.equal(await field().inputValue(),'右侧实时更新');
  assert.equal(await field().evaluate(n=>n.selectionStart),1);
  await page.keyboard.insertText('边');await live('plain','连续输入 第二次修改');
  assert.equal(await page.evaluate(()=>window.sidebarField===document.querySelector('#node-text')&&window.sidebarNode===document.querySelector('#svgcontent #plain')),true);
  const box=await page.evaluate(()=>{const n=document.querySelector('#svgcontent #plain'),text=n.getBoundingClientRect(),selector=window.svgCanvas.selectorManager.selectorMap[n.id].selectorGroup.getBoundingClientRect();return{text:text.width,selector:selector.width};});
  assert.ok(box.selector>=box.text&&box.selector<box.text+100,JSON.stringify(box));
  await field().blur();await undo();assert.equal(await element('plain').textContent(),'原来的文字');
  await redo();assert.equal(await element('plain').textContent(),'连续输入 第二次修改');
  checks.push('repeated typing retains the SVG node, textarea, caret and selection frame; one undo/redo covers the entire session');

  await choose('plain');await live('plain','另一次聚焦编辑');await field().blur();await undo();
  assert.equal(await element('plain').textContent(),'连续输入 第二次修改');await redo();
  checks.push('a later sidebar edit uses the current node and has its own undo step');

  await choose('plain');await field().fill('切换前立即输入');await choose('mixed');
  assert.equal(await element('plain').textContent(),'切换前立即输入');
  await live('mixed','山野 FOLD追加');assert.equal(await element('red').textContent(),'山野');
  assert.equal(await element('red').getAttribute('fill'),'#b52d4a');assert.equal(await element('blue').textContent(),' FOLD追加');
  assert.equal(await element('blue').getAttribute('fill'),'#204fac');assert.equal(await element('blue').getAttribute('font-weight'),'700');
  await field().blur();await undo();assert.equal(await element('mixed').textContent(),'山野 FOLD');
  assert.equal(await element('plain').textContent(),'切换前立即输入');
  checks.push('switching selection flushes even the last pending input; mixed tspan paint and font attributes survive whole-text edits');

  await choose('red');await live('red','单独修改片段');assert.equal(await element('blue').textContent(),' FOLD');await field().blur();
  await choose('red');await live('red','再次修改片段');await field().blur();await undo();assert.equal(await element('red').textContent(),'单独修改片段');
  checks.push('editing a selected tspan is live, repeatable and leaves adjacent text untouched');

  await choose('multiline');await live('multiline','新第一行\n\n新第三行');assert.equal(await field().inputValue(),'新第一行\n\n新第三行');
  await field().evaluate(n=>n.setSelectionRange(5,5));await page.keyboard.insertText('中间输入');
  assert.equal(await field().inputValue(),'新第一行\n中间输入\n新第三行');await field().blur();
  await choose('multiline');assert.equal(await field().inputValue(),'新第一行\n中间输入\n新第三行');
  await undo();assert.equal(await element('multiline').textContent(),'第一行第二行');await redo();
  checks.push('multiline and blank-line edits repaint immediately and retain paragraph boundaries through undo/redo');

  await choose('curved');await live('curved','整段路径文字');await field().blur();
  assert.equal(await element('on-curve').getAttribute('href'),'#curve');
  await choose('on-curve');await live('on-curve','路径片段编辑');await field().blur();
  assert.equal(await element('on-curve').getAttribute('href'),'#curve');
  checks.push('text and textPath controls update path text without breaking its path reference');

  await choose('plain');await field().fill('输入：');await page.keyboard.press('End');
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition',{text:'zhongwen',selectionStart:8,selectionEnd:8});
  assert.equal(await element('plain').textContent(),'输入：zhongwen');
  await cdp.send('Input.imeSetComposition',{text:'中文',selectionStart:2,selectionEnd:2});await cdp.send('Input.insertText',{text:'中文'});
  assert.equal(await field().inputValue(),'输入：中文');assert.equal(await element('plain').textContent(),'输入：中文');
  assert.equal(await field().evaluate(n=>document.activeElement===n&&n.selectionStart===5),true);await field().blur();await undo();
  assert.equal(await element('plain').textContent(),'切换前立即输入');await redo();
  checks.push('real browser IME composition repaints during composition, retains focus and commits as one undo step');

  await choose('plain');await live('plain','');await live('plain','清空后继续输入');await field().blur();
  assert.equal(await element('plain').count(),1);await choose('plain');assert.equal(await field().getAttribute('maxlength'),'5000');
  await field().evaluate(n=>{n.value='字'.repeat(5001);n.dispatchEvent(new InputEvent('input',{bubbles:true}));});
  assert.equal(await element('plain').textContent(),'清空后继续输入');assert.equal(await field().inputValue(),'清空后继续输入');
  checks.push('empty text remains editable; oversized text is rejected without corrupting the last valid SVG');

  await live('plain','切面前更新');await page.locator('#side-inside').click();await ready();
  await choose('plain');await live('plain','内面实时编辑');await page.locator('#side-outside').click();await ready();
  assert.equal(await element('plain').textContent(),'切面前更新');
  await page.locator('#side-inside').click();await ready();assert.equal(await element('plain').textContent(),'内面实时编辑');
  checks.push('surface switches flush pending typing and preserve independent outside/inside text');

  await page.waitForFunction(()=>window.__foldStudio.printColor.ready);await page.evaluate(()=>window.__foldStudio.setColorMode('cmyk'));
  await page.waitForFunction(()=>document.querySelector('#editor-host').dataset.proofReady==='true');
  await choose('plain');await live('plain','CMYK 文字实时更新');
  await page.waitForFunction(()=>document.querySelector('#editor-host').dataset.proofReady==='true');
  assert.equal(await page.evaluate(()=>getComputedStyle(window.__foldStudio.nativeEditor.wrapper).maskImage),'none');
  assert.equal(await page.locator('#fold-proof-image').evaluate(n=>getComputedStyle(n).display),'none');
  await page.screenshot({path:resolve(dir,'sidebar-live-cmyk.png'),animations:'disabled'});await field().blur();
  await page.waitForFunction(()=>document.querySelector('#editor-host').dataset.proofReady==='true'&&getComputedStyle(document.querySelector('#fold-proof-image')).display!=='none');
  checks.push('CMYK reveals live source glyphs during typing and regenerates the proof when the session ends');

  await page.evaluate(()=>window.__foldStudio.setColorMode('rgb'));await choose('plain');
  const p=await element('plain').evaluate(n=>{const b=n.getExtentOfChar(1),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(n.getScreenCTM());return{x:p.x,y:p.y};});
  await page.mouse.dblclick(p.x,p.y);await page.locator('#text.is-inline').waitFor();
  await page.locator('#text').fill('画布内编辑');await page.keyboard.press('Escape');
  await field().waitFor();assert.equal(await field().inputValue(),'画布内编辑');
  await live('plain','右侧再次接续');await field().blur();await undo();assert.equal(await element('plain').textContent(),'画布内编辑');await redo();
  checks.push('canvas inline editing and sidebar editing hand off without a stale node, lost focus or merged undo sessions');

  await choose('plain');await field().fill('保存前最后一笔');
  const download=page.waitForEvent('download');await page.keyboard.press('Control+s');const saved=resolve(dir,'sidebar.fold');await(await download).saveAs(saved);
  assert.ok(JSON.stringify(JSON.parse(readFileSync(saved,'utf8')).svgArtwork).includes('保存前最后一笔'));
  await live('plain','保存后接着输入');await field().blur();await undo();assert.equal(await element('plain').textContent(),'保存前最后一笔');
  await page.locator('#project-input').setInputFiles(saved);await page.waitForFunction(()=>window.__foldStudio.selection.side==='outside');await ready();
  assert.equal(await element('plain').textContent(),'切面前更新');await page.locator('#side-inside').click();await ready();assert.equal(await element('plain').textContent(),'保存前最后一笔');
  const svgDownload=page.waitForEvent('download');await chooseExport(page,'flat','svg',true);const svgPath=resolve(dir,'sidebar.svg');await(await svgDownload).saveAs(svgPath);
  const svg=readFileSync(svgPath,'utf8');assert.ok(svg.includes('保存前最后一笔'));assert.ok(svg.includes('<text')&&!svg.includes('native-text-overlay'));
  checks.push('Ctrl+S without blur, project reopen and editable SVG export contain the final sidebar input');

  const legacy=newProject();legacy.name='Legacy sidebar text QA';
  await page.locator('#project-input').setInputFiles({name:'legacy.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await page.waitForFunction(()=>window.__foldStudio.project.name==='Legacy sidebar text QA');await ready();
  const id=await page.evaluate(()=>window.__foldStudio.nativeEditor.wrapper.querySelector('text').id);
  await choose(id);const previous=await field().inputValue();await live(id,'默认工程文字实时更新');await field().blur();await undo();
  await choose(id);assert.equal(await field().inputValue(),previous);
  const created=await page.evaluate(()=>{window.__foldStudio.addLayer('text');return window.__foldStudio.selection.selected;});
  await page.waitForFunction(id=>document.getElementById(id)?.textContent==='在这里，写下灵感'&&document.querySelector('#editor-host').dataset.svgReady==='true',created);
  assert.ok(created);await choose(created);await live(created,'工具新建文字实时更新');await field().blur();await undo();
  await choose(created);assert.equal(await field().inputValue(),'在这里，写下灵感');
  checks.push('legacy project text and newly created toolbar text use the same live editing and undo behavior');
  assert.deepEqual(errors,[]);if(url.startsWith('file:'))assert.deepEqual(network,[]);
}catch(error){await page.screenshot({path:resolve(dir,'failure.png')}).catch(()=>{});throw error;}
finally{writeFileSync(resolve(dir,'report.json'),JSON.stringify({checks,errors,networkCount:network.length},null,2));console.log({checks,errors});await browser.close();await server?.close();}
