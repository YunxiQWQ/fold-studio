import {chooseExport} from './helpers/export-ui.mjs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';

const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(executablePath)?{executablePath}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const directory=process.env.FOLD_TEST_ARTIFACTS??'artifacts/design-tools';mkdirSync(directory,{recursive:true});
const checks=[],errors=[];let page;
const source='<svg xmlns="http://www.w3.org/2000/svg" width="140" height="100"><defs><linearGradient id="paint"><stop stop-color="#457f61"/><stop offset="1" stop-color="#d5b66e"/></linearGradient></defs><g id="rotated" transform="translate(12 8) rotate(18)"><rect id="a" data-name="目标 A" x="8" y="6" width="22" height="14" fill="#336655"/><rect id="b" x="38" y="6" width="17" height="11" fill="rgb(51,102,85)"/><rect id="hidden" x="62" y="5" width="10" height="10" fill="#336655" display="none"/><rect id="locked" x="78" y="5" width="10" height="10" fill="#336655" data-locked="true"/></g><g id="css" style="transform:translate(15px,9px) rotate(-12deg);transform-origin:50px 50px"><rect id="c" x="55" y="35" width="20" height="13" fill="#994477"/></g><g id="logo" data-name="可编辑标志" transform="translate(9 48)"><defs><clipPath id="clip"><rect width="45" height="25"/></clipPath></defs><rect id="prototype" width="30" height="20" fill="url(#paint)" clip-path="url(#clip)"/><use id="reference" href="#prototype" transform="translate(24 0)"/><text x="3" y="21" font-size="6">Editable</text></g></svg>';
async function ready(){await page.locator('#editor-host[data-svg-ready="true"]').waitFor();}
async function fixture(side='outside',markup=source){
  const project=newProject();project.name='Design tools '+side;project.layers=[];
  await page.locator('#project-input').setInputFiles({name:'tools.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(name=>window.__foldStudio.project.name===name,project.name);await ready();
  await page.locator('#side-'+side).click();await ready();
  await page.locator('#image-input').setInputFiles({name:'tools.svg',mimeType:'image/svg+xml',buffer:Buffer.from(markup)});await page.locator('#svgcontent [id$="-rotated"]').waitFor();await page.locator('#expand-layers').click();
}
async function choose(id,modifiers){await page.locator('#expand-layers').click();await page.locator(`#layers [data-node-id$="-${id}"]`).click(modifiers?{modifiers}:{});}
async function tool(key){await page.locator('#edit-menu-toggle').click();await page.locator(`[data-design-tool="${key}"]`).click();}
async function bounds(){return page.evaluate(()=>{
  const api=window.__foldStudio.nativeEditor,m=api.wrapper.getScreenCTM(),inv=new DOMMatrix([m.a,m.b,m.c,m.d,m.e,m.f]).inverse(),points=[];
  for(const node of api.canvas.getSelectedElements().filter(Boolean)){const b=node.getBBox(),s=node.getScreenCTM(),t=inv.multiply(new DOMMatrix([s.a,s.b,s.c,s.d,s.e,s.f]));for(const [x,y]of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]])points.push(new DOMPoint(x,y).matrixTransform(t));}
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return {x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
});}
const near=(a,b,title,tolerance=.05)=>assert.ok(Math.abs(a-b)<tolerance,`${title}: ${a} / ${b}`);
const documentSource=()=>page.evaluate(()=>{
  // Loading an undo snapshot can recreate SVGCanvas's generated title nodes.
  // Compare all editable geometry, attributes, styles and actual text instead.
  const root=new DOMParser().parseFromString(window.foldSvgSource(),'image/svg+xml').documentElement;
  const read=node=>node.nodeType===3?node.nodeValue:node.nodeType!==1||node.localName==='title'?null:{tag:node.localName,attrs:Object.fromEntries([...node.attributes].sort((a,b)=>a.name.localeCompare(b.name)).map(a=>[a.name,a.value])),children:[...node.childNodes].map(read).filter(n=>n!==null)};
  return JSON.stringify(read(root));
});
async function undo(){await page.locator('#undo').click();await ready();}
try{
  page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.goto(url);await ready();await fixture();
  await choose('a');const unchanged=await documentSource();await tool('same-fill');
  assert.deepEqual(await page.evaluate(()=>window.__foldStudio.nativeEditor.canvas.getSelectedElements().filter(Boolean).map(n=>n.id.split('-').at(-1)).sort()),['a','b']);assert.equal(await documentSource(),unchanged);
  await choose('a');await tool('same-type');assert.equal(await page.evaluate(()=>window.__foldStudio.nativeEditor.canvas.getSelectedElements().filter(Boolean).length),4,'matching rectangles skip resource definitions, hidden and locked objects');
  await page.evaluate(()=>window.__foldStudio.setColorMode('cmyk'));await choose('a');await tool('same-fill');assert.equal(await page.evaluate(()=>window.__foldStudio.nativeEditor.canvas.getSelectedElements().filter(Boolean).length),2,'proof preview does not change matching original colors');await page.evaluate(()=>window.__foldStudio.setColorMode('rgb'));
  checks.push('same fill handles equivalent RGB/HEX; same type skips resources, hidden and locked objects without changing the document');

  for(const side of ['outside','inside']){
    if(side==='inside')await fixture(side);
    await page.locator('#panel-selector').selectOption('front');await choose('a');await choose('c',['Control']);
    const before=await bounds(),sourceBefore=await documentSource();await tool('center');const centered=await bounds();
    const panel=await page.evaluate(()=>{const a=window.__foldStudio,d=a.geometry,p=d.panels.find(p=>p.id===a.selection.panelId);return {x:a.selection.side==='inside'?d.minX+d.maxX-p.x-p.w:p.x,y:p.y,width:p.w,height:p.h};});
    near(centered.x+centered.width/2,panel.x+panel.width/2,'center X '+side);near(centered.y+centered.height/2,panel.y+panel.height/2,'center Y '+side);near(centered.width,before.width,'center preserves width');near(centered.height,before.height,'center preserves height');
    await undo();assert.equal(await documentSource(),sourceBefore,'one undo restores cross-parent centering');
    await choose('a');await choose('c',['Control']);await tool('fit');await page.locator('#design-margin').fill('4');await page.locator('#apply-design-tools').click();const fitted=await bounds();
    near(fitted.width/fitted.height,before.width/before.height,'fit preserves aspect');near(Math.max(fitted.width/(panel.width-8),fitted.height/(panel.height-8)),1,'fits margin box');near(fitted.x+fitted.width/2,panel.x+panel.width/2,'fit center X');
    await undo();assert.equal(await documentSource(),sourceBefore,'one undo restores fitting');
  }
  checks.push('centering and proportional fitting work across rotated/CSS parents on outside and mirrored inside, with one-step undo');

  await choose('a');const arrayBefore=await documentSource(),first=await bounds();await tool('array');await page.locator('#design-rows').fill('2');await page.locator('#design-columns').fill('3');await page.locator('#design-gapX').fill('4');await page.locator('#design-gapY').fill('7');
  assert.match(await page.locator('#design-tools-summary').innerText(),/共 6 组/);await page.locator('#apply-design-tools').click();const array=await bounds();
  near(array.width,first.width*3+8,'array horizontal millimeter spacing');near(array.height,first.height*2+7,'array vertical millimeter spacing');assert.equal(await page.evaluate(()=>window.__foldStudio.nativeEditor.canvas.getSelectedElements().filter(Boolean).length),6);
  await undo();assert.equal(await documentSource(),arrayBefore,'one undo removes the entire array');await page.locator('#redo').click();await ready();assert.equal(await page.locator('#svgcontent [data-name="目标 A"]').count(),6);await undo();
  checks.push('2×3 array uses true sheet millimeter gaps inside rotated parents and supports atomic undo/redo');

  await choose('a');await choose('c',['Control']);const multiBefore=await documentSource(),multi=await bounds();
  await page.locator('#zoom-in').click();await page.locator('#zoom-in').click();await page.locator('#tool-pan').click();
  const host=await page.locator('#editor-host').boundingBox();await page.mouse.move(host.x+host.width*.5,host.y+host.height*.4);await page.mouse.down();await page.mouse.move(host.x+host.width*.5+35,host.y+host.height*.4-25,{steps:5});await page.mouse.up();
  await tool('array');await page.locator('#design-rows').fill('1');await page.locator('#design-columns').fill('2');await page.locator('#design-gapX').fill('3.2');await page.locator('#apply-design-tools').click();
  near((await bounds()).width,multi.width*2+3.2,'cross-parent array at changed viewport');await undo();assert.equal(await documentSource(),multiBefore);await page.locator('#tool-select').click();await page.locator('#fit-2d').click();
  checks.push('array treats cross-parent multi-selection as one motif and retains mm spacing after zoom and pan');

  await choose('logo');const resourcesBefore=await documentSource();await tool('array');await page.locator('#design-rows').fill('1');await page.locator('#design-columns').fill('2');await page.locator('#apply-design-tools').click();
  const references=await page.evaluate(()=>{
    const ids=[...document.querySelectorAll('#svgcontent [id]')].map(n=>n.id),groups=[...document.querySelectorAll('#svgcontent [data-name="可编辑标志"]')];
    return {unique:new Set(ids).size===ids.length,groups:groups.length,valid:groups.every(group=>{const use=group.querySelector('use'),clip=group.querySelector('clipPath'),rect=group.querySelector('rect[clip-path]');return group.querySelector('[id="'+use.getAttribute('href').slice(1)+'"]')===rect&&rect.getAttribute('clip-path').includes('#'+clip.id);}),texts:groups.every(g=>g.querySelector('text')?.textContent==='Editable')};
  });assert.deepEqual(references,{unique:true,groups:2,valid:true,texts:true});
  const event=page.waitForEvent('download');await page.locator('#save-project').click();const file=await event;await file.saveAs(resolve(directory,'array.fold'));
  const saved=await page.evaluate(()=>window.__foldStudio.project);await page.reload();await ready();assert.deepEqual(await page.evaluate(()=>window.__foldStudio.project),saved);
  await page.locator('#side-inside').click();await ready();
  await page.locator('#expand-layers').click();await page.locator('#layers .tree-label').filter({hasText:'可编辑标志'}).last().click();assert.ok(await page.locator('#properties').isVisible());
  checks.push('array remaps local clip/use references without duplicate IDs, keeps text/vector layers and survives project saving/reload');

  const svgDownload=page.waitForEvent('download');await page.locator('#export-toggle').click();await chooseExport(page,'flat','svg',true);const svgFile=await svgDownload;const svgPath=resolve(directory,'array.svg');await svgFile.saveAs(svgPath);const exported=readFileSync(svgPath,'utf8');assert.ok(exported.includes('Editable')&&exported.includes('<use')&&exported.includes('<clipPath'));assert.ok(!exported.includes('data:image/'),'vector array export contains no bitmap');
  const transactionBefore=await documentSource();const rejected=await page.evaluate(()=>{
    const api=window.__foldStudio.nativeEditor,node=api.wrapper.querySelector('[id$="-a"]');
    try{api.transaction('invalid test',batch=>{const old={fill:node.getAttribute('fill')};node.setAttribute('fill','url(https://invalid.example/paint)');batch.addSubCommand(new api.canvas.history.ChangeElementCommand(node,old));});return false;}catch{return true;}
  });assert.ok(rejected,'transaction validates the combined scene');assert.equal(await documentSource(),transactionBefore,'rejected edit rolls the DOM back atomically');
  checks.push('export remains editable SVG; an invalid batch rolls back without changing source');

  await choose('a');const noChange=await documentSource();await tool('array');await page.locator('#design-rows').fill('20');await page.locator('#design-columns').fill('20');assert.ok(await page.locator('#apply-design-tools').isDisabled());await page.locator('#cancel-design-tools').click();assert.equal(await documentSource(),noChange);
  await tool('fit');await page.locator('#design-margin').fill('999');assert.ok(await page.locator('#apply-design-tools').isDisabled());await page.keyboard.press('Escape');assert.equal(await documentSource(),noChange);
  checks.push('invalid counts and panel margins are rejected; cancellation and Escape leave the source unchanged');

  await page.locator('#add-barcode').click();await page.locator('#native-code').waitFor();const originalCode=await page.locator('#native-code').inputValue();
  const generatorBefore=await page.evaluate(()=>Object.keys(window.__foldStudio.project.svgGenerators));
  await tool('array');await page.locator('#design-rows').fill('2');await page.locator('#design-columns').fill('2');await page.locator('#apply-design-tools').click();
  await page.waitForFunction(count=>Object.keys(window.__foldStudio.project.svgGenerators).length===count+3,generatorBefore.length);
  const newId=await page.evaluate(before=>Object.keys(window.__foldStudio.project.svgGenerators).find(id=>!before.includes(id)),generatorBefore);
  await page.locator('#expand-layers').click();await page.locator(`[data-node-id="${newId}"]`).click();await page.locator('#native-code').fill('978020137962');await page.locator('#native-code').blur();
  await page.waitForFunction(id=>window.__foldStudio.project.svgGenerators[id].code==='978020137962',newId);
  assert.ok(await page.evaluate(({before,code})=>before.every(id=>window.__foldStudio.project.svgGenerators[id].code===code),{before:generatorBefore,code:originalCode}));
  await undo();await undo();assert.deepEqual(await page.evaluate(()=>Object.keys(window.__foldStudio.project.svgGenerators)),generatorBefore);
  checks.push('array barcodes retain independent editable content and undo restores both artwork and generator metadata');

  await choose('a');const beforeCapacity=await documentSource();
  const large=await page.evaluate(()=>{const api=window.__foldStudio.nativeEditor;api.transaction('capacity fixture',batch=>{const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.id='capacity-grid';for(let i=0;i<70;i++){const rect=document.createElementNS(group.namespaceURI,'rect');for(const [key,value]of Object.entries({x:i,y:0,width:1,height:1,fill:'#446655'}))rect.setAttribute(key,value);group.append(rect);}api.wrapper.append(group);batch.addSubCommand(new api.canvas.history.InsertElementCommand(group));return {selection:[group]};});return true;});assert.ok(large);
  const capacityBefore=await documentSource();await tool('array');await page.locator('#design-rows').fill('10');await page.locator('#design-columns').fill('10');await page.locator('#apply-design-tools').click();assert.match(await page.locator('#design-tools-error').innerText(),/元素过多/);assert.equal(await documentSource(),capacityBefore);await page.keyboard.press('Escape');await undo();assert.equal(await documentSource(),beforeCapacity);
  checks.push('oversized arrays fail before mutation and leave the original selection and history intact');

  const lineCreated=await page.evaluate(()=>{const api=window.__foldStudio.nativeEditor;api.transaction('line fixture',batch=>{const line=document.createElementNS('http://www.w3.org/2000/svg','line');for(const [key,value]of Object.entries({id:'utility-line',x1:0,y1:0,x2:0,y2:15,stroke:'#335577'}))line.setAttribute(key,value);api.wrapper.append(line);batch.addSubCommand(new api.canvas.history.InsertElementCommand(line));return {selection:[line]};});return true;});assert.ok(lineCreated);
  await tool('center');near((await bounds()).width,0,'vertical line remains a line');await tool('fit');await page.locator('#apply-design-tools').click();assert.ok((await bounds()).height>100);await undo();await undo();await undo();
  checks.push('zero-width vertical lines can center and fit without singular transforms');
  await page.evaluate(()=>window.__foldStudio.setTheme('slate'));await choose('a');await tool('array');await page.screenshot({path:resolve(directory,'array-slate.png'),animations:'disabled'});await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await tool('array');const box=await page.locator('#design-tools-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391&&box.y>=0&&box.y+box.height<=845);await page.screenshot({path:resolve(directory,'array-mobile.png'),animations:'disabled'});
  await page.locator('#design-rows').fill('1');await page.locator('#design-columns').fill('2');await page.locator('#apply-design-tools').click();await page.locator('#design-tools-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#svgcontent [data-name="目标 A"]').count(),2);
  checks.push('one existing menu exposes the tools; slate and mobile dialogs fit the viewport');assert.deepEqual(errors,[]);console.log({checks,errors});
}catch(error){await page?.screenshot({path:resolve(directory,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{writeFileSync(resolve(directory,'report.json'),JSON.stringify({checks,errors},null,2));await browser.close();await server?.close();}
