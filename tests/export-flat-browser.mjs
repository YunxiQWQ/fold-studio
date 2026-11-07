import {chooseExport} from './helpers/export-ui.mjs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';

const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
const url=`http://127.0.0.1:${server.httpServer.address().port}`,artifacts=resolve('artifacts/png-export');mkdirSync(artifacts,{recursive:true});
const installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
let browser;const errors=[],results=[];
try{
  browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');
  let downloads=0;page.on('download',()=>downloads++);
  await page.locator('#export-toggle').click();await chooseExport(page,'flat','png');assert.equal(await page.locator('#export-lines').isChecked(),true);
  await page.screenshot({path:resolve(artifacts,'export-options.png')});await page.locator('#export-dialog [data-export-close]').first().click();assert.equal(downloads,0);
  for(const type of ['carton','curved-twist-carton']){
    const p=newProject(type);p.name='PNG options '+type;p.layers=[];p.paper='#ffffff';p.insidePaper='#ffffff';p.panelColors={};p.insidePanelColors={};
    await page.locator('#project-input').setInputFiles({name:type+'.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
    await page.waitForFunction(name=>window.__foldStudio.project.name===name,p.name);
    for(const side of ['outside','inside']){
      await page.locator(`[data-side="${side}"]`).click();
      for(const includeLines of [false,true]){
        await page.locator('#export-toggle').click();await chooseExport(page,'flat','png');
        assert.ok((await page.locator('#export-preview-title').textContent()).startsWith(side==='inside'?'内面':'外面'));
        await page.locator('#export-lines').setChecked(includeLines);
        const wait=page.waitForEvent('download');await page.locator('#confirm-export').click();const file=await wait;
        const name=`${type}-${side}-${includeLines?'lines':'artwork'}.png`,path=resolve(artifacts,name);await file.saveAs(path);
        assert.equal(file.suggestedFilename().includes('带线'),includeLines);
        const pixels=await page.evaluate(async base64=>{
          const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();
          const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
          const data=ctx.getImageData(0,0,c.width,c.height).data;let cutPixels=0,creasePixels=0,transparent=0;
          for(let i=0;i<data.length;i+=4){const [r,g,b,a]=data.subarray(i,i+4);if(!a){transparent++;continue;}if(r-g>50&&r-b>50)cutPixels++;if(g-r>30&&g-b>10)creasePixels++;}
          return{width:c.width,height:c.height,cutPixels,creasePixels,transparent};
        },readFileSync(path).toString('base64'));
        assert.equal(Math.max(pixels.width,pixels.height),3072);
        assert.ok(pixels.transparent>0,'transparent area outside net must be preserved');
        if(includeLines){assert.ok(pixels.cutPixels>200,'missing cut lines');assert.ok(pixels.creasePixels>200,'missing crease lines');}
        else{assert.equal(pixels.cutPixels,0);assert.equal(pixels.creasePixels,0);}
        results.push({type,side,includeLines,...pixels});
      }
    }
  }
  for(const type of ['carton','curved-twist-carton'])for(const side of ['inside','outside']){
    const a=results.find(r=>r.type===type&&r.side===side&&!r.includeLines),b=results.find(r=>r.type===type&&r.side===side&&r.includeLines);
    assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#export-toggle').click();await chooseExport(page,'flat','png');
  const bounds=await page.locator('#export-dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#export-dialog').isVisible(),false);
  assert.equal(downloads,8);assert.deepEqual(errors,[]);
  writeFileSync(resolve(artifacts,'report.json'),JSON.stringify({results,errors},null,2));
  console.log('8 actual PNG downloads passed: straight/curved cartons, both print sides, optional cut/crease lines, same dimensions, transparency, cancellation and mobile dialog.');
}finally{await browser?.close();await server.close();}
