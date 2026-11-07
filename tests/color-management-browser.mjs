import {chooseExport} from './helpers/export-ui.mjs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {newProject,validateProject} from '../src/project.js';
import {makeDieline} from '../src/geometry.js';

const server=process.env.FOLD_TEST_URL?null:await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL==='offline'?pathToFileURL(resolve('折间.html')).href:process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/color-management/browser');mkdirSync(dir,{recursive:true});
const executablePath=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(executablePath)?{executablePath}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1580,height:1050},acceptDownloads:true}),errors=[],checks=[],network=[];
page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
async function download(click,name){const waiting=page.waitForEvent('download');await click();const file=await waiting;const path=resolve(dir,name);await file.saveAs(path);return readFileSync(path);}
async function proofReady(){await page.waitForFunction(()=>document.querySelector('#editor-host').dataset.proofReady==='true'&&document.querySelector('#fold-proof-image')?.style.display!=='none');}
try{
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');assert.equal(await page.evaluate(()=>window.__foldStudio.printColor.ready),true);
  const raster=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=8;const ctx=c.getContext('2d');ctx.fillStyle='#00ff00';ctx.fillRect(0,0,8,8);return c.toDataURL();});
  const project=newProject('carton');project.name='ICC synthetic colors';project.layers=[];project.paper=project.insidePaper='#ffffff';project.panelColors={};project.insidePanelColors={};
  const d=makeDieline(project.type,project.dimensions),p=d.panels.find(p=>p.id==='front'),x=p.x+4,y=p.y+4;
  const node=(tag,attrs,children=[],css)=>({tag,attrs:Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,String(v)])),children,...(css?{css}:{})});
  const asset={viewBox:[d.minX,d.minY,d.width,d.height],nodes:[node('defs',{},[node('linearGradient',{id:'green-gradient'},[node('stop',{offset:'0','stop-color':'#00ff00'}),node('stop',{offset:'1','stop-color':'#0000ff'})])]),node('g',{id:'patches'},[
    node('rect',{id:'solid',x,y,width:20,height:20,fill:'#00ff00'}),
    node('rect',{id:'css-blue',x:x+25,y,width:20,height:20}),
  ])]};
  // Imported CSS paint declarations normalize to SVG presentation attributes.
  asset.nodes[1].children[1]=node('rect',{id:'css-blue',x:x+25,y,width:20,height:20,fill:'rgb(0, 0, 255)'});
  asset.nodes[1].children.push(node('image',{id:'photo',x,y:y+25,width:20,height:20,href:raster}),node('rect',{id:'gradient',x:x+25,y:y+25,width:20,height:20,fill:'url(#green-gradient)'}),node('rect',{id:'alpha',x,y:y+50,width:20,height:20,fill:'#00ff00','fill-opacity':'.5'}),node('rect',{id:'offsheet',x:d.minX-24,y,width:20,height:20,fill:'#ff00ff'}));
  project.version=3;project.svgArtwork={outside:structuredClone(asset),inside:structuredClone(asset)};validateProject(project);
  await page.locator('#project-input').setInputFiles({name:'icc.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await page.waitForFunction(()=>window.__foldStudio.project.name==='ICC synthetic colors');await page.waitForSelector('#editor-host[data-svg-ready="true"]');
  await page.evaluate(()=>window.__foldStudio.setColorMode('rgb'));const before=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project.svgArtwork));
  for(const side of ['outside','inside']){
    await page.locator(`[data-side="${side}"]`).click();await page.evaluate(()=>window.__foldStudio.setColorMode('cmyk'));await proofReady();
    assert.equal(await page.evaluate(()=>getComputedStyle(window.__foldStudio.nativeEditor.wrapper).opacity),'1','proof display must not make source objects semantically hidden');
    const pixels=await page.evaluate(async({x,y,d})=>{
      const image=new Image();image.src=document.querySelector('#fold-proof-image').getAttribute('href');await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
      return [[x+10,y+10],[x+35,y+10],[x+10,y+35],[x+35,y+35],[x+10,y+60]].map(([px,py])=>[...ctx.getImageData(Math.floor((px-d.minX)/d.width*c.width),Math.floor((py-d.minY)/d.height*c.height),1,1).data]);
    },{x,y,d});
    assert.deepEqual(pixels.slice(0,3),[[106,180,63,255],[60,68,146,255],[106,180,63,255]],side+' solid / CSS / image');
    // Independent native LittleCMS proof for the sRGB gradient midpoint 008080.
    assert.ok(pixels[3].slice(0,3).every((c,i)=>Math.abs(c-[27,130,130][i])<=4),side+' gradient midpoint after compositing');
    assert.ok(pixels[4].slice(0,3).every((c,i)=>Math.abs(c-[173,211,161][i])<=2));
    // Overlay uses the source viewport, with no extra screen-space transform.
    const host=await page.locator('#editor-host').boundingBox();await page.mouse.move(host.x+host.width*.5,host.y+host.height*.5);await page.mouse.wheel(0,-180);await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>document.querySelector('#fold-proof-image').getAttribute('transform')===window.__foldStudio.nativeEditor.wrapper.getAttribute('transform')),true);
    await page.evaluate(()=>window.__foldStudio.nativeEditor.zoom(.7));await proofReady();
    const offsheet=await page.locator('#svgcontent [id$="offsheet"]').boundingBox(),shot=await page.screenshot();
    const outsidePixel=await page.evaluate(async({base64,x,y})=>{const im=new Image();im.src='data:image/png;base64,'+base64;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return [...ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data];},{base64:shot.toString('base64'),x:offsheet.x+offsheet.width/2,y:offsheet.y+offsheet.height/2});
    assert.deepEqual(outsidePixel,[255,0,255,255],side+' off-sheet workspace artwork remains visible in source RGB');
    checks.push(side+': ICC for solid, inline CSS, photo, gradient, alpha and zoom');
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project.svgArtwork)),before);checks.push('proof does not bake colors or proof image into project');
  await page.locator('[data-side="outside"]').click();await proofReady();
  const svg=await download(async()=>{await page.locator('#export-toggle').click();await chooseExport(page,'flat','svg',true);},'source.svg');
  assert.ok(svg.toString().includes('#00ff00'));assert.ok(svg.toString().includes('#6ab43f'));assert.ok(!svg.toString().includes('blob:'));checks.push('editable SVG exports CMYK gamut preview without mutating source');
  await page.evaluate(()=>{const api=window.__foldStudio.nativeEditor;api.select(api.wrapper.querySelector('[id$="solid"]'));});
  const sourceBeforeMove=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project.svgArtwork)),oldHref=await page.locator('#fold-proof-image').getAttribute('href');
  const bounds=await page.locator('#svgcontent [id$="solid"]').boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+8,bounds.y+bounds.height/2+10,{steps:6});await page.mouse.up();
  await page.waitForFunction(old=>JSON.stringify(window.__foldStudio.project.svgArtwork)!==old,sourceBeforeMove);await proofReady();await page.waitForFunction(old=>document.querySelector('#fold-proof-image').getAttribute('href')!==old,oldHref);
  await page.keyboard.press('Control+z');await page.waitForFunction(old=>JSON.stringify(window.__foldStudio.project.svgArtwork)===old,sourceBeforeMove);await proofReady();checks.push('real pointer drag and undo remain editable in proof mode');
  await page.locator('#print-settings').click();await page.locator('#print-icc-input').setInputFiles({name:'bad.icc',mimeType:'application/octet-stream',buffer:Buffer.alloc(140)});await page.waitForFunction(()=>document.querySelector('#print-settings-error').textContent.length>0);assert.equal(await page.locator('#print-profile').inputValue(),'fogra39l');
  const missingTables=Buffer.from(readFileSync('src/color-profiles/FOGRA39L_coated.icc'));for(let i=0;i<missingTables.readUInt32BE(128);i++){const p=132+i*12;if(/^[AB]2[AB][012]$/.test(missingTables.toString('ascii',p,p+4)))missingTables.write('xxxx',p);}
  await page.locator('#print-icc-input').setInputFiles({name:'missing-tables.icc',mimeType:'application/octet-stream',buffer:missingTables});await page.locator('#apply-print-settings').click();await page.waitForFunction(()=>/无法读取|转换表/.test(document.querySelector('#print-settings-error').textContent));assert.equal(await page.evaluate(()=>window.__foldStudio.project.printSettings?.profile??'fogra39l'),'fogra39l');
  await page.locator('#print-icc-input').setInputFiles(resolve('src/color-profiles/FOGRA39L_coated.icc'));await page.locator('#print-intent').selectOption('0');await page.locator('#print-bpc').uncheck();await page.locator('#apply-print-settings').click();
  await page.waitForFunction(()=>window.__foldStudio.project.printSettings?.profile==='custom');
  const saved=JSON.parse((await download(()=>page.locator('#save-project').click(),'custom-profile.fold')).toString());assert.equal(saved.printSettings.intent,0);assert.equal(saved.printSettings.blackPointCompensation,false);assert.deepEqual(Buffer.from(saved.printSettings.icc,'base64'),readFileSync('src/color-profiles/FOGRA39L_coated.icc'));
  await page.reload();await page.waitForSelector('html[data-ready="true"]');assert.equal(await page.evaluate(()=>window.__foldStudio.printColor.settings.intent),0);checks.push('invalid ICC rejected; custom ICC + intent + BPC save and reload locally');
  // Restore the built-in relative/BPC profile before the independent TIFF check.
  await page.locator('#print-settings').click();await page.locator('#print-profile').selectOption('fogra39l');await page.locator('#print-intent').selectOption('1');await page.locator('#print-bpc').check();await page.locator('#apply-print-settings').click();
  for(const side of ['outside','inside']){
    await page.locator(`[data-side="${side}"]`).click();await page.locator('#export-toggle').click();await chooseExport(page,'flat','tiff');await page.locator('#export-dpi').selectOption('600');assert.equal(await page.locator('#confirm-export').isDisabled(),true);await page.locator('#export-dpi').selectOption('150');
    const tiff=await download(()=>page.locator('#confirm-export').click(),side+'.tif');const v=new DataView(tiff.buffer,tiff.byteOffset,tiff.length),tags=new Map();for(let i=0;i<v.getUint16(8,true);i++){const a=10+i*12;tags.set(v.getUint16(a,true),{count:v.getUint32(a+4,true),value:v.getUint32(a+8,true)});}
    assert.equal(tags.get(262).value,5);assert.equal(tags.get(277).value,4);const icc=tags.get(34675);assert.deepEqual(tiff.subarray(icc.value,icc.value+icc.count),readFileSync('src/color-profiles/FOGRA39L_coated.icc'));
    const width=tags.get(256).value,offset=tags.get(273).value+(Math.floor((y+10-d.minY)*150/25.4)*width+Math.floor((x+10-d.minX)*150/25.4))*4;assert.deepEqual([...tiff.subarray(offset,offset+4)],[165,0,246,0]);
    assert.deepEqual([...tiff.subarray(tags.get(273).value,tags.get(273).value+4)],[0,0,0,0]);checks.push(side+': CMYK TIFF four-channel ink bytes, ICC and white outside');
  }
  if(process.env.FOLD_TEST_ICC){
    const file=resolve(process.env.FOLD_TEST_ICC),icc=readFileSync(file);
    await page.locator('#print-settings').click();await page.locator('#print-icc-input').setInputFiles(file);await page.locator('#apply-print-settings').click();await proofReady();
    assert.equal(await page.evaluate(()=>window.__foldStudio.project.printSettings.profile),'custom');
    await page.locator('#export-toggle').click();await chooseExport(page,'flat','tiff');
    const tiff=await download(()=>page.locator('#confirm-export').click(),'custom-press.tif'),v=new DataView(tiff.buffer,tiff.byteOffset,tiff.length);
    let found=false;for(let i=0;i<v.getUint16(8,true);i++){const a=10+i*12;if(v.getUint16(a,true)===34675){const count=v.getUint32(a+4,true),offset=v.getUint32(a+8,true);assert.deepEqual(tiff.subarray(offset,offset+count),icc);found=true;}}
    assert.ok(found);checks.push('external print ICC accepted, proofed and embedded unchanged in TIFF');
  }
  const broken={...structuredClone(project),name:'Invalid ICC recovery',printSettings:{profile:'custom',name:'missing-tables.icc',icc:missingTables.toString('base64'),intent:1,blackPointCompensation:true}};
  await page.locator('#project-input').setInputFiles({name:'invalid-profile.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(broken))});await page.waitForFunction(()=>window.__foldStudio.project.name==='Invalid ICC recovery'&&document.querySelector('#toast').textContent.includes('工程已导入'));
  await page.locator('#color-mode-toggle').click();assert.equal(await page.evaluate(()=>window.__foldStudio.colorMode),'rgb');assert.match(await page.locator('#toast').textContent(),/ICC/);
  await chooseExport(page,'flat','png');assert.equal(await page.locator('#export-mode').inputValue(),'rgb');assert.equal(await page.locator('#confirm-export').isEnabled(),true);
  const recoveredRgb=await download(()=>page.locator('#confirm-export').click(),'invalid-icc-rgb.png');assert.equal(recoveredRgb.subarray(1,4).toString(),'PNG');
  await chooseExport(page,'flat','jpg');await page.locator('#export-mode').selectOption('cmyk');assert.equal(await page.locator('#confirm-export').isDisabled(),true);assert.match(await page.locator('#export-error').textContent(),/ICC/);await page.locator('#export-mode').selectOption('rgb');assert.equal(await page.locator('#confirm-export').isEnabled(),true);await page.keyboard.press('Escape');checks.push('invalid print ICC leaves RGB export usable but explicitly blocks CMYK instead of using a stale profile');
  await page.locator('#print-settings').click();await page.locator('#print-profile').selectOption('fogra39l');await page.locator('#print-document-mode').selectOption('cmyk');await page.locator('#apply-print-settings').click();await proofReady();checks.push('a project with unusable ICC cannot silently proof with a previous profile; valid settings recover it');
  await proofReady();await page.screenshot({path:resolve(dir,'icc-workspace.png')});
  await page.locator('#print-settings').click();await page.screenshot({path:resolve(dir,'icc-settings.png'),animations:'disabled'});await page.locator('#print-settings-dialog [data-close]').first().click();
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__foldStudio.setTheme('slate'));await page.locator('#print-settings').click();
  let box=await page.locator('#print-settings-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);await page.screenshot({path:resolve(dir,'icc-settings-mobile.png'),animations:'disabled'});await page.locator('#print-settings-dialog [data-close]').first().click();
  await page.locator('#export-toggle').click();await chooseExport(page,'flat','tiff');box=await page.locator('#export-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);await page.locator('#export-dialog [data-export-close]').first().click();checks.push('settings and export dialogs remain reachable on mobile in slate theme');
  assert.deepEqual(errors,[]);if(url.startsWith('file:'))assert.deepEqual(network,[]);
  writeFileSync(resolve(dir,'report.json'),JSON.stringify({url,checks,errors,networkCount:network.length},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors,networkCount:network.length},null,2));
}catch(error){await page.screenshot({path:resolve(dir,'failure.png')}).catch(()=>{});console.error({errors,toast:await page.locator('#toast').textContent().catch(()=>null)});throw error;}
finally{await browser.close();await server?.close();}
