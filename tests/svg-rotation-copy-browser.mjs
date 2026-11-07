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
const directory=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/rotation-copy/verified');mkdirSync(directory,{recursive:true});
const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const el=(tag,attrs={},children=[])=>({tag,attrs:Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,String(v)])),children});
const cases=['matrix','parent','css','nested','inside','copy','multi-copy','cmyk-copy','reference-copy','copy-cancel','mid-alt-copy','alt-click'],results=[];
const norm=angle=>((angle+180)%360+360)%360-180;
const near=(a,b,label,tolerance=.15)=>assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} != ${b}`);
for(const name of cases){
  if(process.env.FOLD_ROTATION_CASE&&!process.env.FOLD_ROTATION_CASE.split(',').includes(name))continue;
  const page=await browser.newPage({viewport:{width:1800,height:1100},acceptDownloads:true}),errors=[],trace=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  try{
    await page.goto(url);await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
    await page.evaluate(()=>window.__foldStudio.nativeEditor.setSnapping(false)); // These cases assert unsnapped matrix deltas; snapping has its own suite.
    const project=newProject();project.name='Rotation '+name;project.layers=[];const d=makeDieline(project.type,project.dimensions),front=d.panels.find(p=>p.id==='front'),angle=37*Math.PI/180;
    let shape=el('rect',{id:'target',x:10,y:12,width:30,height:20,fill:'#ad365e',transform:`matrix(${Math.cos(angle)} ${Math.sin(angle)} ${-Math.sin(angle)} ${Math.cos(angle)} 20 10)`});
    if(name==='reference-copy')shape=el('g',{id:'target',transform:shape.attrs.transform},[el('defs',{},[el('linearGradient',{id:'ink'},[el('stop',{offset:0,'stop-color':'#123456'}),el('stop',{offset:1,'stop-color':'#abcdef'})]),el('clipPath',{id:'clip'},[el('circle',{cx:25,cy:22,r:10})])]),el('rect',{id:'painted',x:10,y:12,width:30,height:20,fill:'url(#ink)','clip-path':'url(#clip)'})]);
    if(name==='css'){delete shape.attrs.transform;shape.css={transform:'translate(20px,10px) rotate(37deg)','transform-origin':'25px 22px'};}
    if(name==='parent')shape=el('g',{id:'parent',transform:'translate(5 5) rotate(-18) scale(.8 1.2)'},[shape]);
    if(name==='nested')shape=el('svg',{x:3,y:5,width:80,height:80,viewBox:'0 0 100 100'},[shape]);
    const artwork={viewBox:[d.minX,d.minY,d.width,d.height],nodes:[el('g',{id:'fixture',transform:`translate(${front.x+20} ${front.y+25})`},[shape,...(name==='multi-copy'?[el('rect',{id:'peer',x:60,y:15,width:15,height:12,fill:'#395c41'})]:[])])]};project.svgArtwork={outside:artwork,inside:structuredClone(artwork)};
    await page.locator('#project-input').setInputFiles({name:'rotation.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(name=>window.__foldStudio.project.name==='Rotation '+name,name);await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
    if(name==='inside'){await page.locator('#side-inside').click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();}
    const target=page.locator('#svgcontent #target');await page.evaluate(()=>window.__foldStudio.nativeEditor.select(document.querySelector('#svgcontent #target')));
    const state=()=>target.evaluate(n=>{const b=n.getBBox(),m=n.getScreenCTM(),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(m);return {matrix:[m.a,m.b,m.c,m.d,m.e,m.f],angle:Math.atan2(m.b,m.a)*180/Math.PI,center:{x:p.x,y:p.y},html:n.outerHTML};});
    const before=await state();
    if(name==='multi-copy')await page.evaluate(()=>window.__foldStudio.nativeEditor.select(document.querySelector('#peer'),true));
    await page.evaluate(()=>{window.rotationPointer={};window.addEventListener('mousedown',e=>{window.rotationPointer.start={x:e.clientX,y:e.clientY};},true);window.addEventListener('mousemove',e=>{window.rotationPointer.end={x:e.clientX,y:e.clientY};},true);});
    if(!name.includes('copy')&&name!=='alt-click'){
      const rotate=async(degrees,options={})=>{
        await page.evaluate(()=>{const target=document.querySelector('#svgcontent #target');if(!window.svgCanvas.getSelectedElements().includes(target))window.__foldStudio.nativeEditor.select(target);});
        const s=await state(),grip=await page.locator('#selectorGrip_rotate').boundingBox(),p={x:grip.x+grip.width/2,y:grip.y+grip.height/2},r=Math.hypot(p.x-s.center.x,p.y-s.center.y),start=Math.atan2(p.y-s.center.y,p.x-s.center.x);
        if(options.alt)await page.keyboard.down('Alt');if(options.shift)await page.keyboard.down('Shift');
        await page.mouse.move(p.x,p.y);await page.mouse.down();near(norm((await state()).angle-s.angle),0,'mousedown keeps current angle',.01);
        for(let i=1;i<=8;i++){const a=start+degrees*Math.PI/180*i/8;await page.mouse.move(s.center.x+Math.cos(a)*r,s.center.y+Math.sin(a)*r);const current=await state();trace.push(current);near(norm(Number(await page.locator('#object-rotation').inputValue())-current.angle),0,'live angle readout',.001);}
        if(options.cancel)await page.keyboard.press('Escape');await page.mouse.up();if(options.alt)await page.keyboard.up('Alt');if(options.shift)await page.keyboard.up('Shift');
        const input=await page.evaluate(()=>window.rotationPointer),raw=norm((Math.atan2(input.end.y-s.center.y,input.end.x-s.center.x)-Math.atan2(input.start.y-s.center.y,input.start.x-s.center.x))*180/Math.PI),delta=raw*(options.alt?0.1:1),expected=options.shift?norm(Math.round((s.angle+delta)/15)*15-s.angle):delta;return {before:s,expected};
      };
      const firstInput=await rotate(8),first=await state();near(norm(first.angle-before.angle),firstInput.expected,'rotation continues from the initial matrix',.01);near(first.center.x,before.center.x,'fixed center X');near(first.center.y,before.center.y,'fixed center Y');
      const secondInput=await rotate(-3),second=await state();near(norm(second.angle-first.angle),secondInput.expected,'second rotation keeps the first rotation',.01);
      const slow=await rotate(10,{alt:true});near(norm((await state()).angle-slow.before.angle),slow.expected,'Alt fine rotation',.01);const snap=await rotate(12,{shift:true});near(norm((await state()).angle-snap.before.angle),snap.expected,'Shift 15 degree snap',.01);const beforePrecise=await state();
      const precise=page.locator('#object-rotation');await precise.fill('42.375');await precise.press('Tab');near(norm((await state()).angle-42.375),0,'decimal angle input',.005);
      if(name==='matrix')await page.screenshot({path:resolve(directory,'precise-angle.png')});
      await precise.press('ArrowUp');near(norm((await state()).angle-42.475),0,'0.1 degree keyboard step',.005);await precise.press('Shift+ArrowDown');near(norm((await state()).angle-41.475),0,'1 degree keyboard step',.005);await page.locator('#undo').click();await page.locator('#undo').click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();near(norm((await state()).angle-42.375),0,'undo keyboard steps',.005);
      const stable=await state();await rotate(18,{cancel:true});assert.equal((await state()).html,stable.html,'Escape restores exact attributes');
      await page.locator('#undo').click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();near(norm((await state()).angle-beforePrecise.angle),0,'undo exact angle',.005);await page.locator('#redo').click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();near(norm((await state()).angle-42.375),0,'redo exact angle',.005);
    }else{
      if(name==='cmyk-copy'){await page.locator('#print-settings').click();await page.locator('#print-document-mode').selectOption('cmyk');await page.locator('#apply-print-settings').click();await page.waitForFunction(()=>document.querySelector('#editor-host').dataset.proofReady==='true');}
      const original=await state(),data=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),position=original.center,count=await page.locator('#fixture > *').count(),selectedCount=await page.evaluate(()=>window.svgCanvas.getSelectedElements().filter(Boolean).length);
      await page.evaluate(count=>{window.copyRoot=document.querySelector('#svgcontent');window.copyProof=document.querySelector('#fold-proof-image')?.getAttribute('href');window.copyFrames=[];const record=()=>{const image=document.querySelector('#fold-proof-image');window.copyFrames.push({sameRoot:window.copyRoot===document.querySelector('#svgcontent'),count:window.svgCanvas.getSelectedElements().filter(Boolean).length,mode:window.svgCanvas.getMode(),staleProof:!!image&&document.querySelector('#fixture').children.length>count&&image.style.display!=='none'&&image.getAttribute('href')===window.copyProof});if(window.copyFrames.length<80)requestAnimationFrame(record);};requestAnimationFrame(record);},count);
      if(name!=='mid-alt-copy')await page.keyboard.down('Alt');await page.mouse.move(position.x,position.y);await page.mouse.down();assert.equal(await page.locator('#fixture > *').count(),count,'Alt mousedown must not create or publish a duplicate');
      if(name==='alt-click'){await page.mouse.up();await page.keyboard.up('Alt');assert.equal(await page.locator('#fixture > *').count(),1);assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),data);assert.deepEqual(errors,[]);results.push({name,passed:true});continue;}
      if(name==='mid-alt-copy'){await page.mouse.move(position.x+15,position.y+10,{steps:4});await page.keyboard.down('Alt');}
      await page.mouse.move(position.x+30,position.y+20,{steps:8});await page.waitForTimeout(70);assert.equal(await target.evaluate(n=>n.outerHTML),original.html,'source stays unchanged while dragging a copy');assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),data,'copy is committed after the drag');
      const cloneId=await page.evaluate(()=>{const nodes=window.svgCanvas.getSelectedElements().filter(Boolean);return(nodes.find(n=>n.getAttribute('x')==='10')??nodes[0]).id;});assert.notEqual(cloneId,'target');const clone=page.locator('#svgcontent #'+cloneId),box=await clone.boundingBox(),source=await target.boundingBox();near(box.x-source.x,30,'copy displacement X');near(box.y-source.y,20,'copy displacement Y');near(box.width,source.width,'copy width');near(box.height,source.height,'copy height');
      if(name==='reference-copy'){const references=await clone.evaluate(n=>[...n.querySelectorAll('[fill],[clip-path]')].flatMap(e=>[e.getAttribute('fill'),e.getAttribute('clip-path')].filter(v=>v?.startsWith('url(')).map(v=>{const id=v.match(/#([^)]*)/)[1];return{id,inside:!!n.querySelector('[id="'+id+'"]')};})));assert.ok(references.length===2&&references.every(r=>r.inside&&!['ink','clip'].includes(r.id)),'copied definitions and their references must be independent');}
      if(name==='copy-cancel'){await page.keyboard.press('Escape');await page.mouse.up();await page.keyboard.up('Alt');assert.equal(await page.locator('#fixture > *').count(),1);assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),data);assert.equal((await state()).html,original.html);assert.deepEqual(errors,[]);results.push({name,passed:true});continue;}
      await page.mouse.up();await page.keyboard.up('Alt');await page.waitForTimeout(350);assert.equal(await page.locator('#fixture > *').count(),count+selectedCount);assert.ok(await page.evaluate(count=>window.copyFrames.every(s=>s.sameRoot&&s.count===count),selectedCount),'copy cannot replace the SVG canvas or empty its selection');if(name==='cmyk-copy')assert.ok(await page.evaluate(()=>window.copyFrames.every(s=>!s.staleProof)),'old proof must not cover the committed copy');
      await page.locator('#undo').click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();assert.equal(await page.locator('#fixture > *').count(),count,'one undo removes the copy and its move');assert.equal((await state()).html,original.html);await page.locator('#redo').click();await page.locator('#editor-host[data-svg-ready="true"]').waitFor();assert.equal(await page.locator('#fixture > *').count(),count+selectedCount);
    }
    assert.deepEqual(errors,[]);results.push({name,passed:true});
  }catch(error){results.push({name,passed:false,error:error.stack,errors});await page.screenshot({path:resolve(directory,name+'-failure.png')}).catch(()=>{});}
  finally{writeFileSync(resolve(directory,name+'-trace.json'),JSON.stringify(trace,null,2));await page.close();console.log(results.at(-1));}
}
await browser.close();await server?.close();writeFileSync(resolve(directory,'report.json'),JSON.stringify({results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
