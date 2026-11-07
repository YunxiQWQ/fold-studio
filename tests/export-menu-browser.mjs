import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const server=process.env.FOLD_TEST_URL?null:await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL==='offline'?pathToFileURL(resolve('折间.html')).href:process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/export-menu/verified');mkdirSync(dir,{recursive:true});
const executablePath=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(executablePath)?{executablePath}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true}),errors=[],network=[],checks=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
const ids=['export-flat','export-flat-jpg','export-cmyk','export-svg','export-pdf','export-artwork-svg','export-png','export-jpg','export-glb'];
async function open(id){await page.locator('#export-toggle').click();await page.locator('#'+id).click();}
async function downloaded(id,name){const wait=page.waitForEvent('download');await open(id);const file=await wait;const path=resolve(dir,name);await file.saveAs(path);return readFileSync(path);}
try{
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');const project=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project));
  await page.locator('#export-toggle').click();assert.equal(await page.locator('#export-toggle').getAttribute('aria-expanded'),'true');
  assert.deepEqual(await page.locator('#export-menu [role="menuitem"]').evaluateAll(items=>items.map(e=>e.id)),ids);
  assert.equal(await page.locator('.export-menu-row').count(),5);assert.equal(await page.locator('#export-menu small').count(),0);
  for(const id of ids){assert.equal(await page.locator('#'+id).count(),1);assert.equal(await page.locator('#'+id+'>svg.icon').count(),1);assert.equal(await page.locator('#'+id).isVisible(),true);}
  const bounds=await page.locator('#export-menu [role="menuitem"]').evaluateAll(items=>items.map(e=>{const r=e.getBoundingClientRect();return {id:e.id,x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(const b of bounds){assert.ok(Math.abs(b.w-bounds[0].w)<.5);assert.ok(Math.abs(b.h-bounds[0].h)<.5);}
  for(const index of [3,5,6,8])assert.ok(Math.abs(bounds[index].x-bounds[0].x)<.5,'first column alignment');for(const index of [4,7])assert.ok(Math.abs(bounds[index].x-bounds[1].x)<.5,'second column alignment');
  const menu=await page.locator('#export-menu').boundingBox();assert.ok(menu.height<320);await page.screenshot({path:resolve(dir,'desktop.png'),animations:'disabled'});await page.locator('#export-menu').screenshot({path:resolve(dir,'menu.png'),animations:'disabled'});checks.push('five rows, two groups and nine unique aligned format buttons, each with an icon including TIFF');
  await page.keyboard.press('Escape');await page.locator('#export-menu').waitFor({state:'hidden'});assert.equal(await page.locator('#export-toggle').getAttribute('aria-expanded'),'false');
  await page.locator('#export-toggle').focus();await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'export-flat');await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'export-flat-jpg');await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.id),'export-glb');await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.id),'export-flat');await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.id),'export-glb');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'export-toggle');assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),project);checks.push('keyboard open/navigation/Escape update expanded state and never change artwork');
  for(const [width,height,theme]of [[1500,1000,'slate'],[390,844,'light'],[320,568,'slate']]){
    await page.setViewportSize({width,height});await page.evaluate(theme=>window.__foldStudio.setTheme(theme),theme);await page.locator('#export-toggle').click();const b=await page.locator('#export-menu').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width&&b.y>=0&&b.y+b.height<=height,JSON.stringify(b));for(const id of ids)assert.equal(await page.locator('#'+id).isVisible(),true);await page.screenshot({path:resolve(dir,`${width}-${theme}.png`),animations:'disabled'});await page.keyboard.press('Escape');
  }checks.push('light/slate desktop, 390px phone and 320px short phone keep every format inside the viewport');
  await page.setViewportSize({width:1500,height:1000});
  for(const [id,dialog,title]of [['export-flat','#export-flat-dialog','PNG'],['export-flat-jpg','#export-color-dialog','平面设计 JPG'],['export-cmyk','#export-cmyk-dialog','CMYK'],['export-pdf','#export-color-dialog','PDF'],['export-jpg','#export-color-dialog','三维预览 JPG'],['export-glb','#export-glb-dialog','GLB']]){
    await open(id);await page.locator(dialog).waitFor({state:'visible'});assert.ok((await page.locator(dialog).innerText()).includes(title));assert.equal(await page.locator('#export-toggle').getAttribute('aria-expanded'),'false');await page.keyboard.press('Escape');await page.locator(dialog).waitFor({state:'hidden'});
  }
  assert.ok((await downloaded('export-svg','dieline.svg')).toString().includes('id="dieline"'));const artwork=(await downloaded('export-artwork-svg','artwork.svg')).toString();assert.ok(artwork.includes('<svg')&&!artwork.includes('fold-paper-guide'));assert.equal((await downloaded('export-png','preview.png')).subarray(1,4).toString(),'PNG');checks.push('all nine format buttons keep the correct dialogs or real SVG/PNG downloads');
  await page.locator('#export-toggle').click();await page.locator('#editor-host').click({position:{x:4,y:4}});await page.locator('#export-menu').waitFor({state:'hidden'});assert.equal(await page.locator('#export-toggle').getAttribute('aria-expanded'),'false');
  assert.deepEqual(errors,[]);if(url.startsWith('file:'))assert.deepEqual(network,[]);const report={checks,menu,bounds,errors,networkCount:network.length};writeFileSync(resolve(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:resolve(dir,'failure.png')}).catch(()=>{});throw error;}
finally{await browser.close();await server?.close();}
