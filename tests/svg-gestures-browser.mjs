import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const directory=process.env.FOLD_TEST_ARTIFACTS??'artifacts/svg-gestures';mkdirSync(directory,{recursive:true});
const results=[];
const rectangle='<rect id="target" x="20" y="20" width="40" height="25" fill="#c35"/>';
const fixtures=[
  ['plain',rectangle],
  ['translated-parent',`<g transform="translate(12 9)">${rectangle}</g>`],
  ['scaled-parent',`<g transform="translate(12 9) scale(.7 1.3)">${rectangle}</g>`],
  ['rotated-parent',`<g transform="translate(35 9) rotate(25)">${rectangle}</g>`],
  ['own-matrix',rectangle.replace('fill=', 'transform="matrix(.8 .2 -.1 1.3 10 4)" fill=')],
  ['nested-viewport',`<svg x="12" y="9" width="90" height="65" viewBox="0 0 140 100">${rectangle}</svg>`],
  ['group',`<g id="target" transform="translate(12 9) rotate(12) scale(.9 1.1)">${rectangle.replace('id="target"','')}</g>`],
  ['text','<text id="target" x="20" y="40" font-size="12" fill="#c35" transform="translate(10 3) scale(1.3 .8)">Fold test</text>'],
  ['css-transform',rectangle.replace('fill=','style="transform:translate(10px,3px) rotate(15deg);transform-origin:40px 30px" fill=')],
  ['mirrored-parent',`<g transform="translate(100 9) scale(-1 .9)">${rectangle}</g>`],
];
const near=(actual,expected,message,tolerance=.25)=>assert.ok(Math.abs(actual-expected)<tolerance,`${message}: expected ${expected}, got ${actual}`);
async function drag(page,from,dx,dy,{shift=false,escape=false}={}){
  if(shift)await page.keyboard.down('Shift');
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+dx,from.y+dy,{steps:9});
  if(escape)await page.keyboard.press('Escape');await page.mouse.up();if(shift)await page.keyboard.up('Shift');
}
const center=box=>({x:box.x+box.width/2,y:box.y+box.height/2});
async function fixture(markup,{inside=false,zoom=1,pan=false}={}){
  const page=await browser.newPage({viewport:{width:1800,height:1100},acceptDownloads:true});page.setDefaultTimeout(9000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();await ready();
  if(inside){await page.locator('#side-inside').click();await ready();}
  await page.locator('#image-input').setInputFiles({name:'gesture.svg',mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="100">${markup}</svg>`)});
  await page.locator('#svgcontent [id$="-target"]').waitFor();
  const ids=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#svgcontent [id]')].filter(n=>n.id.startsWith('import-')).map(n=>[n.id.replace(/^import-[a-f0-9]+-/,''),n.id])));
  const node=id=>page.locator(`[id="${ids[id]??id}"]`);
  async function choose(id,options){
    const label=page.locator(`[data-node-id="${ids[id]??id}"]`),closed=await label.evaluate(node=>{const result=[];for(let p=node.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open)result.unshift(p.querySelector(':scope>summary [data-toggle-node]').dataset.toggleNode);return result;});
    for(const id of closed)await page.locator(`[data-toggle-node="${id}"]`).click();await label.click(options);
  }
  await choose('target');
  if(zoom!==1){const point=center(await node('target').boundingBox());await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,-Math.log(zoom)*1000);}
  if(pan){const host=await page.locator('#editor-host').boundingBox();await page.locator('#tool-pan').click();await drag(page,{x:host.x+host.width*.7,y:host.y+150},32,-17);await page.locator('#tool-select').click();}
  return {page,ids,node,choose,ready,errors};
}
const corners=locator=>locator.evaluate(node=>{const b=node.getBBox(),m=node.getScreenCTM();return [[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]].map(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(m);return {x:p.x,y:p.y};});});
async function check(name,markup,action,options){
  if(process.env.FOLD_GESTURE_CASE&&!name.includes(process.env.FOLD_GESTURE_CASE))return;
  console.log('Starting '+name);let test;
  try{test=await fixture(markup,options);await action(test);assert.deepEqual(test.errors,[]);results.push({name,passed:true});}
  catch(error){results.push({name,passed:false,error:error.stack,errors:test?.errors});await test?.page.screenshot({path:resolve(directory,name+'.png'),timeout:2000}).catch(()=>{});}
  finally{await test?.page.close();writeFileSync(resolve(directory,'report.json'),JSON.stringify({results},null,2));}
  console.log(results.at(-1));
}
async function moveResize({page,node,choose,ready}){
  const target=node('target'),before=await target.boundingBox();
  await drag(page,center(before),40,25);
  const moved=await target.boundingBox();near(moved.x-before.x,40,'horizontal drag');near(moved.y-before.y,25,'vertical drag');
  await drag(page,center(moved),-17,23);
  const movedTwice=await target.boundingBox();near(movedTwice.x-moved.x,-17,'second horizontal drag');near(movedTwice.y-moved.y,23,'second vertical drag');
  await page.locator('#undo').click();await ready();near((await target.boundingBox()).x,moved.x,'undo second move');
  await page.locator('#redo').click();await ready();near((await target.boundingBox()).x,movedTwice.x,'redo second move');await choose('target');
  const vertices=await corners(target),grip=page.locator('#selectorGrip_resize_se'),handle=center(await grip.boundingBox());
  await drag(page,handle,30,18);const resized=await corners(target);
  near(resized[0].x,vertices[0].x,'resize fixed opposite anchor x',1);near(resized[0].y,vertices[0].y,'resize fixed opposite anchor y',1);
  near(resized[2].x-vertices[2].x,30,'resize tracks pointer x',1);near(resized[2].y-vertices[2].y,18,'resize tracks pointer y',1);
  const end=center(await grip.boundingBox());near(end.x-handle.x,30,'handle tracks pointer x',2);near(end.y-handle.y,18,'handle tracks pointer y',2);
  await page.locator('#undo').click();await ready();const undone=await corners(target);near(undone[2].x,vertices[2].x,'undo resize',1);
  await page.locator('#redo').click();await ready();near((await corners(target))[2].x,resized[2].x,'redo resize',1);
}
try{
  for(const [name,markup]of fixtures)await check(name,markup,moveResize);
  await check('extra-svg-element',`<svg id="target" x="12" y="9" width="90" height="65" viewBox="3 2 140 100">${rectangle.replace('id="target"','')}</svg>`,moveResize);
  await check('extra-image','<image id="target" x="20" y="20" width="40" height="25" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8p8AAAAASUVORK5CYII="/>',moveResize);
  await check('extra-symbol-use','<defs><symbol id="tile" viewBox="0 0 40 25"><rect width="40" height="25" fill="#c35"/></symbol></defs><use id="target" href="#tile" x="20" y="20" width="40" height="25"/>',moveResize);
  for(const [name,options]of [['zoom-in',{zoom:2.2}],['zoom-out',{zoom:.6}],['panned',{pan:true}],['inside',{inside:true}],['inside-zoom-pan',{inside:true,zoom:1.7,pan:true}]])await check(name,fixtures[4][1],moveResize,options);
  for(const dir of ['nw','n','ne','e','se','s','sw','w'])await check('handle-'+dir,fixtures[4][1],async({page,node})=>{
    const target=node('target'),before=await corners(target),grip=page.locator('#selectorGrip_resize_'+dir),start=center(await grip.boundingBox());
    const delta={x:dir.includes('w')?-21:dir.includes('e')?21:0,y:dir.includes('n')?-14:dir.includes('s')?14:0};
    await drag(page,start,delta.x,delta.y);const end=center(await grip.boundingBox());
    // Side handles move along their transformed local axis, not a screen axis.
    if(dir.length===2){near(end.x-start.x,delta.x,dir+' grip x',2);near(end.y-start.y,delta.y,dir+' grip y',2);}
    const after=await corners(target);assert.ok(Math.max(...after.map((p,i)=>Math.hypot(p.x-before[i].x,p.y-before[i].y)))>5,'resize did not change object');
  });
  await check('shift-and-cancel',fixtures[4][1],async({page,node})=>{
    const target=node('target'),box=await target.boundingBox(),grip=page.locator('#selectorGrip_resize_se');
    await drag(page,center(await grip.boundingBox()),28,8,{shift:true});const after=await target.boundingBox();near(after.width/after.height,box.width/box.height,'Shift aspect ratio',.002);
    await drag(page,center(after),33,22,{escape:true});const cancelled=await target.boundingBox();near(cancelled.x,after.x,'cancel move x');near(cancelled.y,after.y,'cancel move y');
    await drag(page,center(await grip.boundingBox()),24,15,{escape:true});near((await target.boundingBox()).width,after.width,'cancel resize');
  });
  await check('cross-parent-multiselect',`<g transform="translate(5 8) scale(.7 1.1)">${rectangle}</g><g transform="translate(70 30) rotate(20)"><rect id="other" width="25" height="18" fill="#38c"/></g>`,async({page,node,choose,ready})=>{
    await choose('other',{modifiers:['Control']});const a=node('target'),b=node('other'),before=await Promise.all([a.boundingBox(),b.boundingBox()]);
    assert.equal(await page.evaluate(()=>window.svgCanvas.getSelectedElements().filter(Boolean).length),2);
    await drag(page,center(before[0]),39,21);
    for(const [i,object]of [a,b].entries()){const box=await object.boundingBox();near(box.x-before[i].x,39,'multi move x');near(box.y-before[i].y,21,'multi move y');}
    await page.locator('#undo').click();await ready();near((await a.boundingBox()).x,before[0].x,'multi undo A');near((await b.boundingBox()).x,before[1].x,'multi undo B');
  });
  await check('extra-release-outside',rectangle,async({page,node})=>{
    const target=node('target'),before=await target.boundingBox(),from=center(before),host=await page.locator('#editor-host').boundingBox();
    const to={x:host.x+host.width+10,y:from.y+27};await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();
    const moved=await target.boundingBox();near(moved.x-before.x,to.x-from.x,'outside release x');near(moved.y-before.y,27,'outside release y');
    await page.mouse.move(from.x,from.y);assert.equal(await page.evaluate(()=>window.svgCanvas.getStarted()),false);near((await target.boundingBox()).x,moved.x,'drag remained active after release');
  });
  await check('extra-save-reopen',fixtures[8][1],async({page,node,ready})=>{
    const target=node('target');await drag(page,center(await target.boundingBox()),37,19);await drag(page,center(await page.locator('#selectorGrip_resize_se').boundingBox()),22,14);
    const before=await target.boundingBox(),artwork=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project.svgArtwork)),download=page.waitForEvent('download');await page.locator('#save-project').click();const file=await download,path=resolve(directory,'gestures.fold');await file.saveAs(path);
    await page.locator('#undo').click();await ready();await page.locator('#project-input').setInputFiles(path);
    await page.waitForFunction(artwork=>JSON.stringify(window.__foldStudio.project.svgArtwork)===artwork,artwork);await ready();
    const after=await target.boundingBox();for(const key of ['x','y','width','height'])near(after[key],before[key],'.fold round-trip '+key,1);
  });
  await check('extra-path-nodes-after-scale','<g transform="translate(12 8) rotate(15)"><path id="target" transform="matrix(.8 .2 -.1 1.3 10 4)" d="M20 20L60 20L40 45Z" fill="#c35"/></g>',async({page})=>{
    await drag(page,center(await page.locator('#selectorGrip_resize_se').boundingBox()),22,14);
    await page.locator('#edit-menu-toggle').click();await page.locator('[data-action="nodes"]').click();
    const grip=page.locator('circle[id^="pathpointgrip_"]').filter({visible:true}).first(),before=await grip.boundingBox();
    await drag(page,center(before),20,12);const after=await grip.boundingBox();near(after.x-before.x,20,'scaled path node x');near(after.y-before.y,12,'scaled path node y');
  });
}finally{await browser.close();await server?.close();}
assert.ok(results.length>0);assert.equal(results.filter(result=>!result.passed).length,0,JSON.stringify(results.filter(result=>!result.passed),null,2));
console.log(`SVG pointer gestures: ${results.length} scenarios passed.`);
