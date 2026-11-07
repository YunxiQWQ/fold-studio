import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdirSync,existsSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';
import {makeDieline} from '../src/geometry.js';
const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL==='offline'?pathToFileURL(resolve('折间.html')).href:process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/marquee-after-drag/verified');mkdirSync(dir,{recursive:true});
const exe=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const variants=(process.env.FOLD_MARQUEE_CASE??'native,drawn,multiple,plain,matrix,rotated,parent,nested').split(','),results=[];
const svgNode=(tag,attrs={},children=[])=>({tag,attrs:Object.fromEntries(Object.entries(attrs).map(([key,value])=>[key,String(value)])),children});
const close=(a,b,message)=>{for(const key of ['x','y','width','height'])assert.ok(Math.abs(a[key]-b[key])<1,`${message} ${key}: ${a[key]} != ${b[key]}`);};
const union=boxes=>({x:Math.min(...boxes.map(b=>b.x)),y:Math.min(...boxes.map(b=>b.y)),width:Math.max(...boxes.map(b=>b.x+b.width))-Math.min(...boxes.map(b=>b.x)),height:Math.max(...boxes.map(b=>b.y+b.height))-Math.min(...boxes.map(b=>b.y))});
async function run(variant){
  const page=await browser.newPage({viewport:{width:1760,height:1080},acceptDownloads:true}),errors=[],network=[],trace=[];page.on('pageerror',e=>errors.push(e.stack));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});page.setDefaultTimeout(15000);
  const project=newProject(),d=makeDieline(project.type,project.dimensions),front=d.panels.find(n=>n.id==='front'),rect=svgNode('rect',{id:'target',x:front.x+15,y:front.y+25,width:40,height:25,fill:'#ba4573'});project.name='Marquee QA '+variant;project.layers=[];
  let nodes=[rect];
  if(variant==='matrix')rect.attrs.transform='matrix(.9 .2 -.1 1.2 12 4)';
  if(variant==='rotated')rect.attrs.transform='rotate(18 90 125)';
  if(variant==='parent')nodes=[svgNode('g',{id:'parent',transform:'translate(10 3) scale(.8 1.1)'},[rect])];
  if(variant==='nested')nodes=[svgNode('svg',{x:5,y:2,width:400,height:350,viewBox:'0 0 364 336'},[rect])];
  if(['native','drawn','multiple'].includes(variant))nodes=[svgNode('rect',{id:'anchor',x:d.minX+5,y:d.minY+5,width:3,height:3,fill:'#aaa'})];
  project.svgArtwork={outside:{viewBox:[d.minX,d.minY,d.width,d.height],nodes}};
  const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor(),element=id=>page.locator(`[id="${id}"]`);let ids=[];
  async function drag(from,dx,dy){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+dx,from.y+dy,{steps:8});await page.mouse.up();}
  async function move(id,dx,dy){const b=await element(id).boundingBox();await drag({x:b.x+b.width/2,y:b.y+b.height/2},dx,dy);}
  async function snapshot(stage){const shapes=await Promise.all(ids.map(async id=>({id,html:await element(id).evaluate(n=>n.outerHTML),box:await element(id).boundingBox()}))),state=await page.evaluate(()=>({project:JSON.stringify(window.__foldStudio.project),mode:window.svgCanvas.getMode(),started:window.svgCanvas.getStarted(),undo:window.svgCanvas.undoMgr.getUndoStackSize(),selected:window.svgCanvas.getSelectedElements().filter(Boolean).map(n=>n.id)}));const result={stage,shapes,...state};trace.push(result);return result;}
  async function assertUnchanged(before,stage){const after=await snapshot(stage);assert.equal(after.project,before.project,stage+' changed project data');assert.equal(after.undo,before.undo,stage+' added an undo command');for(let i=0;i<ids.length;i++){assert.equal(after.shapes[i].html,before.shapes[i].html,stage+' changed geometry/transform');close(after.shapes[i].box,before.shapes[i].box,stage+' position');}return after;}
  async function marquee(box,reverse=false){const a={x:box.x-12,y:box.y-12},b={x:box.x+box.width+12,y:box.y+box.height+12};await page.mouse.move(reverse?b.x:a.x,reverse?b.y:a.y);await page.mouse.down();assert.equal(await page.evaluate(()=>window.svgCanvas.getMode()),'multiselect','expected an actual canvas marquee');await page.mouse.move(reverse?a.x:b.x,reverse?a.y:b.y,{steps:8});await page.mouse.up();await page.waitForTimeout(60);}
  async function choose(id){const label=page.locator(`[data-node-id="${id}"]`),parents=await label.evaluate(n=>{const ids=[];for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open)ids.unshift(p.querySelector(':scope>summary [data-toggle-node]').dataset.toggleNode);return ids;});for(const p of parents)await page.locator(`[data-toggle-node="${p}"]`).click();await label.click();}
  try{
    await page.goto(url);await page.waitForSelector('html[data-ready="true"]');await page.evaluate(()=>window.__foldStudio.nativeEditor.setSnapping(false));await page.locator('#project-input').setInputFiles({name:'marquee.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(name=>window.__foldStudio.project.name===name,project.name);await ready();
    if(variant==='drawn'){
      await page.locator('#add-shape').click();await page.locator('#draw-menu [data-mode="rect"]').click();const p=await page.evaluate(({x,y})=>{const p=new DOMPoint(x,y).matrixTransform(window.__foldStudio.nativeEditor.wrapper.getScreenCTM());return{x:p.x,y:p.y};},{x:front.x+15,y:front.y+25});await drag(p,60,40);await page.waitForFunction(()=>window.svgCanvas.getSelectedElements().some(n=>n?.localName==='rect'&&n.id!=='anchor'));ids=[await page.evaluate(()=>window.svgCanvas.getSelectedElements().find(n=>n?.localName==='rect'&&n.id!=='anchor').id)];
    }else if(['native','multiple'].includes(variant)){
      const count=variant==='multiple'?3:1;
      for(let i=0;i<count;i++){
        await page.locator('#add-shape').click();await page.locator('#insert-rect').click();await ready();await page.waitForFunction(old=>window.svgCanvas.getSelectedElements().some(n=>n&&n.id!=='anchor'&&!old.includes(n.id)),ids);const id=await page.evaluate(old=>window.svgCanvas.getSelectedElements().find(n=>n&&n.id!=='anchor'&&!old.includes(n.id)).id,ids);ids.push(id);
        if(count>1)await move(id,...[[-100,-90],[100,-90],[0,100]][i]);
      }
    }else{ids=['target'];await choose('target');}
    let original,moved;
    if(ids.length===1){original=await element(ids[0]).boundingBox();await move(ids[0],40,25);moved=await element(ids[0]).boundingBox();close(moved,{...original,x:original.x+40,y:original.y+25},'initial move');}
    const before=await snapshot('moved');let bounds=union(before.shapes.map(s=>s.box));
    for(let round=0;round<3;round++){await marquee(bounds,round%2===1);const after=await assertUnchanged(before,'marquee-'+round);for(const id of ids)assert.ok(after.selected.includes(id),'marquee did not select '+id);}
    const host=await page.locator('#editor-host').boundingBox();await marquee({x:host.x+30,y:host.y+40,width:12,height:12});const empty=await assertUnchanged(before,'empty-marquee');assert.deepEqual(empty.selected,[],'empty marquee should clear only selection');
    await page.mouse.move(bounds.x-12,bounds.y-12);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();await assertUnchanged(before,'canceled-marquee');assert.equal(await page.evaluate(()=>window.svgCanvas.getCurBBoxes().length),0,'cancel must clear hit-test cache');
    await marquee(bounds);await assertUnchanged(before,'marquee-after-cancel');
    if(ids.length===1){
      await element(ids[0]).click();close(await element(ids[0]).boundingBox(),moved,'click after marquee');await page.locator('#tool-select').click();await page.locator('#undo').click();await ready();close(await element(ids[0]).boundingBox(),original,'one undo should undo the move');await page.locator('#redo').click();await ready();close(await element(ids[0]).boundingBox(),moved,'redo move');
    }else{
      await move(ids[0],20,15);for(let i=0;i<ids.length;i++)close(await element(ids[i]).boundingBox(),{...before.shapes[i].box,x:before.shapes[i].box.x+20,y:before.shapes[i].box.y+15},'move a marquee selection');const shifted=await snapshot('multi-moved');await marquee(union(shifted.shapes.map(s=>s.box)));await assertUnchanged(shifted,'marquee-after-multi-move');await page.locator('#undo').click();await ready();for(let i=0;i<ids.length;i++)close(await element(ids[i]).boundingBox(),before.shapes[i].box,'one undo should undo the multi-move');
    }
    const saved=page.waitForEvent('download');await page.locator('#save-project').click();const path=resolve(dir,variant+'.fold');await(await saved).saveAs(path);const data=JSON.parse(readFileSync(path,'utf8'));for(const id of ids)assert.ok(JSON.stringify(data.svgArtwork).includes(id));await page.locator('#project-input').setInputFiles(path);await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('工程已导入'));await ready();for(let i=0;i<ids.length;i++)close(await element(ids[i]).boundingBox(),before.shapes[i].box,'save and reopen after marquee');
    assert.deepEqual(errors,[]);if(url.startsWith('file:'))assert.deepEqual(network,[]);results.push({variant,passed:true,objects:ids.length,errors,networkCount:network.length});console.log(variant+': passed');
  }catch(error){await page.screenshot({path:resolve(dir,variant+'-failure.png')}).catch(()=>{});results.push({variant,passed:false,error:error.stack,errors});throw error;}
  finally{writeFileSync(resolve(dir,variant+'-trace.json'),JSON.stringify(trace,null,2));await page.close();}
}
try{for(const variant of variants)await run(variant);console.log(JSON.stringify({results},null,2));}
finally{writeFileSync(resolve(dir,'report.json'),JSON.stringify({results},null,2));await browser.close();await server?.close();}
