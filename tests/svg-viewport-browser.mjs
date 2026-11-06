import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';

const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
if(server)await server.listen();
const url=process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(executablePath)?{executablePath}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const directory=process.env.FOLD_TEST_ARTIFACTS??'artifacts/svg-viewport';mkdirSync(directory,{recursive:true});
const results=[],errors=[];let page;
const near=(value,expected,message)=>assert.ok(Math.abs(value-expected)<.5,`${message}: ${value} / ${expected}`);
async function frame(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function alignment(){
  const result=await page.evaluate(()=>{
    const api=window.__foldStudio.nativeEditor,d=window.__foldStudio.geometry,inside=window.__foldStudio.selection.side==='inside';
    const matrix=api.wrapper.getScreenCTM();
    const expected=new DOMMatrix([matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f]).multiply(inside?new DOMMatrix().translate(d.minX+d.maxX,0).scale(-1,1):new DOMMatrix());
    let error=0;
    for(const id of ['fold-paper-guide','fold-line-guide']){
      const guide=document.getElementById(id),actual=guide.getScreenCTM();
      for(const [x,y]of [[d.minX,d.minY],[d.maxX,d.minY],[d.minX,d.maxY],[d.maxX,d.maxY]]){
        const a=new DOMPoint(x,y).matrixTransform(actual),b=new DOMPoint(x,y).matrixTransform(expected);
        error=Math.max(error,Math.abs(a.x-b.x),Math.abs(a.y-b.y));
      }
      if(getComputedStyle(guide).opacity!=='1')throw Error(id+' was dimmed while selecting artwork');
    }
    const paperMatrix=document.getElementById('fold-paper-guide').getScreenCTM();
    return {error,origin:[paperMatrix.e,paperMatrix.f],scale:[paperMatrix.a,paperMatrix.d]};
  });
  assert.ok(result.error<.5,`paper/line/artwork alignment: ${result.error}px`);return result;
}
async function wheel(delta){
  const host=await page.locator('#editor-host').boundingBox(),cursor={x:host.x+host.width*.53,y:host.y+host.height*.47};
  await page.mouse.move(cursor.x,cursor.y);
  const local=await page.evaluate(({x,y})=>{const p=new DOMPoint(x,y).matrixTransform(document.querySelector('[data-fold-svg-wrapper]').getScreenCTM().inverse());return {x:p.x,y:p.y};},cursor);
  await page.mouse.wheel(0,delta);await frame();
  const position=await page.evaluate(({x,y})=>{const p=new DOMPoint(x,y).matrixTransform(document.querySelector('[data-fold-svg-wrapper]').getScreenCTM());return {x:p.x,y:p.y};},local);
  near(position.x,cursor.x,'wheel keeps horizontal cursor anchor');near(position.y,cursor.y,'wheel keeps vertical cursor anchor');await alignment();
}
async function pan(dx,dy){
  await page.locator('#tool-pan').click();
  const host=await page.locator('#editor-host').boundingBox(),x=host.x+host.width*.4,y=host.y+host.height*.5;
  const before=await alignment();await page.mouse.move(x,y);await page.mouse.down();
  for(let step=1;step<=5;step++){
    await page.mouse.move(x+dx*step/5,y+dy*step/5);await frame();const current=await alignment();
    near(current.origin[0]-before.origin[0],dx*step/5,'pan follows pointer X');near(current.origin[1]-before.origin[1],dy*step/5,'pan follows pointer Y');
  }
  await page.mouse.up();await frame();const after=await alignment();
  near(after.origin[0]-before.origin[0],dx,'release keeps pan X');near(after.origin[1]-before.origin[1],dy,'release keeps pan Y');
  const drift=await page.evaluate(()=>new Promise(resolve=>{
    const guide=document.getElementById('fold-paper-guide'),initial=guide.getScreenCTM();let drift=0,remaining=15;
    const sample=()=>{const current=guide.getScreenCTM();drift=Math.max(drift,Math.abs(current.e-initial.e),Math.abs(current.f-initial.f));if(--remaining)requestAnimationFrame(sample);else resolve(drift);};sample();
  }));assert.ok(drift<.5,`no idle rebound after pointer release: ${drift}px`);
}
try{
  for(const scenario of [{type:'carton',side:'outside',dpr:1},{type:'slotted-handle-carton',side:'inside',dpr:1.25}]){
    page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:scenario.dpr,acceptDownloads:true});page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
    const project=newProject(scenario.type);project.name='Viewport '+scenario.type;
    await page.locator('#project-input').setInputFiles({name:'viewport.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
    await page.waitForFunction(name=>window.__foldStudio.project.name===name,project.name);await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
    await page.locator('#side-'+scenario.side).click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
    await alignment();
    for(let cycle=0;cycle<3;cycle++){
      for(let i=0;i<6;i++)await wheel(-360);
      await pan(72,-43);await pan(-110,66);
      for(let i=0;i<6;i++)await wheel(360);
      await pan(-55,-30);
    }
    await page.locator('#fit-2d').click();await alignment();
    await page.locator('#tool-select').click();await page.locator('#add-text').click();await page.locator('#node-name').waitFor();await page.locator('#node-name').click();await frame();await alignment();
    const before=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project));
    await wheel(-260);await pan(45,25);await wheel(260);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),before,'view operations never modify saved artwork');
    const dl=page.waitForEvent('download');await page.locator('#save-project').click();const file=await dl;await file.saveAs(resolve(directory,scenario.type+'.fold'));
    const source=await page.evaluate(()=>window.foldSvgSource());assert.ok(!source.includes('fold-paper-guide')&&!source.includes('fold-line-guide'),'editor guides stay out of source');
    await page.screenshot({path:resolve(directory,scenario.type+'.png')});results.push({...scenario,passed:true});await page.close();
  }
  assert.deepEqual(errors,[]);console.log({results,errors});
}catch(error){await page?.screenshot({path:resolve(directory,'failure.png')}).catch(()=>{});throw error;}
finally{writeFileSync(resolve(directory,'report.json'),JSON.stringify({results,errors},null,2));await browser.close();await server?.close();}
