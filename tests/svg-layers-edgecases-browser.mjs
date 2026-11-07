import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const server=process.env.FOLD_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});if(server)await server.listen();
const url=process.env.FOLD_TEST_URL==='offline'?pathToFileURL(resolve('折间.html')).href:process.env.FOLD_TEST_URL??`http://127.0.0.1:${server.httpServer.address().port}`;
const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const directory=process.env.FOLD_TEST_ARTIFACTS??'artifacts/svg-layers-edgecases';
mkdirSync(directory,{recursive:true});
const results=[];
const source='<svg xmlns="http://www.w3.org/2000/svg" width="140" height="100"><defs><linearGradient id="paint"><stop stop-color="#9f2447"/><stop offset="1" stop-color="#2959a1"/></linearGradient></defs><g id="ARTWORK"><g id="items" transform="translate(5 7)"><rect id="a" data-name="匹配 A" width="18" height="13" fill="#bb3355"/><rect id="b" data-name="中间对象" x="24" width="18" height="13" fill="#347a42"/><rect id="c" data-name="匹配 C" x="48" width="18" height="13" fill="#3155aa"/></g><g id="target" transform="translate(70 35) rotate(23) scale(.8)"><rect width="15" height="10"/></g><g id="singular" transform="scale(0)"><rect width="10" height="10"/></g><svg id="viewport" x="10" y="45" width="40" height="25" viewBox="3 2 80 50"><rect x="3" y="2" width="80" height="50" fill="url(#paint)"/></svg><text id="words" x="5" y="90" font-size="10"><tspan id="part">测试文字</tspan></text></g></svg>';

async function fixture(markup=source){
  const page=await browser.newPage({viewport:{width:1800,height:1100},acceptDownloads:true});
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  await ready();
  await page.locator('#image-input').setInputFiles({name:'edgecases.svg',mimeType:'image/svg+xml',buffer:Buffer.from(markup)});
  await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project.svgArtwork).includes('ARTWORK'));await ready();
  const ids=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#svgcontent [id]')].filter(node=>node.id.startsWith('import-')).map(node=>[node.id.replace(/^import-[a-f0-9]+-/,''),node.id])));
  const label=id=>page.locator(`[data-node-id="${ids[id]??id}"]`);
  const row=id=>page.locator(`[data-tree-node="${ids[id]??id}"] > .tree-row`);
  async function reveal(id){
    const keys=await label(id).evaluate(node=>{
      const keys=[];for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open){const button=parent.querySelector(':scope>summary [data-toggle-node]');if(button)keys.unshift(button.dataset.toggleNode);}
      return keys;
    });
    for(const key of keys)await page.locator(`[data-toggle-node="${key}"]`).click();
  }
  const choose=async(id,options)=>{await reveal(id);await label(id).click(options);};
  const drag=async(from,to,position='inside')=>{
    await reveal(from);await reveal(to);
    await page.evaluate(({from,to})=>{
      const scroll=document.querySelector('.tree-scroll'),bounds=scroll.getBoundingClientRect();
      const boxes=[from,to].map(id=>document.querySelector(`[data-tree-node="${id}"] > .tree-row`).getBoundingClientRect());
      const top=Math.min(...boxes.map(box=>box.top))-bounds.top+scroll.scrollTop;
      const bottom=Math.max(...boxes.map(box=>box.bottom))-bounds.top+scroll.scrollTop;
      if(bottom-top<=scroll.clientHeight)scroll.scrollTop=Math.max(0,bottom-scroll.clientHeight);
    },{from:ids[from]??from,to:ids[to]??to});
    const box=await row(to).boundingBox();
    await row(from).dragTo(row(to),{targetPosition:{x:box.width*.5,y:position==='inside'?box.height*.5:position==='before'?2:box.height-2}});
  };
  return {page,ids,errors,ready,label,row,choose,reveal,drag};
}
async function check(name,action,markup){
  if(process.env.FOLD_LAYER_CASE&&!process.env.FOLD_LAYER_CASE.split(',').includes(name))return;
  console.log('Starting '+name);
  const test=await fixture(markup);
  let timer;
  try{await Promise.race([action(test),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Scenario timed out after 25 seconds')),25000);})]);assert.deepEqual(test.errors,[]);results.push({name,passed:true});}
  catch(error){results.push({name,passed:false,error:error.message,errors:test.errors});await test.page.screenshot({path:resolve(directory,name+'.png'),timeout:2000}).catch(()=>{});}
  finally{clearTimeout(timer);writeFileSync(resolve(directory,'report.json'),JSON.stringify({results},null,2));await test.page.close();}
  console.log(results.at(-1));
}
try{
  await check('filtered-shift-range',async({page,ids,choose})=>{
    await page.locator('#layer-search').fill('匹配');
    await choose('a');await choose('c',{modifiers:['Shift']});
    const selected=await page.evaluate(()=>window.svgCanvas.getSelectedElements().filter(Boolean).map(node=>node.id));
    assert.deepEqual(new Set(selected),new Set([ids.a,ids.c]),'search range selected an object outside the search results');
  });
  await check('inherited-lock-controls',async({page,ids,choose})=>{
    await choose('items');await page.locator(`[data-lock-node="${ids.items}"]`).click();
    const child=page.locator(`[data-lock-node="${ids.a}"]`);
    assert.equal(await child.isDisabled(),true,'inherited lock icon offers an ineffective unlock');
    assert.match(await child.getAttribute('title'),/组合/);
  });
  await check('inherited-visibility-controls',async({page,ids,choose})=>{
    await choose('items');await page.locator(`[data-visibility-node="${ids.items}"]`).click();
    assert.equal(await page.locator(`[data-visibility-node="${ids.a}"]`).isDisabled(),true,'inherited hidden state offers an ineffective show action');
  });
  await check('locked-context-menu',async({page,ids,choose,label})=>{
    await choose('a');await page.locator(`[data-lock-node="${ids.a}"]`).click();
    await label('a').click({button:'right'});
    assert.equal(await page.locator('#layer-context-menu [data-layer-command="delete"]').isDisabled(),true);
    assert.equal(await page.locator('#layer-context-menu [data-layer-command="duplicate"]').isDisabled(),true);
    assert.equal(await page.locator('#layer-context-menu [data-layer-command="lock"]').isDisabled(),false);
  });
  await check('multi-object-drag-history',async({page,ids,choose,drag,ready})=>{
    await choose('a');await choose('c',{modifiers:['Control']});
    await drag('a','target');
    for(const id of [ids.a,ids.c])assert.equal(await page.evaluate(id=>document.getElementById(id).parentElement.id,id),ids.target);
    const order=await page.evaluate(id=>[...document.getElementById(id).children].map(node=>node.id),ids.target);
    assert.ok(order.indexOf(ids.a)<order.indexOf(ids.c));
    await page.locator('#undo').click();await ready();
    for(const id of [ids.a,ids.c])assert.equal(await page.evaluate(id=>document.getElementById(id).parentElement.id,id),ids.items);
    await page.locator('#redo').click();await ready();
    for(const id of [ids.a,ids.c])assert.equal(await page.evaluate(id=>document.getElementById(id).parentElement.id,id),ids.target);
  });
  await check('invalid-transform-rollback',async({page,choose,drag})=>{
    await choose('a');await page.locator('#save-project').click();
    const before=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project));
    await drag('a','singular');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),before);
    assert.match(await page.locator('.tree-status').textContent(),/变换|逆/);
    await choose('a');await page.locator('#node-name').fill('恢复后继续编辑');await page.locator('#node-name').blur();
    await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project).includes('恢复后继续编辑'));
  });
  await check('viewport-gradient-reparent',async({page,ids,choose,drag})=>{
    await choose('viewport');
    const before=await page.locator(`[id="${ids.viewport}"]`).boundingBox();
    await drag('viewport','target');
    const after=await page.locator(`[id="${ids.viewport}"]`).boundingBox();
    for(const key of ['x','y','width','height'])assert.ok(Math.abs(before[key]-after[key])<1,`viewport changed ${key}`);
    assert.equal(await page.evaluate(id=>document.getElementById(id).parentElement.id,ids.viewport),ids.target);
    assert.match(await page.evaluate(()=>window.foldSvgSource()),/url\(#import-[a-z0-9]+-paint\)/);
  });
  await check('rename-draft-close-guard',async({page,ids,choose,label})=>{
    await choose('a');await page.locator('#save-project').click();
    await label('a').dblclick();await page.locator('.tree-rename').fill('还没确认的名称');
    const guarded=await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
    assert.equal(guarded,true,'rename draft can be lost without a close warning');
    await page.locator('.tree-rename').press('Escape');
    assert.equal(await page.evaluate(id=>document.getElementById(id).getAttribute('data-name'),ids.a),'匹配 A');
    assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),false);
  });
  await check('rename-draft-background-refresh',async({page,choose,label})=>{
    await choose('a');await label('a').dblclick();await page.locator('.tree-rename').fill('后台刷新时的草稿');
    await page.evaluate(()=>window.__foldStudio.nativeEditor.refreshTree());
    assert.equal(await page.locator('.tree-rename').inputValue(),'后台刷新时的草稿');
    await page.locator('.tree-rename').press('Enter');
    await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project).includes('后台刷新时的草稿'));
  });
  await check('rename-save-shortcut',async({page,ids,choose,label})=>{
    await choose('a');await label('a').dblclick();await page.locator('.tree-rename').fill('按保存直接确认');
    const download=page.waitForEvent('download');
    await page.keyboard.press('Control+S');const file=await download;
    await file.saveAs(resolve(directory,'rename.fold'));
    const saved=JSON.parse(readFileSync(resolve(directory,'rename.fold'),'utf8'));
    assert.ok(JSON.stringify(saved).includes('按保存直接确认'));
    assert.equal(await page.evaluate(id=>document.getElementById(id).getAttribute('data-name'),ids.a),'按保存直接确认');
  });
  await check('canvas-selection-reveals-filtered-object',async({page,ids,choose})=>{
    await choose('a');await page.locator('#layer-search').fill('匹配 A');
    await page.locator(`#svgcontent [id="${ids.b}"]`).click({force:true});
    assert.equal(await page.locator('#layer-search').inputValue(),'');
    assert.equal(await page.locator(`[data-node-id="${ids.b}"]`).getAttribute('class'),'tree-label selected');
  });
  await check('cycle-drop-rejected',async({page,choose,drag})=>{
    await choose('items');await page.locator('#save-project').click();
    const before=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project));
    await drag('items','a');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),before);
  });
  await check('drop-above-locked-object',async({page,ids,choose,drag})=>{
    await choose('b');await page.locator(`[data-lock-node="${ids.b}"]`).click();
    await choose('a');await drag('a','b','before');
    assert.equal(await page.evaluate(id=>document.getElementById(id).previousElementSibling.id,ids.a),ids.b);
    assert.equal(await page.evaluate(id=>document.getElementById(id).getAttribute('data-locked'),ids.b),'true');
  });
  await check('zero-scale-selection',async({page,choose})=>{
    await choose('singular');
    assert.ok(await page.locator('#node-name').isVisible());
    await page.locator('#node-name').fill('零缩放仍可改属性');await page.locator('#node-name').blur();
    await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project).includes('零缩放仍可改属性'));
  });
  await check('escaped-unicode-name',async({page,ids,choose,label,ready})=>{
    const name='图层 <>& "中文" 😀';
    await choose('a');await label('a').dblclick();await page.locator('.tree-rename').fill(name);await page.locator('.tree-rename').press('Enter');
    const download=page.waitForEvent('download');await page.locator('#save-project').click();
    const backup=await download;await backup.saveAs(resolve(directory,'unicode-name.fold'));
    assert.ok(JSON.stringify(JSON.parse(readFileSync(resolve(directory,'unicode-name.fold'),'utf8'))).includes(JSON.stringify(name)));
    await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('已在本机保存'));
    await page.reload();await ready();
    assert.equal(await page.evaluate(id=>document.getElementById(id).getAttribute('data-name'),ids.a),name);
    assert.equal(await label('a').textContent(),name);
  });
  await check('text-span-drag-affordance',async({row,reveal,ids})=>{
    await reveal('part');
    assert.equal(await row('part').getAttribute('draggable'),'true');
    assert.equal(await row('part').getAttribute('data-drag-owner'),ids.words,'text span sorting should explicitly act on the parent text');
    assert.match(await row('part').getAttribute('title'),/整段文字/);
  });
  await check('text-span-stacking',async({page,ids,choose,drag,ready})=>{
    const order=()=>page.evaluate(id=>[...document.getElementById(id).children].map(n=>n.id),ids.words);
    const positions=()=>page.evaluate(ids=>Object.fromEntries(['line1','line2','line3'].map(key=>{const node=document.getElementById(ids[key]),box=node.getBoundingClientRect();return[key,{x:box.x,y:box.y,width:box.width,height:box.height,fill:getComputedStyle(node).fill}];})),ids);
    const before=await positions(),original=await order();
    const unchanged=async()=>{const after=await positions();for(const key of Object.keys(before)){for(const axis of ['x','y','width','height'])assert.ok(Math.abs(after[key][axis]-before[key][axis])<.2,`${key} ${axis} changed`);assert.equal(after[key].fill,before[key].fill);}};
    await choose('line1');await page.locator('.tree-actions [data-layer-command="up"]').click();
    assert.deepEqual(await order(),[ids.line2,ids.line1,ids.line3]);await unchanged();
    await page.locator('#undo').click();await ready();assert.deepEqual(await order(),original);await unchanged();
    await page.locator('#redo').click();await ready();assert.deepEqual(await order(),[ids.line2,ids.line1,ids.line3]);await unchanged();
    await drag('line2','line3','before');assert.deepEqual(await order(),[ids.line1,ids.line3,ids.line2]);await unchanged();
    await choose('line2');await page.keyboard.press('Control+[');assert.deepEqual(await order(),[ids.line1,ids.line2,ids.line3]);await unchanged();
    await choose('line1');await drag('line1','destination');
    assert.equal(await page.evaluate(id=>document.getElementById(id).parentElement.id,ids.words),ids.destination);await unchanged();
    await page.locator('#undo').click();await ready();assert.equal(await page.evaluate(id=>document.getElementById(id).parentElement.id,ids.words),ids.ARTWORK);await unchanged();
  },'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><g id="ARTWORK"><text id="words" x="60" y="40" font-size="8" text-anchor="middle" transform="rotate(-12 60 50)"><tspan id="line1" x="60">第一段文字</tspan><tspan id="line2" x="60" dy="14" fill="#ab3456">第二段文字</tspan><tspan id="line3" x="60" dy="14">第三段文字</tspan></text><g id="destination" transform="translate(100 60) rotate(12) scale(.8)"><rect width="20" height="20"/></g></g></svg>');
  await check('text-object-stacking',async({page,ids,choose,drag,ready})=>{
    await choose('b');await page.locator('.tree-actions [data-layer-command="up"]').click();
    assert.equal(await page.evaluate(id=>document.getElementById(id).parentElement.lastElementChild.id,ids.b),ids.b);
    await page.locator('#undo').click();await ready();
    await drag('a','b','before');assert.equal(await page.evaluate(id=>document.getElementById(id).previousElementSibling.id,ids.a),ids.b);
  },'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><g id="ARTWORK"><text id="a" x="10" y="20">底层文字</text><text id="b" x="10" y="40">中层文字</text><text id="c" x="10" y="60">上层文字</text></g></svg>');
  await check('text-span-inline-stacking',async({page,ids,choose,drag,ready})=>{
    const positions=()=>page.evaluate(ids=>Object.fromEntries(['line1','line2','line3'].map(key=>{const n=document.getElementById(ids[key]);return[key,Array.from({length:n.getNumberOfChars()},(_,i)=>{const p=n.getStartPositionOfChar(i);return[p.x,p.y];})];})),ids);
    const original=await positions();
    const unchanged=async()=>{const current=await positions();for(const key of Object.keys(original))for(let i=0;i<original[key].length;i++)for(let axis=0;axis<2;axis++)assert.ok(Math.abs(original[key][i][axis]-current[key][i][axis])<.001,`${key} character ${i} axis ${axis} moved`);};
    await choose('line1');assert.equal(await page.locator(`[data-tree-node="${ids.line1}"] > .tree-row`).getAttribute('aria-selected'),'true');
    await page.locator('.tree-actions [data-layer-command="up"]').click();await unchanged();
    await drag('line3','line2','after');await unchanged();
    await page.locator('#undo').click();await ready();await unchanged();await page.locator('#undo').click();await ready();await unchanged();
    assert.equal(await page.evaluate(id=>document.getElementById(id).getAttribute('x'),ids.line2),null,'undo restores the original flowing SVG');
  },'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><g id="ARTWORK"><text id="words" x="130" y="50" font-size="8" text-anchor="end"><tspan id="line1">AA中文</tspan><tspan id="line2" fill="#ab3456" font-size="12">WW宽文字</tspan><tspan id="line3" dx="3" dy="5">末尾文字</tspan></text></g></svg>');
  await check('single-span-object-stacking',async({page,ids,choose})=>{
    await choose('part');await page.locator('.tree-actions [data-layer-command="up"]').click();
    assert.equal(await page.evaluate(id=>document.getElementById(id).previousElementSibling.id,ids.a),ids.b);
  },'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><g id="ARTWORK"><text id="a" x="10" y="20"><tspan id="part">单个文字分段</tspan></text><text id="b" x="10" y="40">另一个对象</text></g></svg>');
  await check('large-layer-search',async({page,choose})=>{
    assert.equal(await page.locator('.tree-label').filter({hasText:/^对象 /}).count(),1500);
    await page.locator('#layer-search').fill('对象 1499');await choose('node1499');
    await page.locator('#node-name').fill('批量文件命中');await page.locator('#node-name').blur();
    await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project).includes('批量文件命中'));
    await page.locator('#layer-search').fill('');assert.equal(await page.locator('.tree-label').filter({hasText:/^对象 /}).count(),1499);
  },'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="100"><g id="ARTWORK">'+Array.from({length:1500},(_,index)=>`<rect id="node${index}" data-name="对象 ${index}" x="${index%100}" y="${Math.floor(index/100)}" width="2" height="2"/>`).join('')+'</g></svg>');
  await check('capacity-import-is-atomic',async({page})=>{
    await page.locator('#save-project').click();
    const before=await page.evaluate(()=>({project:JSON.stringify(window.__foldStudio.project),source:window.foldSvgSource()}));
    const oversized='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'+Array.from({length:5990},(_,index)=>`<rect id="capacity-${index}" x="${index%100}" y="${Math.floor(index/100)}" width="1" height="1"/>`).join('')+'</svg>';
    await page.locator('#image-input').setInputFiles({name:'near-limit.svg',mimeType:'image/svg+xml',buffer:Buffer.from(oversized)});
    await page.waitForFunction(()=>!!document.querySelector('#svgcontent [id$="-capacity-5989"]')||document.querySelector('#toast').textContent.includes('导入失败'));
    assert.ok(await page.evaluate(source=>window.foldSvgSource()===source,before.source),'a capacity rejection left unsaved objects on the canvas');
    assert.ok(await page.evaluate(project=>JSON.stringify(window.__foldStudio.project)===project,before.project),'a rejected import changed the saved project');
  });
  writeFileSync(resolve(directory,'report.json'),JSON.stringify({results},null,2));
  console.log(JSON.stringify({results},null,2));
  if(results.some(result=>!result.passed))process.exitCode=1;
}finally{await browser.close();await server?.close();}
