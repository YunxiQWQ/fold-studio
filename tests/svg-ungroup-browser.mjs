import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const directory=process.env.FOLD_TEST_ARTIFACTS??'artifacts/svg-ungroup';mkdirSync(directory,{recursive:true});const results=[];
const basic='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="-10 -5 160 100" fill="#93474e" font-family="Arial" font-size="12"><defs><linearGradient id="paint"><stop stop-color="#297345"/><stop offset="1" stop-color="#8ec16b"/></linearGradient></defs><g id="ARTWORK" transform="translate(4 3)"><rect id="background" x="0" y="0" width="110" height="60" fill="url(#paint)"/><text id="words" x="12" y="24"><tspan id="first" x="12">第一行</tspan><tspan id="second" x="12" dy="15">第二行</tspan></text><text id="other" x="24" y="64">独立文字</text></g></svg>';
const near=(actual,expected,message,tolerance=.8)=>assert.ok(Math.abs(actual-expected)<tolerance,`${message}: ${actual} versus ${expected}`);
const boxes=async(test,keys)=>Object.fromEntries(await Promise.all(keys.map(async key=>[key,await test.node(key).boundingBox()])));
async function fixture(markup=basic,{inside=false,drop=false}={}){
  const page=await browser.newPage({viewport:{width:1800,height:1100},acceptDownloads:true});page.setDefaultTimeout(9000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(url);
  const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();await ready();
  if(inside){await page.locator('#side-inside').click();await ready();}
  if(drop){await page.locator('#editor-host').evaluate((host,markup)=>{const transfer=new DataTransfer();transfer.items.add(new File([markup],'multi-layer.svg',{type:'image/svg+xml'}));host.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));},markup);}
  else await page.locator('#image-input').setInputFiles({name:'multi-layer.svg',mimeType:'image/svg+xml',buffer:Buffer.from(markup)});
  await page.waitForFunction(()=>!!document.querySelector('#svgcontent [id$="-words"]'));
  await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project.svgArtwork).includes('-words'));
  const ids=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#svgcontent [id]')].filter(n=>n.id.startsWith('import-')).map(n=>[n.id.replace(/^import-[a-f0-9]+-/,''),n.id])));
  const node=key=>page.locator(`[id="${ids[key]??key}"]`),label=key=>page.locator(`[data-node-id="${ids[key]??key}"]`),row=key=>page.locator(`[data-tree-node="${ids[key]??key}"] > .tree-row`);
  async function reveal(key){const closed=await label(key).evaluate(n=>{const r=[];for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open)r.unshift(p.querySelector(':scope>summary [data-toggle-node]').dataset.toggleNode);return r;});for(const id of closed)await page.locator(`[data-toggle-node="${id}"]`).click();}
  async function choose(key,options){await reveal(key);await label(key).click(options);}
  const command=async name=>{if(['up','down'].includes(name)){await page.locator(`.tree-actions [data-layer-command="${name}"]`).click();return;}await page.locator('#edit-menu-toggle').click();await page.locator(`#canvas-edit-menu [data-action="${name}"]`).click();};
  async function drag(from,to,position='before'){
    await reveal(from);await reveal(to);
    await page.evaluate(keys=>{const scroll=document.querySelector('.tree-scroll'),bounds=scroll.getBoundingClientRect(),rects=keys.map(id=>document.querySelector(`[data-tree-node="${id}"] > .tree-row`).getBoundingClientRect()),bottom=Math.max(...rects.map(b=>b.bottom))-bounds.top+scroll.scrollTop;scroll.scrollTop=Math.max(0,bottom-scroll.clientHeight);},[ids[from]??from,ids[to]??to]);
    const box=await row(to).boundingBox();await row(from).dragTo(row(to),{targetPosition:{x:box.width*.55,y:position==='inside'?box.height*.5:position==='before'?2:box.height-2}});
  }
  return {page,ready,ids,node,label,row,reveal,choose,command,drag,errors};
}
async function check(name,action,markup,options){
  if(process.env.FOLD_UNGROUP_CASE&&!name.includes(process.env.FOLD_UNGROUP_CASE))return;console.log('Starting '+name);let t;
  try{t=await fixture(markup,options);await action(t);assert.deepEqual(t.errors,[]);results.push({name,passed:true});}
  catch(error){results.push({name,passed:false,error:error.stack,errors:t?.errors});await t?.page.screenshot({path:resolve(directory,name+'.png'),timeout:2000}).catch(()=>{});}
  finally{await t?.page.close();writeFileSync(resolve(directory,'report.json'),JSON.stringify({results},null,2));}console.log(results.at(-1));
}
async function extraction(test){
  const {page,node,command,choose,ready}=test,keys=['background','words','other'],before=await boxes(test,keys);
  const group=await page.evaluate(()=>window.svgCanvas.getSelectedElements().filter(Boolean).map(n=>({id:n.id,tag:n.localName,name:n.getAttribute('data-name')})));
  assert.equal(group.length,1);assert.equal(group[0].tag,'g');assert.equal(group[0].name,'multi-layer');
  await command('ungroup');
  for(const key of keys){assert.equal(await node(key).evaluate(n=>n.parentElement.hasAttribute('data-fold-svg-wrapper')),true,key+' remains behind import wrappers');const box=await node(key).boundingBox();for(const attr of ['x','y','width','height'])near(box[attr],before[key][attr],key+' '+attr);}
  assert.equal(await page.locator(`#svgcontent [id="${group[0].id}"]`).count(),0);assert.ok(await node('paint').count());
  await page.locator('#undo').click();await ready();assert.equal(await node('words').evaluate(n=>n.parentElement.hasAttribute('data-fold-svg-wrapper')),false);
  await page.locator('#redo').click();await ready();assert.equal(await node('words').evaluate(n=>n.parentElement.hasAttribute('data-fold-svg-wrapper')),true);
  await choose('words');const box=await node('words').boundingBox(),hit=await node('first').boundingBox();await page.mouse.move(hit.x+hit.width/2,hit.y+hit.height/2);await page.mouse.down();await page.mouse.move(hit.x+hit.width/2+33,hit.y+hit.height/2+21,{steps:8});await page.mouse.up();
  const moved=await node('words').boundingBox();near(moved.x-box.x,33,'extracted text drag x',.25);near(moved.y-box.y,21,'extracted text drag y',.25);
  const save=page.waitForEvent('download');await page.locator('#save-project').click();const path=resolve(directory,'extracted.fold');await(await save).saveAs(path);const data=JSON.parse(readFileSync(path,'utf8'));assert.ok(JSON.stringify(data.svgArtwork).includes('-words'));
}
async function pixelDifference(page,before){return page.evaluate(async before=>{
  const after=window.foldSvgSource(),raster=async source=>{const doc=new DOMParser().parseFromString(source,'image/svg+xml'),root=doc.documentElement,b=root.getAttribute('viewBox').split(/[\s,]+/).map(Number),canvas=document.createElement('canvas');canvas.width=Math.ceil(b[2]*2);canvas.height=Math.ceil(b[3]*2);root.setAttribute('width',canvas.width);root.setAttribute('height',canvas.height);const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(new XMLSerializer().serializeToString(root));await image.decode();const context=canvas.getContext('2d');context.drawImage(image,0,0);return context.getImageData(0,0,canvas.width,canvas.height).data;};
  const [a,b]=await Promise.all([raster(before),raster(after)]);let sum=0,ink=0;for(let i=0;i<a.length;i+=4){if(a[i+3]||b[i+3])ink++;for(let c=0;c<4;c++)sum+=Math.abs(a[i+c]-b[i+c]);}return sum/Math.max(1,ink*4);
},before);}
try{
  await check('import-group-extract',extraction);
  await check('drop-group-extract',extraction,basic,{drop:true});
  await check('inside-group-extract',extraction,basic,{inside:true});
  await check('span-row-sort',async t=>{
    await t.reveal('first');assert.equal(await t.row('first').getAttribute('draggable'),'true');
    const before=await t.node('words').boundingBox();await t.drag('first','other','before');
    assert.equal(await t.node('words').evaluate(n=>n.parentElement.lastElementChild.id),t.ids.words);
    assert.equal(await t.node('first').evaluate(n=>n.parentElement.localName),'text');near((await t.node('words').boundingBox()).x,before.x,'span sorting position');
    await t.page.locator('#undo').click();await t.ready();assert.equal(await t.node('words').evaluate(n=>n.nextElementSibling.id),t.ids.other);
  });
  await check('drop-near-text-span',async t=>{
    await t.drag('other','first','after');assert.equal(await t.node('other').evaluate(n=>n.parentElement.id),await t.node('words').evaluate(n=>n.parentElement.id));
    assert.equal(await t.node('words').locator('text').count(),0,'text object was inserted inside another text');assert.ok(!(await t.page.locator('.tree-status').textContent()).includes('失败'));
  });
  await check('multi-front-back',async t=>{
    await t.choose('background');await t.choose('words',{modifiers:['Control']});await t.command('front');
    assert.deepEqual(await t.node('ARTWORK').evaluate(n=>[...n.children].map(c=>c.id)),[t.ids.other,t.ids.background,t.ids.words]);
    await t.command('back');assert.deepEqual(await t.node('ARTWORK').evaluate(n=>[...n.children].map(c=>c.id)),[t.ids.background,t.ids.words,t.ids.other]);
  });
  await check('pixel-appearance',async t=>{
    const before=await t.page.evaluate(()=>window.foldSvgSource());await t.command('ungroup');const diff=await pixelDifference(t.page,before);assert.ok(diff<.4,'ungroup changed pixels: '+diff);
  });
  await check('percentage-geometry',async t=>{
    const keys=['background','words','other'],before=await boxes(t,keys);await t.command('ungroup');
    for(const key of keys){const after=await t.node(key).boundingBox();for(const attr of ['x','y','width','height'])near(after[attr],before[key][attr],key+' percent '+attr);}
  },basic.replace('x="0" y="0" width="110" height="60"','x="10%" y="5%" width="60%" height="40%"').replaceAll('x="12"','x="10%"').replace('x="24" y="64"','x="20%" y="70%"'));
  await check('percentage-gradient',async t=>{
    const before=await t.page.evaluate(()=>window.foldSvgSource());await t.command('ungroup');const diff=await pixelDifference(t.page,before);assert.ok(diff<.4,'gradient viewport changed pixels: '+diff);
  },basic.replace('id="paint"','id="paint" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="0%"'));
  await check('cropped-viewport',async t=>{
    const before=await t.page.evaluate(()=>window.foldSvgSource());await t.command('ungroup');const diff=await pixelDifference(t.page,before);assert.ok(diff<.4,'viewport crop changed pixels: '+diff);
    assert.equal(await t.node('background').evaluate(n=>n.localName),'rect');assert.ok(await t.page.locator('#svgcontent clipPath').count());
  },basic.replace('x="0" y="0" width="110" height="60"','x="-30" y="-30" width="230" height="130"'));
  await check('stroke-on-viewport-edge',async t=>{
    const before=await t.page.evaluate(()=>window.foldSvgSource());await t.command('ungroup');const diff=await pixelDifference(t.page,before);assert.ok(diff<.4,'viewport edge stroke changed pixels: '+diff);
  },basic.replace('x="0" y="0" width="110" height="60"','x="-14" y="-8" width="160" height="100" stroke="#273747" stroke-width="5"'));
  await check('clipped-text-is-sortable',async t=>{
    const before=await t.page.evaluate(()=>window.foldSvgSource());await t.command('ungroup');assert.ok((await pixelDifference(t.page,before))<.4);
    assert.equal(await t.node('words').evaluate(n=>n.parentElement.hasAttribute('data-fold-svg-wrapper')),true);assert.match(await t.node('words').getAttribute('clip-path'),/^url\(#/);
    await t.choose('words');await t.command('front');assert.equal(await t.node('words').evaluate(n=>n.parentElement.lastElementChild.id),t.ids.words);
  },basic.replaceAll('x="12"','x="142"'));
  await check('original-layer-groups',async t=>{
    const before=await boxes(t,['background','words','other']);await t.command('ungroup');
    assert.equal(await t.node('ARTWORK').evaluate(n=>n.parentElement.hasAttribute('data-fold-svg-wrapper')),true);assert.equal(await t.node('words').evaluate(n=>n.parentElement.id),t.ids.ARTWORK);
    await t.choose('ARTWORK');await t.command('ungroup');for(const key of ['background','words']){assert.equal(await t.node(key).evaluate(n=>n.parentElement.hasAttribute('data-fold-svg-wrapper')),true);const after=await t.node(key).boundingBox();for(const attr of ['x','y','width','height'])near(after[attr],before[key][attr],key+' native group '+attr);}
  },basic.replace('<text id="other"','</g><g id="secondLayer" transform="translate(1 2)"><text id="other"'));
  await check('aggregate-effects-retained',async t=>{
    const before=await t.page.evaluate(()=>window.foldSvgSource());await t.command('ungroup');assert.equal(await t.node('ARTWORK').evaluate(n=>n.parentElement.hasAttribute('data-fold-svg-wrapper')),true);
    assert.ok((await pixelDifference(t.page,before))<.4);await t.choose('ARTWORK');const source=await t.page.evaluate(()=>window.foldSvgSource());await t.command('ungroup');assert.equal(await t.page.evaluate(()=>window.foldSvgSource()),source);assert.match(await t.page.locator('#message').textContent(),/整体透明度/);
  },basic.replace('id="ARTWORK"','id="ARTWORK" opacity=".65"'));
  await check('old-import-without-marker',async t=>{
    await t.page.evaluate(()=>window.svgCanvas.getSelectedElements().filter(Boolean)[0].removeAttribute('data-fold-import'));await t.command('ungroup');assert.equal(await t.node('words').evaluate(n=>n.parentElement.hasAttribute('data-fold-svg-wrapper')),true);
  });
  await check('adjacent-up-down',async t=>{
    await t.choose('background');await t.choose('words',{modifiers:['Control']});await t.command('up');assert.deepEqual(await t.node('ARTWORK').evaluate(n=>[...n.children].map(c=>c.id)),[t.ids.other,t.ids.background,t.ids.words]);
    await t.command('down');assert.deepEqual(await t.node('ARTWORK').evaluate(n=>[...n.children].map(c=>c.id)),[t.ids.background,t.ids.words,t.ids.other]);
    await t.page.locator('#undo').click();await t.ready();assert.deepEqual(await t.node('ARTWORK').evaluate(n=>[...n.children].map(c=>c.id)),[t.ids.other,t.ids.background,t.ids.words]);
  });
  await check('multiple-groups-ungroup',async t=>{
    await t.command('ungroup');await t.choose('ARTWORK');await t.choose('secondLayer',{modifiers:['Control']});
    const before=await boxes(t,['background','words','other']);await t.command('ungroup');
    for(const key of ['background','words','other']){assert.equal(await t.node(key).evaluate(n=>n.parentElement.hasAttribute('data-fold-svg-wrapper')),true);const box=await t.node(key).boundingBox();for(const attr of ['x','y','width','height'])near(box[attr],before[key][attr],key+' multi ungroup '+attr);}
    await t.page.locator('#undo').click();await t.ready();assert.equal(await t.node('words').evaluate(n=>n.parentElement.id),t.ids.ARTWORK);assert.equal(await t.node('other').evaluate(n=>n.parentElement.id),t.ids.secondLayer);
  },basic.replace('<text id="other"','</g><g id="secondLayer" transform="translate(1 2)"><text id="other"'));
  await check('direct-svg-ungroup',async t=>{
    const id=await t.node('words').evaluate(n=>n.closest('svg').id);await t.choose(id);assert.equal(await t.page.locator('.tree-actions [data-layer-command="ungroup"]').isDisabled(),false);await t.command('ungroup');
    assert.equal(await t.node('words').evaluate(n=>n.parentElement.localName),'g');assert.equal(await t.page.locator(`[id="${id}"]`).count(),0);
  });
  await check('span-cross-group',async t=>{
    const before=await t.node('words').boundingBox(),font=await t.node('words').evaluate(n=>getComputedStyle(n).fontSize);
    await t.drag('first','secondLayer','inside');assert.equal(await t.node('words').evaluate(n=>n.parentElement.id),t.ids.secondLayer);
    const after=await t.node('words').boundingBox();for(const key of ['x','y','width','height'])near(after[key],before[key],'text reparent '+key);assert.equal(await t.node('words').evaluate(n=>getComputedStyle(n).fontSize),font);assert.equal(await t.node('first').evaluate(n=>n.parentElement.id),t.ids.words);
  },basic.replace('<text id="other"','</g><g id="secondLayer" fill="#3158a7" font-size="25" transform="translate(1 2) scale(.7)"><text id="other"'));
  await check('import-after-selecting-nested-text',async t=>{
    await t.choose('first');await t.page.locator('#image-input').setInputFiles({name:'second.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><text id="newWords" x="5" y="25" font-size="10">第二份 SVG</text><rect x="0" y="0" width="3" height="3"/></svg>')});
    await t.page.waitForFunction(()=>!!document.querySelector('#svgcontent [id$="-newWords"]'));assert.deepEqual(await t.page.evaluate(()=>window.svgCanvas.getSelectedElements().filter(Boolean).map(n=>({name:n.getAttribute('data-name'),atRoot:n.parentElement.hasAttribute('data-fold-svg-wrapper')}))),[{name:'second',atRoot:true}]);
    assert.equal(await t.node('words').locator('svg,rect,g').count(),0);
  });
  if(!process.env.FOLD_TEST_URL)await check('failed-ungroup-restores-scene',async t=>{
    const before=await t.page.evaluate(()=>window.foldSvgSource());
    await t.page.evaluate(async()=>{const {ungroupSvgLayers}=await import('/src/svg-layer-operations.js'),api=window.__foldStudio.nativeEditor;try{ungroupSvgLayers(window.svgCanvas,api.wrapper,window.svgCanvas.getSelectedElements().filter(Boolean),{validate:()=>{throw Error('validation-probe');},source:()=>window.foldSvgSource()});}catch(error){if(error.message!=='validation-probe')throw error;}});
    assert.equal(await t.page.evaluate(()=>window.foldSvgSource()),before,'rejected ungroup left a partial scene');
  });
}finally{await browser.close();await server?.close();}
assert.ok(results.length);assert.equal(results.filter(r=>!r.passed).length,0,JSON.stringify(results.filter(r=>!r.passed),null,2));console.log(`SVG import grouping: ${results.length} scenarios passed.`);
