import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';
import {makeDieline} from '../src/geometry.js';
const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL==='offline'?pathToFileURL(resolve('折间.html')).href:process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const directory=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/snapping/verified');mkdirSync(directory,{recursive:true});
const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1800,height:1100},acceptDownloads:true}),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
const el=(tag,attrs={},children=[])=>({tag,attrs:Object.fromEntries(Object.entries(attrs).map(([key,value])=>[key,String(value)])),children});
const node=id=>page.locator('#svgcontent #'+id),bounds=async id=>{const b=await node(id).boundingBox();return {...b,right:b.x+b.width,bottom:b.y+b.height,cx:b.x+b.width/2,cy:b.y+b.height/2};};
const near=(a,b,message,tolerance=.65)=>assert.ok(Math.abs(a-b)<tolerance,`${message}: ${a} != ${b}`);
const choose=(id,add=false)=>page.evaluate(({id,add})=>window.__foldStudio.nativeEditor.select(document.querySelector('#svgcontent #'+id),add),{id,add});
let serial=0,currentPanel;
async function fixture({side='outside',variant='',zoom=1}={}){
  const project=newProject();project.dimensions={length:240,depth:80,height:180};project.layers=[];project.name='Snap '+serial++;
  const d=makeDieline(project.type,project.dimensions),p=d.panels.find(p=>p.id===d.rootId);currentPanel=p;
  let target=el('rect',{id:'target',x:p.x+18,y:p.y+22,width:18,height:12,fill:'#a34172'}),peer=el('rect',{id:'peer',x:p.x+70,y:p.y+65,width:18,height:12,fill:'#457a51'}),others=[];
  if(variant==='hidden')peer.attrs.display='none';if(variant==='locked')peer.attrs['data-locked']='true';
  if(variant==='rotated')target.attrs.transform=`rotate(27 ${p.x+27} ${p.y+28})`;
  if(variant==='text')target=el('text',{id:'target',x:p.x+18,y:p.y+34,'font-size':12,fill:'#a34172'},['SNAP']);
  if(variant==='image'){
    const href=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=60;c.height=40;const ctx=c.getContext('2d');ctx.fillStyle='#ab4768';ctx.fillRect(0,0,60,40);return c.toDataURL('image/png');});target=el('image',{id:'target',x:p.x+18,y:p.y+22,width:18,height:12,href});
  }
  if(variant==='svg-reference')peer=el('svg',{id:'peer-viewport',width:d.width,height:d.height,viewBox:`0 0 ${d.width} ${d.height}`},[peer]);
  if(variant==='css'){target.css={transform:`rotate(12deg) scale(.9,1.2)`,'transform-origin':`${p.x+27}px ${p.y+28}px`};}
  if(variant==='nested')target=el('svg',{id:'viewport',x:0,y:0,width:d.width,height:d.height,viewBox:`0 0 ${d.width} ${d.height}`},[el('g',{transform:'translate(2 3) scale(.9 1.1)'},[target])]);
  if(variant==='multi')others=[el('rect',{id:'third',x:p.x+95,y:p.y+100,width:12,height:12,fill:'#6677ab'})];
  if(variant==='between'||variant==='repeat'){
    const y=p.y+35;target=el('rect',{id:'target',x:p.x+(variant==='between'?30:75),y,width:10,height:10,fill:'#a34172'});
    peer=el('rect',{id:'peer',x:p.x+(variant==='between'?15:13),y,width:10,height:10,fill:'#457a51'});others=[el('rect',{id:'third',x:p.x+(variant==='between'?65:35),y,width:10,height:10,fill:'#6677ab'})];
  }
  project.svgArtwork=Object.fromEntries(['outside','inside'].map(s=>[s,{viewBox:[d.minX,d.minY,d.width,d.height],nodes:[peer,...others,target]}]));
  await page.locator('#project-input').setInputFiles({name:'snap.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(name=>window.__foldStudio.project.name===name,project.name);await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  await page.locator('#side-'+side).click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  await page.evaluate(()=>{window.__foldStudio.nativeEditor.setSnapping(true);window.__foldStudio.nativeEditor.run('fit');});await choose('target');
  if(zoom!==1){const b=await bounds('target');await page.evaluate(({factor,x,y})=>{const api=window.__foldStudio.nativeEditor,r=document.querySelector('#canvas-container').getBoundingClientRect();api.zoom(factor,x-r.left,y-r.top);},{factor:zoom,x:b.cx,y:b.cy});}
}
async function drag(dx,dy,{id='target',ctrl=false,shift=false,alt=false,release=true,grip}={}){
  const b=grip?await page.locator(grip).boundingBox():await bounds(id),start={x:b.x+b.width/2,y:b.y+b.height/2};
  if(ctrl)await page.keyboard.down('Control');if(shift)await page.keyboard.down('Shift');if(alt)await page.keyboard.down('Alt');
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+dx,start.y+dy,{steps:9});
  if(release){await page.mouse.up();if(ctrl)await page.keyboard.up('Control');if(shift)await page.keyboard.up('Shift');if(alt)await page.keyboard.up('Alt');}
  return start;
}
async function check(name,run){if(process.env.FOLD_SNAP_CASE&&!process.env.FOLD_SNAP_CASE.split(',').includes(name))return;try{await run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});await page.screenshot({path:resolve(directory,name+'-failure.png')});await page.mouse.up();await page.keyboard.up('Control');await page.keyboard.up('Shift');await page.keyboard.up('Alt');}console.log(results.at(-1));}
const handlePoint=async(dir)=>node('target').evaluate((n,dir)=>{const b=n.getBBox(),m=n.getScreenCTM(),p=new DOMPoint(dir.includes('w')?b.x:dir.includes('e')?b.x+b.width:b.x+b.width/2,dir.includes('n')?b.y:dir.includes('s')?b.y+b.height:b.y+b.height/2).matrixTransform(m);return{x:p.x,y:p.y};},dir);
try{
  await page.goto(url);await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  for(const variant of ['', 'nested','css','rotated','text','image','svg-reference'])await check('move-'+(variant||'normal'),async()=>{
    await fixture({variant});const a=await bounds('target'),b=await bounds('peer');await drag(b.x-a.right-3,0,{release:false});near((await bounds('target')).right,b.x,'right edge snaps to peer');assert.ok(await page.locator('#fold-snap-guides [data-snap-kind="object"]').count());await page.screenshot({path:resolve(directory,'move-'+(variant||'normal')+'.png')});await page.mouse.up();assert.equal(await page.locator('#fold-snap-guides').count(),0);
  });
  await check('two-axis-center',async()=>{await fixture();const a=await bounds('target'),b=await bounds('peer');await drag(b.cx-a.cx+2,b.cy-a.cy+2);const c=await bounds('target');near(c.cx,b.cx,'center X');near(c.cy,b.cy,'center Y');});
  for(const side of ['outside','inside'])await check('panel-'+side,async()=>{
    await fixture({side});const target=await page.evaluate(p=>{const api=window.__foldStudio.nativeEditor,d=window.__foldStudio.geometry,x=window.__foldStudio.selection.side==='inside'?d.minX+d.maxX-p.x-p.w:p.x;const q=new DOMPoint(x+p.w/2,p.y+p.h/2).matrixTransform(api.wrapper.getScreenCTM());return{x:q.x,y:q.y};},currentPanel),a=await bounds('target');await drag(target.x-a.cx+2,0);near((await bounds('target')).cx,target.x,'panel center respects inside mirror');
  });
  await check('ctrl-bypass-and-release',async()=>{
    await fixture();const a=await bounds('target'),b=await bounds('peer');await drag(b.x-a.right-3,0,{release:false});near((await bounds('target')).right,b.x,'initial snap');await page.keyboard.down('Control');assert.equal(await page.locator('#fold-snap-guides').count(),0);near((await bounds('target')).right,b.x-3,'Ctrl restores the actual pointer delta',1);await page.keyboard.up('Control');near((await bounds('target')).right,b.x,'release Ctrl resumes snapping');await page.mouse.up();
  });
  await check('shift-constrained-move',async()=>{await fixture();const a=await bounds('target'),b=await bounds('peer'),delta=b.x-a.right-2;await drag(delta,delta,{shift:true,release:false});const c=await bounds('target');near(c.x-a.x,c.y-a.y,'diagonal constraint remains exact',.01);assert.ok(await page.locator('#fold-snap-guides').count());await page.mouse.up();await page.keyboard.up('Shift');});
  await check('outside-threshold-and-disabled',async()=>{await fixture();let a=await bounds('target'),b=await bounds('peer');await drag(b.x-a.right-12,0);near((await bounds('target')).right,b.x-12,'outside capture radius',1);await fixture();await page.evaluate(()=>window.__foldStudio.nativeEditor.setSnapping(false));a=await bounds('target');b=await bounds('peer');await drag(b.x-a.right-2,0);near((await bounds('target')).right,b.x-2,'disabled snap keeps actual pointer position',1);assert.equal(await page.locator('#fold-snap-guides').count(),0);});
  await check('resize-edge',async()=>{await fixture();const a=await bounds('target'),b=await bounds('peer');await drag(b.x-a.right-2,0,{grip:'#selectorGrip_resize_e'});const c=await bounds('target');near(c.right,b.x,'resize edge');near(c.x,a.x,'fixed opposite edge');});
  await check('resize-corner',async()=>{await fixture();const a=await bounds('target'),b=await bounds('peer');await drag(b.x-a.right-2,b.y-a.bottom-2,{grip:'#selectorGrip_resize_se'});const c=await bounds('target');near(c.right,b.x,'resize corner X');near(c.bottom,b.y,'resize corner Y');near(c.x,a.x,'fixed corner X');near(c.y,a.y,'fixed corner Y');});
  await check('resize-shift',async()=>{await fixture();const a=await bounds('target'),b=await bounds('peer'),k=(b.x-a.x)/a.width;await drag(a.width*(k-1)-2,a.height*(k-1)-2,{grip:'#selectorGrip_resize_se',shift:true});const c=await bounds('target');near(c.right,b.x,'uniform resize snaps to X guide');near(c.width/c.height,a.width/a.height,'Shift retains aspect ratio',.001);});
  await check('resize-rotated',async()=>{await fixture({variant:'rotated'});const a=await handlePoint('e'),b=await bounds('peer'),vector=await node('target').evaluate(n=>{const m=n.getScreenCTM();return{x:m.a,y:m.b};}),dx=b.x-a.x-2;await drag(dx,dx*vector.y/vector.x,{grip:'#selectorGrip_resize_e'});near((await handlePoint('e')).x,b.x,'rotated side handle snaps without changing angle');});
  for(const variant of ['between','repeat'])await check('spacing-'+variant,async()=>{await fixture({variant});const a=await bounds('target'),b=await bounds('peer'),c=await bounds('third'),left=variant==='between'?(b.right+c.x-a.width)/2:c.right+(c.x-b.right);await drag(left-a.x+2,0,{release:false});near((await bounds('target')).x,left,'equal spacing');assert.ok(await page.locator('#fold-snap-guides [data-snap-kind="spacing"] text').count());await page.screenshot({path:resolve(directory,'spacing-'+variant+'.png')});await page.mouse.up();});
  for(const variant of ['hidden','locked'])await check('ignore-'+variant,async()=>{await fixture({variant});const a=await bounds('target'),b=await node('peer').evaluate(n=>{const p=new DOMPoint(Number(n.getAttribute('x')),Number(n.getAttribute('y'))).matrixTransform(window.__foldStudio.nativeEditor.wrapper.getScreenCTM());return{x:p.x};});await drag(b.x-a.right-3,0);near((await bounds('target')).right,b.x-3,'non-editable reference is ignored',1);});
  for(const zoom of [.75,2])await check('zoom-'+zoom,async()=>{await fixture({zoom});const a=await bounds('target'),b=await bounds('peer');await drag(b.x-a.right-3,0);near((await bounds('target')).right,b.x,'screen-space threshold stays stable');});
  await check('multi-selection',async()=>{await fixture({variant:'multi'});await choose('peer',true);const a=await bounds('target'),b=await bounds('peer'),c=await bounds('third');await drag(c.x-b.right-3,15);const x=await bounds('target'),y=await bounds('peer');near(y.right,c.x,'multi-selection edge');near(y.x-x.x,b.x-a.x,'relative arrangement');});
  await check('alt-copy',async()=>{await fixture();const a=await bounds('target'),b=await bounds('peer');await drag(b.x-a.right-3,0,{alt:true});const id=await page.evaluate(()=>window.svgCanvas.getSelectedElements().find(Boolean).id);near((await bounds(id)).right,b.x,'copy aligns');near((await bounds('target')).x,a.x,'original remains still');});
  await check('undo-cancel-and-export',async()=>{await fixture();const a=await bounds('target'),b=await bounds('peer'),source=await node('target').evaluate(n=>n.outerHTML);await drag(b.x-a.right-3,0,{release:false});assert.ok(await page.locator('#fold-snap-guides').count());assert.ok(!(await page.evaluate(()=>window.__foldStudio.nativeEditor.source())).includes('fold-snap-guides'));await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await node('target').evaluate(n=>n.outerHTML),source);assert.equal(await page.locator('#fold-snap-guides').count(),0);await choose('target');await drag(b.x-a.right-3,0);await page.locator('#undo').click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();near((await bounds('target')).x,a.x,'undo');await page.locator('#redo').click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();near((await bounds('target')).right,b.x,'redo');});
  await check('interrupted-guides',async()=>{for(const interruption of ['wheel','blur']){await fixture();const a=await bounds('target'),b=await bounds('peer'),source=await node('target').evaluate(n=>n.outerHTML);await drag(b.x-a.right-3,0,{release:false});assert.ok(await page.locator('#fold-snap-guides').count());if(interruption==='wheel')await page.mouse.wheel(0,-40);else await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();assert.equal(await page.locator('#fold-snap-guides').count(),0);assert.equal(await node('target').evaluate(n=>n.outerHTML),source);}});
  await check('cmyk-dark',async()=>{await fixture({variant:'image'});await page.evaluate(()=>window.__foldStudio.setTheme('dark'));await page.locator('#print-settings').click();await page.locator('#print-document-mode').selectOption('cmyk');await page.locator('#apply-print-settings').click();await page.waitForFunction(()=>document.querySelector('#editor-host').dataset.proofReady==='true');const a=await bounds('target'),b=await bounds('peer');await drag(b.x-a.right-3,0,{release:false});near((await bounds('target')).right,b.x,'CMYK image snaps');await page.screenshot({path:resolve(directory,'cmyk-dark.png')});await page.mouse.up();assert.equal(await page.locator('#fold-snap-guides').count(),0);});
  await check('preference-controls',async()=>{await fixture();await page.locator('#edit-menu-toggle').click();await page.locator('#smart-snapping-toggle').click();assert.equal(await page.evaluate(()=>window.__foldStudio.nativeEditor.snapping),false);await page.reload();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();assert.equal(await page.evaluate(()=>window.__foldStudio.nativeEditor.snapping),false);await page.locator('#editor-host').focus();await page.keyboard.press('Shift+F10');await page.locator('#canvas-context-menu [data-context-command="snap"]').click();assert.equal(await page.evaluate(()=>window.__foldStudio.nativeEditor.snapping),true);});
  assert.deepEqual(errors,[]);assert.ok(results.every(row=>row.passed),'snapping browser regressions');
}finally{writeFileSync(resolve(directory,'report.json'),JSON.stringify({results,errors},null,2));await browser.close();await server?.close();}
