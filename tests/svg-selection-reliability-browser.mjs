import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';
import {makeDieline,BOX_TYPES} from '../src/geometry.js';
const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL==='offline'?pathToFileURL(resolve('折间.html')).href:process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const directory=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/selection-reliability/verified');mkdirSync(directory,{recursive:true});
const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1800,height:1100}}),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
const el=(tag,attrs={},children=[])=>({tag,attrs:Object.fromEntries(Object.entries(attrs).map(([key,value])=>[key,String(value)])),children});
const node=id=>page.locator('#svgcontent #'+id),selected=()=>page.evaluate(()=>window.svgCanvas.getSelectedElements().filter(Boolean).map(n=>n.id));
const choose=(id,add=false)=>page.evaluate(({id,add})=>window.__foldStudio.nativeEditor.select(document.querySelector('#svgcontent #'+id),add),{id,add});
async function fixture({type='carton',side='outside',nested=false,paths=false,paint}={}){
  const project=newProject();project.type=type;project.dimensions={...BOX_TYPES[type].defaults};project.name='Selection '+Math.random();project.layers=[];
  const d=makeDieline(type,project.dimensions),p=d.panels.find(p=>p.id===d.rootId),x=p.x+10,y=p.y+15;
  const shapes=[paths?el('path',{id:'one',d:`M${x} ${y}h20v15h-20z`,fill:'#995566'}):el('rect',{id:'one',x,y,width:20,height:15,fill:'#995566'}),el('rect',{id:'two',x:x+35,y:y+25,width:18,height:12,fill:'#446655'})];
  if(paint){
    if(paint==='circle')shapes[0]=el('circle',{id:'one',cx:x+12,cy:y+12,r:12,fill:'#995566'});
    if(paint==='outline')shapes[0]=el('rect',{id:'one',x,y,width:25,height:25,fill:'none',stroke:'#995566','stroke-width':1});
    if(paint==='hole')shapes[0]=el('path',{id:'one',d:`M${x} ${y}h30v30h-30z M${x+7} ${y+7}h16v16h-16z`,fill:'#995566','fill-rule':'evenodd'});
    if(paint==='rotated')shapes[0]=el('rect',{id:'one',x,y,width:30,height:12,fill:'#995566',transform:`rotate(40 ${x+15} ${y+6})`});
    if(paint==='line')shapes[0]=el('line',{id:'one',x1:x,y1:y,x2:x,y2:y+25,stroke:'#995566','stroke-width':1,fill:'none'});
  }
  const siblings=el('g',{id:'other',transform:'translate(0 0)'},[el('rect',{id:'three',x:x+65,y:y+55,width:12,height:10,fill:'#8655aa'})]);
  project.svgArtwork=Object.fromEntries(['outside','inside'].map(key=>[key,{viewBox:[d.minX,d.minY,d.width,d.height],nodes:[nested?el('svg',{id:'viewport',x:0,y:0,width:d.width,height:d.height,viewBox:`${d.minX} ${d.minY} ${d.width} ${d.height}`},[el('g',{id:'inner'},shapes)]):el('g',{id:'inner'},shapes),siblings]}]));
  await page.locator('#project-input').setInputFiles({name:'selection.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(name=>window.__foldStudio.project.name===name,project.name);await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  if(side==='inside'){await page.locator('#side-inside').click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();}
  await choose('one');
}
async function marquee(box,{shift=false,reverse=false,padding=5}={}){
  const a={x:box.x-padding,y:box.y-padding},b={x:box.x+box.width+padding,y:box.y+box.height+padding};
  if(shift)await page.keyboard.down('Shift');await page.mouse.move(reverse?b.x:a.x,reverse?b.y:a.y);await page.mouse.down();await page.mouse.move(reverse?a.x:b.x,reverse?a.y:b.y,{steps:7});
  const rubber=await page.evaluate(()=>{const r=window.svgCanvas.getRubberBox()?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;});
  await page.mouse.up();if(shift)await page.keyboard.up('Shift');return {a,b,rubber};
}
async function check(name,action){
  try{await action();results.push({name,passed:true});}
  catch(error){await page.screenshot({path:resolve(directory,name+'-failure.png')});results.push({name,passed:false,error:error.message,selection:await selected()});}
}
try{
  await page.goto(url);await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  await page.evaluate(()=>window.__foldStudio.nativeEditor.setSnapping(false)); // Selection checks use exact, free-drag distances.
  for(const options of [{},{side:'inside'},{type:'lidbox'},{side:'inside',nested:true}])await check('marquee-'+(options.type??'carton')+'-'+(options.side??'outside')+(options.nested?'-nested':''),async()=>{
    await fixture(options);const before=await page.evaluate(()=>({source:window.__foldStudio.nativeEditor.source(),history:window.svgCanvas.undoMgr.getUndoStackSize()}));
    const bounds=await node('one').boundingBox(),drag=await marquee(bounds);
    assert.ok(Math.abs(drag.rubber.x-drag.a.x)<1&&Math.abs(drag.rubber.y-drag.a.y)<1,'marquee must follow actual pointer on both sides');assert.ok((await selected()).includes('one'),'marquee must hit the visible object');
    assert.equal(await page.evaluate(()=>window.__foldStudio.nativeEditor.source()),before.source);assert.equal(await page.evaluate(()=>window.svgCanvas.undoMgr.getUndoStackSize()),before.history);
  });
  await check('single-click-after-multi',async()=>{
    await fixture();await choose('two',true);assert.equal((await selected()).length,2);await node('one').click();assert.deepEqual(await selected(),['one'],'ordinary click without dragging must end an old multi-selection');
  });
  await check('path-click-remains-selection',async()=>{
    await fixture({paths:true});await node('one').click();await node('one').click();assert.equal(await page.evaluate(()=>window.svgCanvas.getMode()),'select','repeated single clicks must not silently switch to node editing');
    await node('one').dblclick();assert.equal(await page.evaluate(()=>window.svgCanvas.getMode()),'pathedit');await page.keyboard.press('Escape');await choose('one');await marquee(await node('two').boundingBox());assert.ok((await selected()).includes('two'));
  });
  await check('modifier-click-and-multi-drag',async()=>{
    await fixture();await node('two').click({modifiers:['Shift']});assert.deepEqual(new Set(await selected()),new Set(['one','two']));await node('one').click({modifiers:['Shift']});assert.deepEqual(await selected(),['two']);
    await node('one').click({modifiers:['Control']});assert.deepEqual(new Set(await selected()),new Set(['one','two']));
    const a=await node('one').boundingBox(),b=await node('two').boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2+25,a.y+a.height/2+15,{steps:5});await page.mouse.up();
    assert.ok(Math.abs((await node('one').boundingBox()).x-a.x-25)<1&&Math.abs((await node('two').boundingBox()).x-b.x-25)<1,'drag retains the multi-selection');
  });
  await check('shift-marquee-adds-selection',async()=>{
    await fixture();await marquee(await node('two').boundingBox(),{shift:true});assert.deepEqual(new Set(await selected()),new Set(['one','two']));await marquee(await node('three').boundingBox(),{shift:true});assert.ok((await selected()).length===3);
  });
  for(const paint of ['circle','outline','hole','rotated','line'])await check('painted-hit-'+paint,async()=>{
    await fixture({paint});const b=await node('one').boundingBox();
    await page.evaluate(()=>{window.svgCanvas.setContext(window.__foldStudio.nativeEditor.wrapper);window.svgCanvas.clearSelection();});
    const empty=paint==='outline'||paint==='hole'?{x:b.x+b.width/2-2,y:b.y+b.height/2-2,width:4,height:4}:{x:b.x+1,y:b.y+1,width:2,height:2};
    if(paint!=='line'){await page.mouse.click(empty.x+empty.width/2,empty.y+empty.height/2);assert.deepEqual(await selected(),[],'clicking an unpainted area must not select the group');await marquee(empty,{padding:0});assert.deepEqual(await selected(),[],'unpainted area must not select the entire group');}
    await marquee(b);assert.ok((await selected()).length>0,'painted shape remains selectable');
  });
  await check('nested-viewport-empty-space',async()=>{
    await fixture({nested:true});await page.evaluate(()=>{window.svgCanvas.setContext(window.__foldStudio.nativeEditor.wrapper);window.svgCanvas.clearSelection();});
    const a=await node('one').boundingBox(),b=await node('two').boundingBox();await marquee({x:a.x+a.width+3,y:a.y+2,width:Math.max(1,b.x-a.x-a.width-6),height:3},{padding:0});assert.deepEqual(await selected(),[],'a transparent SVG viewport is not an object hit');
  });
  await check('marquee-beyond-last-parent',async()=>{
    await fixture();await marquee(await node('three').boundingBox());assert.ok((await selected()).some(id=>id==='three'||id==='other'),'marquee must not be trapped in the last selected object parent');
  });
  await check('click-beyond-last-parent',async()=>{
    await fixture();const b=await node('three').boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);assert.ok((await selected()).some(id=>id==='three'||id==='other'),'objects in other groups must remain clickable without leaving an invisible isolation mode');
  });
  await check('group-blank-space',async()=>{
    await fixture();await page.evaluate(()=>{window.svgCanvas.setContext(window.__foldStudio.nativeEditor.wrapper);window.svgCanvas.clearSelection();});
    const a=await node('one').boundingBox(),b=await node('two').boundingBox();await marquee({x:a.x+a.width+3,y:a.y+2,width:Math.max(1,b.x-a.x-a.width-6),height:3},{padding:0});assert.deepEqual(await selected(),[],'empty space between group members is not painted artwork');
  });
  await check('guides-never-selectable',async()=>{
    await fixture();await page.evaluate(()=>{const c=window.svgCanvas;window.svgCanvas.selectOnly([document.querySelector('#fold-paper-guide'),document.querySelector('#fold-line-guide'),document.querySelector('#fold-line-guide path'),document.querySelector('#canvasBackground'),window.__foldStudio.nativeEditor.wrapper],true);});assert.deepEqual(await selected(),[]);
    await page.evaluate(()=>{const api=window.__foldStudio.nativeEditor;api.select(document.querySelector('#fold-paper-guide path'));});assert.equal(await page.evaluate(()=>window.__foldStudio.nativeEditor.selected?.id??null),null);
    const panel=await page.evaluate(()=>window.__foldStudio.selection.panelId),host=await page.locator('#editor-host').boundingBox();await page.mouse.click(host.x+12,host.y+12);assert.deepEqual(await selected(),[]);assert.equal(await page.evaluate(()=>window.__foldStudio.selection.panelId),panel);
    await page.locator('#editor-host').focus();await page.keyboard.press('Control+a');assert.ok((await selected()).length>0);const allowed=await page.evaluate(()=>window.svgCanvas.getSelectedElements().filter(Boolean).every(n=>n!==window.__foldStudio.nativeEditor.wrapper&&window.__foldStudio.nativeEditor.wrapper.contains(n)));assert.equal(allowed,true);
  });
  await check('interleaved-selection-stress',async()=>{
    await fixture();const before=await page.evaluate(()=>({source:window.__foldStudio.nativeEditor.source(),history:window.svgCanvas.undoMgr.getUndoStackSize()}));
    for(let round=0;round<10;round++){
      await choose('one');await node('two').click({modifiers:['Shift']});const b=await node('one').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+1,b.y+b.height/2+1);await page.mouse.up();assert.deepEqual(await selected(),['one']);
      await marquee(await node('two').boundingBox(),{reverse:round%2===0});assert.ok((await selected()).includes('two'));await page.mouse.wheel(0,round%2?40:-40);await marquee(await node('one').boundingBox());assert.ok((await selected()).includes('one'));
      assert.equal(await page.evaluate(()=>window.svgCanvas.getStarted()),false);assert.equal(await page.evaluate(()=>window.svgCanvas.getMode()),'select');
    }
    assert.equal(await page.evaluate(()=>window.__foldStudio.nativeEditor.source()),before.source);assert.equal(await page.evaluate(()=>window.svgCanvas.undoMgr.getUndoStackSize()),before.history);await page.screenshot({path:resolve(directory,'selection-after-stress.png')});
  });
  console.log(JSON.stringify({results,errors}));assert.ok(results.every(row=>row.passed),'selection reliability regressions');assert.deepEqual(errors,[]);
}finally{writeFileSync(resolve(directory,'report.json'),JSON.stringify({results,errors},null,2));await browser.close();await server?.close();}
