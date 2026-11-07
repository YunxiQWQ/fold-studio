import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {newProject} from '../src/project.js';

const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const exe=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/typography-alignment');mkdirSync(dir,{recursive:true});
const page=await browser.newPage({viewport:{width:1680,height:1100},acceptDownloads:true}),checks=[],errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});page.setDefaultTimeout(12000);
const source='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><g transform="translate(12 8) rotate(13)"><rect id="a" x="4" y="4" width="20" height="12" fill="#336655"/><rect id="b" x="36" y="24" width="13" height="18" fill="#885533"/></g><g style="transform:translate(7px,4px) rotate(-7deg);transform-origin:70px 20px"><rect id="c" x="70" y="35" width="27" height="10" fill="#447799"/></g><text id="one" x="8" y="70" font-family="serif" font-size="6"><tspan id="line1" x="8" y="70" style="font-family:Georgia;font-size:6px">第一行 <tspan id="part" style="font-family:Georgia;font-weight:300">Mixed</tspan></tspan><tspan id="line2" x="8" y="79" style="font-family:Georgia;font-size:6px">第二行 Text</tspan></text><g transform="translate(105 55) scale(.7 1.3)"><text id="two" x="0" y="0" style="font-family:serif;font-size:9px">Second</text></g><g data-locked="true"><text id="locked" x="12" y="108" font-size="7">Locked</text></g></svg>';
const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
async function fixture(side='outside'){
  const p=newProject();p.name='Typography alignment '+side;p.layers=[];
  await page.locator('#project-input').setInputFiles({name:'panel.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await page.waitForFunction(name=>window.__foldStudio.project.name===name,p.name);await ready();await page.locator('#side-'+side).click();await ready();
  await page.locator('#image-input').setInputFiles({name:'fixture.svg',mimeType:'image/svg+xml',buffer:Buffer.from(source)});await page.locator('#svgcontent [id$="-one"]').waitFor();await page.locator('#expand-layers').click();
}
async function choose(id,add=false){await page.locator('#expand-layers').click();await page.locator(`#layers [data-node-id$="-${id}"]`).click(add?{modifiers:['Control']}:{});}
async function edit(id,value){const input=page.locator(id);await input.fill(String(value));await input.blur();}
async function undo(){await page.locator('#undo').click();await ready();await page.locator('#expand-layers').click();}
const near=(a,b,title,tol=.025)=>assert.ok(Math.abs(a-b)<tol,`${title}: ${a} / ${b}`);
async function bounds(ids){return page.evaluate(ids=>{
  const root=window.__foldStudio.nativeEditor.wrapper,inv=root.getScreenCTM().inverse(),result={};for(const id of ids){const n=root.querySelector(`[id$="-${id}"]`),b=n.getBBox(),m=inv.multiply(n.getScreenCTM()),p=[[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));const x=Math.min(...p.map(p=>p.x)),y=Math.min(...p.map(p=>p.y));result[id]={x,y,w:Math.max(...p.map(p=>p.x))-x,h:Math.max(...p.map(p=>p.y))-y};}return result;
},ids);}
async function align(command,target='selection'){await page.locator('#alignment-target').selectOption(target);await page.locator(`[data-inspector-action="align-${command}"]`).click();}
try{
  await page.goto(url);await ready();await fixture();await choose('one');
  assert.equal(await page.locator('#node-text').inputValue(),'第一行 Mixed\n第二行 Text');
  await edit('#typography-family','Arial, sans-serif');await page.waitForFunction(()=>[...document.querySelectorAll('#svgcontent [id$="-one"],#svgcontent [id$="-one"] tspan')].every(n=>getComputedStyle(n).fontFamily.includes('Arial')));
  await choose('part');await page.locator('#typography-weight').selectOption('900');assert.ok((await page.evaluate(()=>window.__foldStudio.nativeEditor.selected.id)).endsWith('-part'));assert.equal(await page.locator('#svgcontent [id$="-line2"]').evaluate(n=>getComputedStyle(n).fontWeight),'400');await choose('one');
  await edit('#typography-size','18');await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project.svgArtwork).includes('font-size'));
  const physical=await page.evaluate(()=>{const n=document.querySelector('#svgcontent [id$="-line1"]'),r=window.__foldStudio.nativeEditor.wrapper.getScreenCTM().inverse().multiply(n.getScreenCTM());return parseFloat(getComputedStyle(n).fontSize)*Math.hypot(r.c,r.d);});near(physical,18*25.4/72,'physical 18pt in imported SVG');
  await page.locator('#typography-unit').selectOption('mm');near(+await page.locator('#typography-size').inputValue(),18*25.4/72,'mm display');await page.locator('#typography-unit').selectOption('pt');near(+await page.locator('#typography-size').inputValue(),18,'unit switching preserves type size');
  await page.locator('#typography-weight').selectOption('600');await page.locator('[data-typography-action="italic"]').click();await page.locator('[data-typography-action="underline"]').click();await page.locator('[data-typography-action="line-through"]').click();
  let styles=await page.locator('#svgcontent [id$="-part"]').evaluate(n=>({weight:getComputedStyle(n).fontWeight,style:getComputedStyle(n).fontStyle,decoration:getComputedStyle(n).textDecoration}));assert.equal(styles.weight,'600');assert.equal(styles.style,'italic');assert.match(styles.decoration,/underline/);assert.match(styles.decoration,/line-through/);
  await page.locator('[data-typography-action="underline"]').click();styles=await page.locator('#svgcontent [id$="-part"]').evaluate(n=>({decoration:getComputedStyle(n).textDecoration}));assert.doesNotMatch(styles.decoration,/underline/);assert.match(styles.decoration,/line-through/);
  await edit('#typography-letter-spacing',.6);await edit('#typography-word-spacing',1.2);await edit('#typography-line-height',1.8);
  const leading=await page.locator('#svgcontent [id$="-one"]').evaluate(n=>{const a=n.querySelector('[id$="-line1"]'),b=n.querySelector('[id$="-line2"]');return (Number(b.getAttribute('y'))-Number(a.getAttribute('y')))/parseFloat(getComputedStyle(a).fontSize);});near(leading,1.8,'multiline leading');
  const left=(await bounds(['one'])).one.x;await page.locator('#typography-anchor').selectOption('middle');near((await bounds(['one'])).one.x,left,'paragraph anchor retains overall left edge',.15);
  await page.locator('#typography-writing-mode').selectOption('vertical-rl');const columns=await page.locator('#svgcontent [id$="-one"]').evaluate(n=>[...n.children].map(n=>[+n.getAttribute('x'),+n.getAttribute('y')]));assert.ok(columns[1][0]<columns[0][0]);near(columns[0][1],columns[1][1],'vertical column origins');
  await page.locator('#typography-writing-mode').selectOption('horizontal-tb');assert.equal(await page.locator('#node-text').inputValue(),'第一行 Mixed\n第二行 Text');
  await edit('#node-text','第一行已改\n第二行保留\n第三行');await page.waitForFunction(()=>document.querySelector('#svgcontent [id$="-one"]').children.length===3);await undo();await choose('one');assert.equal(await page.locator('#node-text').inputValue(),'第一行 Mixed\n第二行 Text');
  checks.push('font family overrides imported inline span styles; physical pt sizing, weights, independent decorations, spacing, multiline leading, paragraph anchors and vertical columns edit actual vector text; multiline content has one-step undo');
  await choose('two',true);assert.equal(await page.locator('#typography-size').inputValue(),'');await edit('#typography-size',24);
  const sizes=await page.evaluate(()=>['one','two'].map(id=>{const n=document.querySelector(`#svgcontent [id$="-${id}"]`),m=window.__foldStudio.nativeEditor.wrapper.getScreenCTM().inverse().multiply(n.getScreenCTM());return parseFloat(getComputedStyle(n).fontSize)*Math.hypot(m.c,m.d);}));sizes.forEach(n=>near(n,24*25.4/72,'batch physical sizing'));
  await page.locator('[data-typography-action="bold"]').click();await page.locator('#editor-host').click({position:{x:10,y:10}});await choose('one');await page.keyboard.press('Control+i');await page.waitForFunction(()=>getComputedStyle(document.querySelector('#svgcontent [id$="-one"]')).fontStyle==='normal');
  await choose('part');await page.locator('[data-typography-action="bold"]').click();assert.equal(await page.locator('#svgcontent [id$="-part"]').evaluate(n=>getComputedStyle(n).fontWeight),'400');await choose('one');
  const locked=await page.locator('#svgcontent [id$="-locked"]').getAttribute('font-size');assert.equal(locked,'7');
  await page.screenshot({path:resolve(dir,'font-panel.png')});checks.push('mixed selection shows mixed values; batch typography compensates nested nonuniform scales; keyboard styling shares the panel behavior and locked text remains unchanged');
  if(await page.locator('#read-local-fonts').count()){
    const before=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project.svgArtwork));await page.evaluate(()=>Object.defineProperty(window,'queryLocalFonts',{configurable:true,value:async()=>[{family:'QA Local Font'},{family:'QA Local Font'}]}));await page.locator('#read-local-fonts').click();await page.waitForFunction(()=>[...document.querySelectorAll('#typography-families option')].some(o=>o.value==='"QA Local Font"'));assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project.svgArtwork)),before);
    await page.evaluate(()=>Object.defineProperty(window,'queryLocalFonts',{configurable:true,value:async()=>{throw new DOMException('Denied','NotAllowedError');}}));await page.locator('#read-local-fonts').click();assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project.svgArtwork)),before);
    checks.push('simulated font-list success deduplicates families without changing artwork; denied permission keeps manual font editing available');
  }
  for(const side of ['outside','inside']){
    await fixture(side);
    for(const [command,key,end]of [['l','x',0],['c','x',.5],['r','x',1],['t','y',0],['m','y',.5],['b','y',1]]){
      await choose('a');await choose('b',true);await align(command);const b=await bounds(['a','b']),s=key==='x'?'w':'h';near(b.a[key]+b.a[s]*end,b.b[key]+b.b[s]*end,side+' alignment '+command);await undo();
    }
    await choose('a');await choose('b',true);const old=(await bounds(['b'])).b;await align('r','key');const b=await bounds(['a','b']);near(b.a.x+b.a.w,b.b.x+b.b.w,side+' key right');near(b.b.x,old.x,'key stationary');await undo();
    await choose('a');await align('c','panel');const panel=await page.evaluate(()=>{const s=window.__foldStudio,g=s.geometry,p=g.panels.find(p=>p.id===s.selection.panelId);return{x:s.selection.side==='inside'?g.minX+g.maxX-p.x-p.w:p.x,w:p.w};});const a=(await bounds(['a'])).a;near(a.x+a.w/2,panel.x+panel.w/2,side+' panel center');await undo();
    await choose('a');await align('t','sheet');const minY=await page.evaluate(()=>window.__foldStudio.geometry.minY);near((await bounds(['a'])).a.y,minY,side+' sheet top');await undo();
    await choose('a');await choose('b',true);await choose('c',true);await page.locator('#alignment-target').selectOption('selection');await page.locator('#alignment-distribution').selectOption('gaps');await page.locator('[data-inspector-action="align-dh"]').click();let boxes=Object.values(await bounds(['a','b','c'])).sort((a,b)=>a.x-b.x);near(boxes[1].x-boxes[0].x-boxes[0].w,boxes[2].x-boxes[1].x-boxes[1].w,side+' equal horizontal gaps');await undo();
    await choose('a');await choose('b',true);await page.locator('#alignment-distribution').selectOption('gaps');await page.locator('#alignment-gap').fill('7.5');await page.locator('[data-inspector-action="align-dh"]').click();boxes=Object.values(await bounds(['a','b'])).sort((a,b)=>a.x-b.x);near(boxes[1].x-boxes[0].x-boxes[0].w,7.5,side+' specified gap');await undo();
    await choose('a');await choose('b',true);await choose('c',true);await page.locator('#alignment-distribution').selectOption('centers');await page.locator('[data-inspector-action="align-dv"]').click();boxes=Object.values(await bounds(['a','b','c'])).sort((a,b)=>a.y+a.h/2-b.y-b.h/2);near((boxes[1].y+boxes[1].h/2)-(boxes[0].y+boxes[0].h/2),(boxes[2].y+boxes[2].h/2)-(boxes[1].y+boxes[1].h/2),side+' center distribution');await undo();
  }
  checks.push('both print sides: six affine-safe alignments, stationary key object, panel and sheet references, equal edge gaps, specified mm spacing for two objects, center distribution, and undo across transformed parents');
  await choose('a');await choose('b',true);await page.locator('#alignment-target').selectOption('selection');await page.locator('#alignment-distribution').selectOption('gaps');await page.locator('#alignment-gap').fill('-2');const before=await bounds(['a','b']);await page.locator('[data-inspector-action="align-dh"]').click();const after=await bounds(['a','b']);for(const id of ['a','b'])for(const key of ['x','y','w','h'])near(after[id][key],before[id][key],'invalid gap leaves geometry unchanged',1e-7);
  await choose('one');await edit('#typography-family','Georgia, serif');await page.locator('[data-typography-action="underline"]').click();await edit('#typography-family','url(https://example.com/font)');assert.equal(await page.locator('#typography-family').getAttribute('aria-invalid'),'true');await choose('one');
  await page.locator('#export-toggle').click();const download=page.waitForEvent('download');await page.locator('#export-svg').click();const file=resolve(dir,'edited.svg');await(await download).saveAs(file);const svg=readFileSync(file,'utf8');assert.ok(svg.includes('<text'));assert.ok(svg.includes('<tspan'));assert.ok(svg.includes('text-decoration'));assert.ok(!svg.includes('typography-family'));
  await page.locator('#project-input').setInputFiles(file);await ready();await page.locator('#expand-layers').click();await choose('one');assert.equal(await page.locator('#node-text').inputValue(),'第一行 Mixed\n第二行 Text');
  await page.evaluate(()=>window.__foldStudio.setTheme('slate'));await choose('a');await choose('b',true);await page.locator('#alignment-gap').fill('4');await page.screenshot({path:resolve(dir,'alignment-panel.png')});
  await page.setViewportSize({width:390,height:844});await page.locator('#right-sidebar:not([inert])').waitFor();assert.ok(await page.locator('#alignment-target').isVisible());await page.screenshot({path:resolve(dir,'phone-panel.png'),fullPage:true});
  checks.push('invalid values leave artwork unchanged; exported SVG retains editable text and spans, reopens with paragraph contents; panels remain usable in slate and phone layouts');
  if(url.startsWith('file:'))assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);writeFileSync(resolve(dir,'report.json'),JSON.stringify({checks,errors,networkRequests:requests.length},null,2));console.log(checks.join('\n'));
}catch(e){console.log({checks,errors});await page.screenshot({path:resolve(dir,'failure.png'),fullPage:true});throw e;}
finally{await browser.close();await server?.close();}
