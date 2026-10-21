import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {BOX_TYPES} from '../src/geometry.js';

const root=resolve(import.meta.dirname,'..'),artifacts=resolve(root,'artifacts');mkdirSync(artifacts,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();
const url=`http://127.0.0.1:${server.httpServer.address().port}`;
const installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const errors=[],checks=[];
try{
  let page=await browser.newPage({viewport:{width:1366,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');
  await page.locator('#open-templates').click();
  const dialog=page.locator('#templates-dialog');
  const bounds=await dialog.boundingBox();await page.mouse.click(bounds.x+5,bounds.y+5);
  assert.equal(await dialog.isVisible(),true,'dialog padding must not dismiss structure library');
  for(const filter of ['carton','gift','shipping','container','all']){
    await page.locator(`[data-filter="${filter}"]`).click();
    assert.equal(await page.locator('.template-card:visible').count(),Object.values(BOX_TYPES).filter(t=>filter==='all'||t.category===filter).length);
  }
  const before=await page.evaluate(()=>window.__foldStudio.project);
  await page.locator('[data-template="drawer-box"]').click();await page.locator('#cancel-confirm').click();
  assert.deepEqual(await page.evaluate(()=>window.__foldStudio.project),before);
  assert.equal(await dialog.isVisible(),true);
  await page.locator('[data-template="book-box"]').click();await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>window.__foldStudio.project),before);
  await page.locator('[data-template="drawer-box"]').click();await page.locator('#accept-confirm').click();
  await page.waitForFunction(()=>window.__foldStudio.project.type==='drawer-box');
  assert.equal(await page.locator('#templates-dialog').isVisible(),false);
  assert.equal(await page.locator('#panel-selector').inputValue(),'sleeve-top');
  await page.locator('#undo').click();assert.equal(await page.evaluate(()=>window.__foldStudio.project.type),before.type);
  await page.locator('#redo').click();assert.equal(await page.evaluate(()=>window.__foldStudio.project.type),'drawer-box');
  checks.push('library filters, padding click, cancel and Escape preserve design; confirmation synchronizes panel; undo/redo');
  for(const viewport of [{width:390,height:844},{width:900,height:600}]){
    await page.setViewportSize(viewport);await page.locator('#open-templates').click();
    const r=await dialog.boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=viewport.width+1&&r.y+r.height<=viewport.height+1);
    const last=page.locator('.template-card').last();await last.scrollIntoViewIfNeeded();assert.equal(await last.isVisible(),true);
    await last.click();await page.locator('#cancel-confirm').click();await page.locator('#close-templates').click();
  }
  checks.push('phone and short desktop structure library: all templates reachable');
  await page.setViewportSize({width:1366,height:900});
  for(const [type,config] of Object.entries(BOX_TYPES)){
    await page.locator('#open-templates').click();await page.locator(`[data-template="${type}"]`).click();
    if(await page.locator('#confirm-dialog').isVisible())await page.locator('#accept-confirm').click();
    await page.locator('#unfold').click();await page.locator('#panel-selector').selectOption(config.printPanel);
    await page.locator('[data-side="inside"]').click();await page.locator('#inspect-panel').click();
    await page.locator('[data-testid="preview-canvas"]').click({position:await page.locator('[data-testid="preview-canvas"]').boundingBox().then(r=>({x:r.width/2,y:r.height/2}))});
    const selection=await page.evaluate(()=>window.__foldStudio.selection);
    assert.equal(selection.panelId,config.printPanel);assert.equal(selection.side,'inside');
    await page.locator('#inspect-panel').click();
  }
  checks.push('native pointer clicks on all 12 isolated inside panels keep dropdown and active surface synchronized');
  // A real WebGL viewport with diagnostic quadrants checks handedness of both printed sides.
  await page.close();page=await browser.newPage({viewport:{width:520,height:520}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/model-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto(url+'/model-harness');
  const result=await page.evaluate(async()=>{
    const [{Preview3D},{ImageCache},{BOX_TYPES,makeDieline},{newProject}]=await Promise.all([import('/src/preview3d.js'),import('/src/artwork.js'),import('/src/geometry.js'),import('/src/project.js')]);
    const {curvedPoint,skinInterval}=await import('/src/curved-carton.js');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const host=document.createElement('div');host.style='width:480px;height:480px;position:fixed;inset:0';document.body.replaceChildren(host);
    const selected=[],preview=new Preview3D(host,new ImageCache(),(panel,side)=>selected.push({panel,side}),()=>{});preview.setQuality('economy');
    const failures=[],colors=['#ff0000','#00ff00','#0000ff','#ffff00'];let count=0;
    const buffer=document.createElement('canvas');buffer.width=buffer.height=480;const ctx=buffer.getContext('2d');
    const sample=(x,y)=>[...ctx.getImageData(Math.round(x),Math.round(y),1,1).data];
    for(const type of Object.keys(BOX_TYPES)){
      const p=newProject(type),d=makeDieline(type,p.dimensions);p.layers=[];p.paper=p.insidePaper='#ffffff';
      const skinSample=(panel,i)=>{
        const v=i<2?.35:.65,[a,b]=skinInterval(panel.curvedSkin.region,panel.curvedSkin.index,v);
        return{x:d.curvedBody.x+d.curvedBody.side*(a+(b-a)*(i%2?.7:.3)),y:d.curvedBody.y+v*d.curvedBody.h,w:(b-a)*d.curvedBody.side*.18};
      };
      for(const panel of d.panels)for(const side of ['outside','inside'])for(let i=0;i<4;i++){
        const s=panel.curvedSkin?skinSample(panel,i):null,x=s?(s.x-panel.x)/panel.w:null;
        p.layers.push({id:crypto.randomUUID(),name:'quadrant',type:'shape',shape:'rect',panel:panel.id,side,x:s?(side==='inside'?1-x:x):i%2?.65:.35,y:s?(s.y-panel.y)/panel.h:i<2?.35:.65,w:s?s.w/panel.w:.3,h:s?.08:.3,color:colors[i],visible:true,opacity:1,rotation:0,clipToPanel:!!s});
      }
      preview.build(p,d);await new Promise(r=>requestAnimationFrame(r));
      for(const fold of [0,1]){
        preview.setFold(fold);
        if(d.cylinder && fold===0){preview.fit();if(preview.accessories.visible)failures.push(type+' flat hardware unexpectedly visible');}
        for(const panel of d.panels)for(const side of ['outside','inside']){
          preview.inspectPanel(panel.id,side,true);preview.render();ctx.clearRect(0,0,480,480);ctx.drawImage(preview.renderer.domElement,0,0,480,480);
          const distance=preview.camera.position.distanceTo(preview.controls.target),scale=480/(2*distance*Math.tan(preview.camera.fov*Math.PI/360));
          const curved=d.cylinder&&panel.id==='body'&&fold===1,radius=curved?d.cylinder.diameter/2:0,depth=radius*Math.cos(.3*Math.PI),correction=curved?distance/(distance+(side==='inside'?depth:-depth)):1;
          const dx=(curved?radius*Math.sin(.3*Math.PI):panel.w*.15)*scale*correction,dy=panel.h*.15*scale*correction;
          const opaque=(cx,cy)=>{for(let r=0;r<=32;r+=4)for(const[ox,oy]of[[0,0],[r,0],[-r,0],[0,r],[0,-r],[r,r],[-r,r],[r,-r],[-r,-r]]){const v=sample(cx+ox,cy+oy);if(v[3]>250)return v;}return[0,0,0,0];};
          const pixels=panel.curvedSkin?[0,1,2].map(i=>{
            const s=skinSample(panel,i),pt=new THREE.Vector3(...curvedPoint(s.x,s.y,d,fold,preview.cx,preview.cy)).applyMatrix4(preview.meshes.get(panel.id).matrixWorld).project(preview.camera);
            return sample((pt.x+1)*240,(1-pt.y)*240);
          }):[opaque(240-dx,240-dy),opaque(240+dx,240-dy),opaque(240-dx,240+dy)];
          // Subpixel fold bridges mix with the paper through antialiasing;
          // preserve channel-order checks while allowing their lower saturation.
          const dominance=Math.min(panel.w,panel.h)*scale<10?1.02:1.15;
          if(!(pixels[0][0]>pixels[0][1]*dominance&&pixels[0][0]>pixels[0][2]*dominance&&pixels[1][1]>pixels[1][0]*dominance&&pixels[2][2]>pixels[2][0]*dominance))failures.push(`${type}/${panel.id}/${side}/${fold}: ${JSON.stringify(pixels)}`);
          count++;
          if(type==='tray'&&panel.id==='base'&&side==='outside'&&fold===1)window.trayDiagnostic=preview.renderer.domElement.toDataURL();
        }
      }
      // A click in an isolated panel must never select a hidden neighboring face.
      const panel=d.panels.find(q=>q.id===BOX_TYPES[type].printPanel);preview.setFold(0);preview.inspectPanel(panel.id,'inside',true);preview.render();
      const rect=preview.renderer.domElement.getBoundingClientRect();
      preview.controls.dispose();
      for(const event of ['pointerdown','pointerup'])preview.renderer.domElement.dispatchEvent(new PointerEvent(event,{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,bubbles:true}));
      const hit=selected.at(-1);if(hit?.panel!==panel.id||hit?.side!=='inside')failures.push(type+' inside picking: '+JSON.stringify(hit));
      preview.showAll();
    }
    const stats={count,failures};preview.dispose();return stats;
  });
  writeFileSync(resolve(artifacts,'model-selection-report.json'),JSON.stringify({checks,...result,errors},null,2));
  const diagnostic=await page.evaluate(()=>window.trayDiagnostic);writeFileSync(resolve(artifacts,'tray-outside-orientation.png'),Buffer.from(diagnostic.split(',')[1],'base64'));
  assert.deepEqual(result.failures,[]);assert.deepEqual(errors,[]);
  console.log(`Passed: ${result.count} real WebGL panel/side/fold quadrant checks, 12 inside picking checks, library selection and responsive modal flows`);
}finally{await browser.close();await server.close();}
