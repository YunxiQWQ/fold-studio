import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';
import {makeDieline} from '../src/geometry.js';
const server=process.env.FOLD_TEST_URL?null:await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL==='offline'?pathToFileURL(resolve('折间.html')).href:process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/color-export-modes/browser');mkdirSync(dir,{recursive:true});
const exe=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1560,height:1080},acceptDownloads:true}),errors=[],requests=[],checks=[];let downloads=0;page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});page.on('download',()=>downloads++);
async function download(action,name){const wait=page.waitForEvent('download',{timeout:90000});await action();const file=await wait;const path=resolve(dir,name);await file.saveAs(path);return readFileSync(path);}
const ready=()=>page.waitForSelector('html[data-ready="true"]');
const node=(tag,attrs={},children=[])=>({tag,attrs:Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,String(v)])),children});
try{
  await page.goto(url);await ready();
  const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.fillStyle='#00ff00';x.fillRect(0,0,16,16);x.clearRect(8,0,8,8);return c.toDataURL();});
  const project=newProject();project.version=3;project.name='Color export synthetic';project.layers=[];project.paper=project.insidePaper='#ffffff';project.panelColors={};project.insidePanelColors={};const d=makeDieline(project.type,project.dimensions),front=d.panels.find(p=>p.id==='front'),x=front.x+5,y=front.y+5;
  const asset={viewBox:[d.minX,d.minY,d.width,d.height],nodes:[node('defs',{},[node('linearGradient',{id:'gradient'},[node('stop',{offset:0,'stop-color':'#00ff00'}),node('stop',{offset:1,'stop-color':'#0000ff'})])]),node('rect',{id:'solid',x,y,width:40,height:25,fill:'#00ff00'}),node('rect',{id:'gradient-patch',x:x+45,y,width:40,height:25,fill:'url(#gradient)'}),node('g',{opacity:.6},[node('circle',{id:'opacity',cx:x+15,cy:y+40,r:10,fill:'#ff0000'})]),node('text',{id:'chinese',x,y:y+65,'font-size':7,fill:'#39563c'},['山野之间 ABC']),node('image',{id:'photo',x:x+45,y:y+30,width:30,height:30,href:photo})]};project.svgArtwork={outside:asset,inside:structuredClone(asset)};
  await page.locator('#project-input').setInputFiles({name:'colors.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>window.__foldStudio.project.name==='Color export synthetic'&&document.querySelector('#toast').textContent.includes('工程已导入'));await page.waitForSelector('#editor-host[data-svg-ready="true"]');
  const artwork=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project.svgArtwork));
  for(const mode of ['rgb','cmyk']){
    await page.locator('#print-settings').click();await page.locator('#print-document-mode').selectOption(mode);await page.locator('#apply-print-settings').click();assert.equal(await page.evaluate(()=>window.__foldStudio.colorMode),mode);assert.equal(await page.evaluate(()=>window.__foldStudio.project.documentColorMode),mode);
    if(mode==='cmyk'){await page.locator('#undo').click();await page.waitForFunction(()=>window.__foldStudio.colorMode==='rgb');await page.locator('#redo').click();await page.waitForFunction(()=>window.__foldStudio.colorMode==='cmyk');await page.waitForSelector('#editor-host[data-svg-ready="true"]');}
    const svg=await download(async()=>{await page.locator('#export-toggle').click();await page.locator('#export-svg').click();},mode+'.svg');const text=svg.toString();assert.ok(text.includes('<text')&&text.includes('<path')&&text.includes('<image'));
    assert.equal(text.includes('data-fold-color-preview="cmyk"'),mode==='cmyk');
    const fill=await page.evaluate(source=>new DOMParser().parseFromString(source,'image/svg+xml').querySelector('[id$="solid"]').getAttribute('fill'),text);assert.equal(fill,mode==='rgb'?'#00ff00':'#6ab43f');
    for(const side of ['outside','inside']){
      await page.locator(`[data-side="${side}"]`).click();
      for(const format of ['jpg','pdf']){
        await page.locator('#export-toggle').click();await page.locator(format==='jpg'?'#export-flat-jpg':'#export-pdf').click();assert.equal(await page.locator('#color-export-mode').inputValue(),mode);await page.locator('#color-export-lines').uncheck();
        if(format==='pdf'&&mode==='rgb'&&side==='outside'){
          await page.locator('#color-export-font').setInputFiles({name:'invalid.ttf',mimeType:'application/octet-stream',buffer:Buffer.alloc(100)});await page.waitForFunction(()=>document.querySelector('#color-export-error').textContent.length>0);assert.equal(await page.locator('#color-export-font-name').textContent(),'内置中文字体 · 常用简体字');
        }
        if(format==='pdf'&&mode==='cmyk'&&side==='inside'){await page.locator('#color-export-font').setInputFiles(resolve('src/fonts/FoldPrintSans-Regular.woff2'));await page.waitForFunction(()=>document.querySelector('#color-export-font-name').textContent==='FoldPrintSans-Regular.woff2');}
        const data=await download(()=>page.locator('#confirm-color-export').click(),`${mode}-${side}.${format}`);
        if(format==='pdf')assert.equal(data.subarray(0,5).toString(),'%PDF-');else assert.deepEqual([...data.subarray(0,2)],[255,216]);
      }
    }
    await page.locator('#export-toggle').click();await page.locator('#export-jpg').click();await download(()=>page.locator('#confirm-color-export').click(),mode+'-3d.jpg');
    checks.push(mode+': selectable document mode, both-side editable SVG / JPG / vector PDF and 3D JPG');
  }
  await page.locator('#export-toggle').click();await page.locator('#export-flat-jpg').click();await page.locator('#color-export-mode').selectOption('rgb');await download(()=>page.locator('#confirm-color-export').click(),'mode-override-rgb.jpg');assert.equal(await page.evaluate(()=>window.__foldStudio.project.documentColorMode),'cmyk');checks.push('undo/redo restores the mode; a one-off export override leaves the document mode unchanged');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project.svgArtwork)),artwork,'exports must not bake colors into the project');
  const saved=JSON.parse((await download(()=>page.locator('#save-project').click(),'mode.fold')).toString());assert.equal(saved.documentColorMode,'cmyk');await page.reload();await ready();assert.equal(await page.evaluate(()=>window.__foldStudio.colorMode),'cmyk');checks.push('document mode and untouched artwork survive project save/reload');
  const unsupported=structuredClone(project);unsupported.name='Unsupported PDF';unsupported.svgArtwork.outside.nodes.push(node('filter',{id:'blur'},[node('feGaussianBlur',{stdDeviation:2})]));unsupported.svgArtwork.outside.nodes[1].attrs.filter='url(#blur)';
  await page.locator('#project-input').setInputFiles({name:'unsupported.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(unsupported))});await page.waitForFunction(()=>window.__foldStudio.project.name==='Unsupported PDF');
  await page.locator('#export-toggle').click();await page.locator('#export-pdf').click();const count=downloads;await page.locator('#confirm-color-export').click();await page.waitForFunction(()=>document.querySelector('#color-export-error').textContent.includes('滤镜'));assert.equal(downloads,count);await page.locator('#export-color-dialog [data-close]').first().click();checks.push('unsupported filters fail explicitly without downloading a partial PDF');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__foldStudio.setTheme('slate'));await page.locator('#export-toggle').click();await page.locator('#export-flat-jpg').click();const box=await page.locator('#export-color-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);await page.screenshot({path:resolve(dir,'mobile-export.png'),animations:'disabled'});await page.locator('#export-color-dialog [data-close]').first().click();checks.push('mobile/slate export controls fit and cancel safely');
  assert.deepEqual(errors,[]);if(url.startsWith('file:'))assert.deepEqual(requests,[]);writeFileSync(resolve(dir,'report.json'),JSON.stringify({checks,errors,networkCount:requests.length,sample:{x:x+10,y:y+10,width:d.width,height:d.height},downloads},null,2));console.log(JSON.stringify({checks,errors,networkCount:requests.length,downloads},null,2));
}catch(error){console.error({errors,toast:await page.locator('#toast').textContent().catch(()=>''),exportError:await page.locator('#color-export-error').textContent().catch(()=>''),downloads});await page.screenshot({path:resolve(dir,'failure.png')}).catch(()=>{});throw error;}
finally{await browser.close();await server?.close();}
