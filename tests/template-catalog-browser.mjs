import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {TEMPLATE_CATALOG} from '../src/template-catalog.js';
import {RETAIL_STYLES} from '../src/retail-cartons.js';
import {newProject} from '../src/project.js';

const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL==='offline'?pathToFileURL(resolve('折间.html')).href:process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const exe=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/template-catalog');mkdirSync(dir,{recursive:true});
const page=await browser.newPage({viewport:{width:1760,height:1100},acceptDownloads:true}),checks=[],errors=[],network=[];
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.stack));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
async function current(id){
  await page.waitForFunction(info=>{const p=window.__foldStudio.project;return p.type===info.type&&(info.type!=='retail-carton'||p.dimensions.retailStyle===info.defaults.retailStyle);},TEMPLATE_CATALOG[id]);await ready();
  assert.equal(await page.locator('#current-template-name').textContent(),TEMPLATE_CATALOG[id].name);
  assert.equal(await page.locator('.template-card.active').count(),1);assert.equal(await page.locator('.template-card.active').getAttribute('data-template'),id);
  assert.equal(await page.locator(`[data-template="${id}"]`).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#current-template-art img').getAttribute('src'),await page.locator(`[data-template="${id}"] img`).getAttribute('src'));
}
async function choose(id){
  await page.locator('#open-templates').click();await page.locator(`[data-template="${id}"]`).click();
  if(await page.locator('#confirm-dialog').isVisible())await page.locator('#accept-confirm').click();
  await page.locator('#templates-dialog').waitFor({state:'hidden'});await current(id);
}
try{
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');await ready();
  await page.locator('#open-templates').click();assert.equal(await page.locator('.template-card').count(),43);
  assert.equal(await page.locator('[data-template="retail-carton"]').count(),0);
  for(const category of ['all','carton','gift','shipping','container']){
    await page.locator(`[data-filter="${category}"]`).click();
    const expected=Object.values(TEMPLATE_CATALOG).filter(t=>category==='all'||t.category===category).length;
    assert.equal(await page.locator('.template-card:visible').count(),expected);
    assert.equal(Number(await page.locator(`[data-filter="${category}"] span`).textContent()),expected);
  }
  await page.locator('[data-filter="all"]').click();await page.locator('#template-search').fill('常用彩盒');
  assert.equal(await page.locator('.template-card:visible').count(),8);
  assert.equal(new Set(await page.locator('.template-card:visible img').evaluateAll(imgs=>imgs.map(i=>i.src))).size,8);
  assert.equal(await page.locator('.template-card:visible img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth===384)),true);
  await page.screenshot({path:resolve(dir,'eight-flat-cards.png'),animations:'disabled'});await page.locator('#close-templates').click();
  checks.push('43 direct entries have accurate category counts; eight retail cards have eight loaded model-derived previews and no collection card');

  let previous='carton';
  for(const style of Object.keys(RETAIL_STYLES)){
    const id='retail-carton-'+style;await choose(id);
    assert.equal(await page.locator('#retail-style').inputValue(),style);
    assert.equal(await page.evaluate(()=>window.__foldStudio.geometry.retail.style),style);
    await page.locator('#undo').click();await current(previous);await page.locator('#redo').click();await current(id);
    const snapshot=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project));
    await choose(id);assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),snapshot);
    const promise=page.waitForEvent('download');await page.locator('#save-project').click();const file=resolve(dir,style+'.fold');await(await promise).saveAs(file);
    const saved=JSON.parse(readFileSync(file,'utf8'));assert.equal(saved.type,'retail-carton');assert.equal(saved.dimensions.retailStyle,style);
    await choose('carton');await page.locator('#project-input').setInputFiles(file);await current(id);previous=id;
  }
  checks.push('each of eight cards chooses its own actual closure, supports same-type switching and undo/redo, preserves current-card reselects, and reopens from .fold');

  const before=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project));
  await page.locator('#open-templates').click();await page.locator('[data-template="retail-carton-same"]').click();await page.locator('#cancel-confirm').click();
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),before);await page.locator('#close-templates').click();
  await current('retail-carton-hanging-lock');
  const legacy=newProject('retail-carton');legacy.name='Legacy retail card QA';legacy.dimensions={...legacy.dimensions,retailStyle:'hanging',length:143,depth:57,height:208};legacy.layers[1].text='保留原有设计';
  await page.locator('#project-input').setInputFiles({name:'legacy.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await current('retail-carton-hanging');
  assert.equal(await page.locator('#dim-length').inputValue(),'143');assert.ok(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project).includes('保留原有设计')));
  await page.locator('#retail-style').selectOption('upper');await current('retail-carton-upper');await page.locator('#undo').click();await current('retail-carton-hanging');
  checks.push('cancel keeps the design; old retail projects retain custom dimensions/artwork; the existing style control updates card identity and undo restores it');

  await page.locator('#open-templates').click();
  for(const [query,id]of [['直线盒','retail-carton-straight'],['锁底盒','retail-carton-lock'],['自锁底盒','retail-carton-lock'],['飞机盒','retail-carton-airplane'],['上盖盒','retail-carton-upper'],['同向盖','retail-carton-same'],['粘底盒','retail-carton-glue'],['挂耳盒','retail-carton-hanging'],['吊挂盒','retail-carton-hanging-lock'],['手提袋','paper-bag-basic'],['手提盒','slotted-handle-carton'],['纸箱','shipper'],['硬盒','wrapped-lidbox'],['软盒','lidbox']]){
    await page.locator('#template-search').fill(query);assert.equal(await page.locator(`[data-template="${id}"]`).isVisible(),true,query);
  }
  await page.locator('#template-search').fill('');await page.locator('#close-templates').click();
  checks.push('all named choices from the 1.0/2.0 panels and hard/soft lid tool are searchable by their original names');
  assert.deepEqual(errors,[]);if(url.startsWith('file:'))assert.deepEqual(network,[]);
}catch(error){await page.screenshot({path:resolve(dir,'failure.png')}).catch(()=>{});throw error;}
finally{writeFileSync(resolve(dir,'report.json'),JSON.stringify({checks,errors,networkCount:network.length},null,2));console.log({checks,errors});await browser.close();await server?.close();}
