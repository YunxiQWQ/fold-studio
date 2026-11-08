import {chromium}from'playwright';import{createServer}from'vite';import{resolve}from'node:path';import{writeFileSync,readFileSync,existsSync,mkdirSync}from'node:fs';import assert from'node:assert/strict';import{TEMPLATE_CATALOG}from'../src/template-catalog.js';
const templateCount=Object.keys(TEMPLATE_CATALOG).length;mkdirSync('artifacts',{recursive:true});
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}`;
const installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});const checks=[],errors=[];let page;
const ready=()=>page.waitForFunction(()=>document.querySelector('#editor-host')?.dataset.svgReady==='true');
try{
 page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.stack));await page.goto(url);await page.waitForSelector('html[data-ready="true"]');await ready();
 // One app bar, one tool row, one slim heading per pane.
 for(const legacy of ['.workspace-nav','.surface-toolbar','.canvas-bottom','.editor-commandbar','.preview-settings'])assert.equal(await page.locator(legacy).count(),0,legacy);
 assert.equal(await page.locator('.app-bar').count(),1);assert.equal(await page.locator('.design-toolbar').count(),1);assert.equal(await page.locator('.design-toolbar .surface-tabs').count(),1);
 const bar=await page.locator('.app-bar').boundingBox(),tools=await page.locator('.design-toolbar').boundingBox(),heading=await page.locator('.flat-pane > .pane-heading').boundingBox(),split=await page.locator('#editor-host').boundingBox();
 assert.ok(bar.height<=52&&tools.height<=46&&heading.height<=36);assert.ok(split.y<=bar.height+tools.height+heading.height+2,'canvas starts right below the pane heading');assert.ok(split.height>=900,'split canvas keeps at least 900px at 1080p');
 checks.push(`canvas starts at ${Math.round(split.y)}px with ${Math.round(split.height)}px height at 1920×1080`);
 for(const id of ['project-name','save-status','import-project','save-project','color-mode-toggle','theme-toggle','shortcut-help','help','export-toggle','side-outside','side-inside','tool-select','tool-pan','add-text','add-image','add-shape','add-barcode','add-qrcode','add-symbol','undo','redo','copy-layer','cut-layer','paste-layer','toggle-guides','edit-menu-toggle','zoom-in','zoom-out','zoom-label','fit-2d','toggle-expand-editor','fit-3d','quality','play-fold','fold-slider','unfold','fold','open-templates','panel-selector','inspector','layer-list','sidebar-resizer','canvas-split-resizer','inspector-resizer','layer-resizer'])assert.equal(await page.locator('#'+id).count(),1,id);
 assert.equal(await page.locator('.app-bar .project-library-trigger').count(),1);
 checks.push('every control keeps one unique ID inside the merged app bar, toolbar and pane headings');
 await page.locator('#side-inside').click();assert.equal(await page.evaluate(()=>window.__foldStudio.selection.side),'inside');
 await page.locator('#add-shape').click();assert.ok(await page.locator('#draw-menu').isVisible());await page.keyboard.press('Escape');
 await page.locator('#unfold').click();await page.waitForFunction(()=>window.__foldStudio.project.fold===0);await page.locator('#fold').click();await page.waitForFunction(()=>window.__foldStudio.project.fold===1);
 await page.locator('#shortcut-help').click();assert.ok(await page.locator('#shortcuts-dialog').isVisible());await page.keyboard.press('Escape');
 await page.locator('#toggle-expand-editor').click();const expanded=await page.locator('#editor-host').boundingBox();assert.ok(expanded.width>split.width*1.6);assert.ok(!await page.locator('.preview-pane').isVisible());await page.screenshot({path:'artifacts/workspace-expanded.png'});await page.locator('#toggle-expand-editor').click();
 checks.push('side tabs, draw menu, fold presets, shortcut dialog and expanded canvas keep their handlers');
 await page.locator('.dimension-section .section-heading').click();assert.ok(await page.locator('.dimension-section').evaluate(n=>n.classList.contains('collapsed')));
 assert.match(await page.locator('#dimension-summary').innerText(),/\d+ × \d+ × \d+/);await page.reload();await page.waitForSelector('html[data-ready="true"]');assert.ok(await page.locator('.dimension-section').evaluate(n=>n.classList.contains('collapsed')));await page.locator('.dimension-section .section-heading').click();
 checks.push('collapsed document sections show a summary and persist across reloads');
 await page.locator('#open-templates').click();const images=page.locator('.template-card .model-thumbnail img');assert.equal(await images.count(),templateCount);await page.waitForFunction(()=>[...document.querySelectorAll('.template-card .model-thumbnail img')].every(img=>img.complete&&img.naturalWidth===384));
 const thumbs=await images.evaluateAll(imgs=>imgs.map(img=>({source:img.src,height:img.naturalHeight,shown:img.getBoundingClientRect().height})));assert.equal(new Set(thumbs.map(t=>t.source)).size,templateCount);assert.ok(thumbs.every(t=>t.source.startsWith('data:image/png;base64,')&&t.height===288));
 assert.ok((await page.locator('.template-card').first().boundingBox()).height>200,'library cards are not squashed');await page.screenshot({path:'artifacts/structure-library-model-previews.png'});await page.keyboard.press('Escape');
 const manifest=JSON.parse(readFileSync('src/template-previews.manifest.json','utf8'));assert.equal(Object.keys(manifest.previews).length,templateCount);
 checks.push(`all ${templateCount} library cards display distinct model renders at full card size`);
 // Tablet: both side columns become drawers.
 await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(250);
 const canvas=await page.locator('.canvas-split').boundingBox();assert.ok(canvas.width>=1000,'canvas spans the window on tablets');await page.locator('#left-sidebar').waitFor({state:'hidden'});
 await page.locator('#toggle-left-panel').click();await page.locator('#left-sidebar').waitFor({state:'visible'});assert.equal(await page.locator('#toggle-left-panel').getAttribute('aria-expanded'),'true');await page.screenshot({path:'artifacts/workspace-tablet-drawer.png'});
 await page.locator('#drawer-scrim').click({position:{x:900,y:300}});await page.locator('#left-sidebar').waitFor({state:'hidden'});
 await page.locator('#toggle-inspector').click();await page.locator('#right-sidebar').waitFor({state:'visible'});await page.keyboard.press('Escape');await page.locator('#right-sidebar').waitFor({state:'hidden'});
 checks.push('tablet layout gives the canvas the full width and opens structure/layers and properties as drawers');
 for(const size of [{width:1280,height:800},{width:390,height:844}]){await page.setViewportSize(size);await page.waitForTimeout(200);await page.locator('#side-outside').click();await page.locator('#add-text').click();await page.waitForFunction(()=>window.__foldStudio.selection.selected||document.querySelector('#properties h3')?.textContent);await page.locator('#open-templates').click();await page.locator('[data-filter="container"]').click();assert.equal(await page.locator('[data-template]:visible').count(),Object.values(TEMPLATE_CATALOG).filter(t=>t.category==='container').length);await page.keyboard.press('Escape');}
 await page.screenshot({path:'artifacts/workspace-phone.png',fullPage:true});
 checks.push('compact desktop and phone layouts keep editing and library filtering reachable');assert.deepEqual(errors,[]);const report={canvas:split,checks,errors};writeFileSync('artifacts/workspace-layout-verification.json',JSON.stringify(report,null,2));console.log(report);
}catch(e){await page?.screenshot({path:'artifacts/workspace-layout-failure.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();await server.close();}
