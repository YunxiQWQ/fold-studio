import {chromium} from 'playwright';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';

const server=await createServer({server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium-1228/chrome-win64/chrome.exe'),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const errors=[],checks=[];let page;
try{
  page=await browser.newPage({viewport:{width:1700,height:1100},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForSelector('html[data-ready="true"]');
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const x=c.getContext('2d');x.fillStyle='#e17b38';x.fillRect(0,0,100,100);x.fillStyle='#3977bc';x.fillRect(100,0,100,100);return c.toDataURL();});
  const p=newProject(),base={panel:'front',side:'outside',x:.5,rotation:0,opacity:1,visible:true,color:'#243c52'};
  p.layers=[{...base,id:'text',name:'文字变换',type:'text',text:'文本框换行测试 ABCDEFGHIJKLMNOPQRSTUVWXYZ',font:'sans',size:7,y:.28,w:.68,h:.24},{...base,id:'photo',name:'图片变换',type:'image',src:image,y:.76,w:.5,h:55/2/170}];
  await page.locator('#project-input').setInputFiles({name:'transforms.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await page.waitForFunction(()=>window.__foldStudio.project.layers[0].id==='text');
  const layer=id=>page.evaluate(id=>window.__foldStudio.project.layers.find(l=>l.id===id),id);
  const select=id=>page.locator(`[data-select="${id}"]`).click();
  async function handle(id,x,y){const q=await page.evaluate(({id,x,y})=>{const a=window.__foldStudio,l=a.project.layers.find(l=>l.id===id),p=a.geometry.panels.find(p=>p.id===l.panel),v=a.view;return{x:v.x+(p.x+(l.x+x*l.w)*p.w)*v.scale,y:v.y+(p.y+(l.y+y*l.h)*p.h)*v.scale};},{id,x,y});const box=await page.locator('[data-testid="editor-canvas"]').boundingBox();return{x:box.x+q.x,y:box.y+q.y};}
  async function drag(id,hx,hy,dx,dy,shift=false){const q=await handle(id,hx,hy);await page.mouse.move(q.x,q.y);if(shift)await page.keyboard.down('Shift');await page.mouse.down();await page.mouse.move(q.x+dx,q.y+dy,{steps:12});await page.mouse.up();if(shift)await page.keyboard.up('Shift');}
  await select('text');assert.equal(await page.locator('#text-transform-mode').inputValue(),'scale');
  const original=await layer('text');await drag('text',.5,0,42,0);const horizontal=await layer('text');
  assert.ok(horizontal.textScaleX>1.2);assert.ok(Math.abs(horizontal.textScaleY-1)<.01);assert.equal(horizontal.size,original.size);assert.ok(Math.abs(horizontal.w/horizontal.textScaleX-original.w)<.001);
  checks.push('text side handle stretches glyphs without changing nominal font size or original wrapping width');
  await drag('text',.5,.5,24,9,true);const proportional=await layer('text');assert.ok(Math.abs(proportional.w/horizontal.w-proportional.h/horizontal.h)<.02);
  checks.push('Shift corner scaling keeps the already-stretched text aspect ratio');
  await page.locator('#text-transform-mode').selectOption('frame');const beforeFrame=await layer('text');await drag('text',.5,0,-25,0);await drag('text',0,.5,0,20);const framed=await layer('text');
  assert.ok(framed.w<beforeFrame.w);assert.ok(framed.h>beforeFrame.h);assert.equal(framed.textScaleX,beforeFrame.textScaleX);assert.equal(framed.textScaleY,beforeFrame.textScaleY);assert.equal(framed.size,beforeFrame.size);
  checks.push('frame mode resizes width and height with no glyph scaling');
  await select('photo');const photo=await layer('photo');await drag('photo',.5,.5,40,7,true);const uniform=await layer('photo');assert.ok(Math.abs(uniform.w/photo.w-uniform.h/photo.h)<.02);
  await drag('photo',.5,0,20,0,true);const uniformSide=await layer('photo');assert.ok(Math.abs(uniformSide.w/uniform.w-uniformSide.h/uniform.h)<.02);
  await drag('photo',.5,.5,25,2);const free=await layer('photo');assert.ok(Math.abs(free.w/uniformSide.w-free.h/uniformSide.h)>.05);
  checks.push('image Shift corner and edge scaling are proportional; ordinary dragging remains free');
  await page.locator('#undo').click();assert.ok(Math.abs((await layer('photo')).w-uniformSide.w)<.001);await page.locator('#redo').click();assert.ok(Math.abs((await layer('photo')).w-free.w)<.001);
  await select('text');await page.locator('[data-editor-prop="textScaleX"]').fill('180');await page.locator('[data-editor-prop="textScaleX"]').dispatchEvent('change');assert.equal((await layer('text')).textScaleX,1.8);
  const event=page.waitForEvent('download');await page.locator('#save-project').click();await(await event).saveAs(resolve('artifacts','text-stretch.fold'));
  const saved=await page.evaluate(()=>window.__foldStudio.project);await page.reload();await page.waitForSelector('html[data-ready="true"]');assert.deepEqual(await page.evaluate(()=>window.__foldStudio.project),saved);
  checks.push('undo/redo, numeric glyph scale and refresh preserve stretch and image dimensions');
  mkdirSync('artifacts',{recursive:true});await select('text');await page.screenshot({path:'artifacts/text-transform-controls.png'});writeFileSync('artifacts/text-transform-report.json',JSON.stringify({checks,errors},null,2));assert.deepEqual(errors,[]);console.log(checks.join('\n'));
}catch(e){await page?.screenshot({path:'artifacts/text-transform-failure.png'}).catch(()=>{});throw e;}finally{await browser.close();await server.close();}
