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
const directory=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/rich-text/verified');mkdirSync(directory,{recursive:true});
const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1760,height:1080},acceptDownloads:true}),checks=[],errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});page.setDefaultTimeout(20000);
const el=(tag,attrs={},children=[])=>({tag,attrs:Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,String(v)])),children});
const project=newProject();project.name='Character formatting QA';project.layers=[];const d=makeDieline(project.type,project.dimensions),front=d.panels.find(p=>p.id==='front');
const asset={viewBox:[d.minX,d.minY,d.width,d.height],nodes:[el('g',{id:'fixture',transform:`translate(${front.x+5} ${front.y+15})`},[
  el('text',{id:'plain',x:0,y:12,'font-size':8,'font-family':'Arial',fill:'#284f36'},['第一段 Abc 中文']),
  el('text',{id:'mixed',x:0,y:36,'font-size':7,'font-family':'Arial',transform:'rotate(-8 20 42) scale(1.1 .85)'},[el('tspan',{id:'red',x:0,y:36,fill:'#aa2345'},['红色中文']),el('tspan',{id:'blue',x:0,y:49,fill:'#2345aa'},['蓝色文字'])]),
  el('rect',{id:'shape',x:0,y:70,width:30,height:20,fill:'#365d46'})
]) ]};project.svgArtwork={outside:asset,inside:structuredClone(asset)};
const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
async function edit(id,start,end){
  const point=await page.locator('#'+id).evaluate(n=>{const b=n.getExtentOfChar(1),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(n.getScreenCTM());return{x:p.x,y:p.y};});
  await page.mouse.dblclick(point.x,point.y);await page.locator('#text.is-inline').waitFor();
  await page.locator('#text').evaluate((n,{start,end})=>{n.setSelectionRange(start,end);n.dispatchEvent(new Event('select'));},{start,end});await page.waitForFunction(()=>!!document.querySelector('#typography-selection-note'));
}
const chars=id=>page.locator('#'+id).evaluate(n=>{const result=[],walk=node=>{if(node.nodeType===3){for(const char of node.textContent){const s=getComputedStyle(node.parentElement);result.push({char,font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,style:s.fontStyle,decoration:s.textDecorationLine,fill:s.fill});}}else if(!['title','desc'].includes(node.localName))for(const child of node.childNodes)walk(child);};walk(n);return result;});
async function finish(){await page.locator('#text').focus();await page.keyboard.press('Escape');await page.locator('#text.is-inline').waitFor({state:'detached'});}
try{
  await page.goto(url);await ready();await page.locator('#project-input').setInputFiles({name:'rich.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>window.__foldStudio.project.name==='Character formatting QA');await ready();
  const original=await chars('plain');await edit('plain',4,7);await page.locator('#font-picker-toggle').click();await page.locator('#font-picker-search').fill('Georgia');await page.locator('[data-font-family="Georgia, serif"]').click();
  assert.equal(await page.evaluate(()=>window.svgCanvas.getMode()),'textedit');assert.deepEqual(await page.locator('#text').evaluate(n=>[n.selectionStart,n.selectionEnd]),[4,7]);
  let styled=await chars('plain');for(let i=0;i<styled.length;i++)assert.equal(styled[i].font,i>=4&&i<7?'Georgia, serif':original[i].font);
  checks.push('font dropdown changes only selected characters and retains the live text range');
  await page.locator('#typography-unit').selectOption('mm');await page.locator('#typography-size').fill('5');await page.locator('#typography-size').press('Tab');
  styled=await chars('plain');for(let i=0;i<styled.length;i++)assert.equal(parseFloat(styled[i].size),i>=4&&i<7?5:8);
  await page.locator('[data-typography-action="bold"]').click();await page.locator('[data-typography-action="italic"]').click();await page.locator('[data-typography-action="underline"]').click();
  styled=await chars('plain');for(let i=0;i<styled.length;i++){assert.equal(styled[i].weight,i>=4&&i<7?'700':'400');assert.equal(styled[i].style,i>=4&&i<7?'italic':'normal');assert.equal(styled[i].decoration,i>=4&&i<7?'underline':'none');}
  checks.push('selected character size, weight, italic and underline preserve all surrounding characters');
  await page.screenshot({path:resolve(directory,'selected-characters.png')});await finish();await page.locator('#undo').click();await ready();assert.deepEqual(await chars('plain'),original);await page.locator('#redo').click();await ready();assert.deepEqual(await chars('plain'),styled);checks.push('one edit session including character formatting supports global undo and redo');
  const mixedBefore=await chars('mixed');await edit('mixed',2,7);await page.locator('#typography-family').fill('Georgia');await page.locator('#typography-family').press('Tab');
  const mixedAfter=await chars('mixed');for(let i=0;i<mixedAfter.length;i++){assert.equal(mixedAfter[i].font,i>=2&&i<6?'Georgia':mixedBefore[i].font);assert.equal(mixedAfter[i].fill,mixedBefore[i].fill);}
  await page.locator('#text').focus();await page.keyboard.press('Control+b');assert.ok((await chars('mixed')).slice(2,6).every(c=>c.weight==='700'));await page.keyboard.insertText('替换');assert.equal(await page.locator('#text').inputValue(),'红色替换文字');await finish();checks.push('cross-line selections preserve existing colors and support keyboard style toggles and replacement typing');
  await page.locator('#side-inside').click();await ready();await edit('plain',0,2);await page.locator('#typography-family').fill('Georgia');await page.locator('#typography-family').press('Tab');await finish();assert.ok((await chars('plain')).slice(0,2).every(c=>c.font==='Georgia'));assert.ok((await chars('plain')).slice(2).every(c=>c.font==='Arial'));await page.locator('#side-outside').click();await ready();checks.push('character formatting is independent on the inside surface');
  await page.evaluate(()=>{window.queryLocalFonts=async()=>{window.dispatchEvent(new Event('blur'));return[{family:'Courier New'}];};});await edit('plain',8,10);await page.locator('#font-picker-toggle').click();await page.locator('#read-local-fonts').click();assert.equal(await page.evaluate(()=>window.svgCanvas.getMode()),'textedit');await page.locator('.svg-font-option').filter({hasText:'Courier New'}).click();await finish();
  const localStyled=await chars('plain');for(let i=0;i<localStyled.length;i++)assert.equal(localStyled[i].font,i>=8?'"Courier New"':styled[i].font);styled=localStyled;checks.push('font access dialog losing window focus retains the character range for a local font choice');
  const download=page.waitForEvent('download');await page.locator('#save-project').click();const saved=resolve(directory,'rich.fold');await(await download).saveAs(saved);assert.ok(JSON.stringify(JSON.parse(readFileSync(saved,'utf8')).svgArtwork).includes('Georgia'));
  await page.locator('#project-input').setInputFiles(saved);await ready();assert.deepEqual(await chars('plain'),styled);
  const svgDownload=page.waitForEvent('download');await chooseExport(page,'flat','svg',true);const svgPath=resolve(directory,'rich.svg');await(await svgDownload).saveAs(svgPath);const svg=readFileSync(svgPath,'utf8');assert.ok(svg.includes('Georgia')&&svg.includes('<tspan'));assert.ok(!svg.includes('native-text-overlay'));checks.push('project save/reopen and editable SVG export preserve character styles');
  assert.deepEqual(errors,[]);if(url.startsWith('file:'))assert.deepEqual(network,[]);console.log({checks,errors,networkCount:network.length});
}catch(error){await page.screenshot({path:resolve(directory,'failure.png')}).catch(()=>{});console.error({checks,errors,mode:await page.evaluate(()=>window.svgCanvas?.getMode())});throw error;}
finally{writeFileSync(resolve(directory,'report.json'),JSON.stringify({checks,errors,networkCount:network.length},null,2));await browser.close();await server?.close();}
