import {chromium} from 'playwright';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium-1228/chrome-win64/chrome.exe'),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
let page;const errors=[];
try{
  page=await browser.newPage({viewport:{width:1800,height:1100}});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForSelector('html[data-ready="true"]');await page.waitForSelector('#editor-host[data-svg-ready="true"]');
  assert.equal(await page.locator('#canvasBackground').evaluate(node=>getComputedStyle(node).display),'none');
  assert.equal(await page.locator('#svgcontent').getAttribute('overflow'),'visible');
  await page.evaluate(()=>{window.svgCanvas.selectOnly([window.__foldStudio.nativeEditor.wrapper],true);});
  assert.equal(await page.evaluate(()=>window.svgCanvas.getSelectedElements().filter(Boolean).length),0,'The document container must not become a giant selection');
  const sheet=await page.locator('#svgcontent').boundingBox(),host=await page.locator('#editor-host').boundingBox();
  assert.ok(sheet.x-host.x>25,'Expected a visible pasteboard margin');
  const start={x:sheet.x-23,y:sheet.y+45};
  await page.locator('#add-shape').click();await page.locator('[data-mode="rect"]').click();await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+14,start.y+18,{steps:5});await page.mouse.up();
  await page.waitForFunction(()=>window.svgCanvas.getSelectedElements().filter(Boolean).some(node=>node.localName==='rect'));
  const id=await page.evaluate(()=>window.svgCanvas.getSelectedElements().filter(Boolean).at(-1).id);
  const initial=await page.locator(`[id="${id}"]`).boundingBox();assert.ok(initial.x+initial.width<sheet.x,'Object must lie wholly outside the old sheet frame');
  assert.equal(await page.evaluate(id=>{const node=document.getElementById(id),r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===node;},id),true,'Outside artwork must be visible and hit-testable');
  await page.locator('#tool-select').click();await page.mouse.move(initial.x+initial.width/2,initial.y+initial.height/2);await page.mouse.down();await page.mouse.move(initial.x+initial.width/2+3,initial.y+initial.height/2+15,{steps:5});await page.mouse.up();
  const moved=await page.locator(`[id="${id}"]`).boundingBox();assert.ok(moved.y>initial.y+8,'Outside artwork must remain draggable');
  await page.waitForFunction(id=>JSON.stringify(window.__foldStudio.project.svgArtwork).includes(id),id);
  assert.deepEqual(errors,[]);mkdirSync('artifacts/svg-workspace',{recursive:true});await page.screenshot({path:'artifacts/svg-workspace/open-workspace.png'});writeFileSync('artifacts/svg-workspace/report.json',JSON.stringify({noArtboardFrame:true,noContainerSelection:true,outsideDrawing:true,outsideHitTesting:true,outsideDragging:true,errors},null,2));console.log('Open SVG workspace: no artboard frame or document selection; artwork outside the sheet can be drawn, selected, dragged and saved.');
}catch(error){mkdirSync('artifacts/svg-workspace',{recursive:true});await page?.screenshot({path:'artifacts/svg-workspace/failure.png'}).catch(()=>{});console.log(errors);throw error;}
finally{await browser.close();await server.close();}
