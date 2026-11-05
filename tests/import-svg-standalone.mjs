import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const http=process.argv.includes('--http');let server,url=pathToFileURL(resolve('折间.html')).href;
if(http){
  const port=await new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
  server=spawn(process.execPath,['server.mjs','--port',String(port)],{stdio:'ignore'});url='http://127.0.0.1:'+port;
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
}
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium-1228/chrome-win64/chrome.exe'),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
let page;const errors=[],requests=[];
try{
  page=await browser.newPage({viewport:{width:1700,height:1100},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url())&&(!http||!r.url().startsWith(url)))requests.push(r.url());});
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');await page.waitForSelector('#editor-host[data-svg-ready="true"]');
  assert.match(await page.evaluate(()=>window.__foldStudio.editorEngine),/SVGCanvas/);assert.equal(await page.locator('iframe').count(),0);
  const source='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="-20 -10 400 200"><g id="original" data-name="原图层"><text id="brand" x="30" y="40" font-size="20">Offline SVG</text><g id="hidden" display="none"><rect width="20" height="20"/></g></g></svg>';
  await page.locator('#image-input').setInputFiles({name:'offline.svg',mimeType:'image/svg+xml',buffer:Buffer.from(source)});await page.waitForFunction(()=>!!window.__foldStudio.project.svgArtwork?.outside);
  const button=page.locator('#layers .tree-label').filter({hasText:'brand'}).first();const closed=await button.evaluate(el=>{const ids=[];for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open)ids.unshift(p.querySelector(':scope>summary [data-toggle-node]').dataset.toggleNode);return ids;});for(const id of closed)await page.locator('[data-toggle-node="'+id+'"]').click();await button.click();
  await page.locator('#node-text').fill('Offline main canvas');await page.locator('#node-text').blur();await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project.svgArtwork).includes('Offline main canvas'));
  const saved=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project));assert.equal(JSON.parse(saved).version,3);assert.ok(saved.includes('hidden'));
  const pending=page.waitForEvent('download');await page.locator('#save-project').click();mkdirSync('artifacts/svg-main',{recursive:true});await(await pending).saveAs(resolve('artifacts/svg-main/'+(http?'http':'offline')+'.fold'));
  await page.reload();await page.waitForSelector('html[data-ready="true"]');await page.waitForSelector('#editor-host[data-svg-ready="true"]');assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),saved);
  const exportEvent=page.waitForEvent('download');await page.locator('#export-toggle').click();await page.locator('#export-svg').click();const svgFile=resolve('artifacts/svg-main/'+(http?'http':'offline')+'.svg');await(await exportEvent).saveAs(svgFile);const svg=readFileSync(svgFile,'utf8');assert.ok(svg.includes('Offline main canvas'));assert.equal((svg.match(/<image\b/g)??[]).length,0);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);writeFileSync('artifacts/svg-main/'+(http?'http':'offline')+'-report.json',JSON.stringify({mainCanvas:true,legacyMigration:true,svgEditing:true,hiddenGroups:true,version3Save:true,recovery:true,vectorExport:true,errors,requests},null,2));console.log((http?'HTTP/CSP':'Offline file://')+' main SVG editor: native text, groups, engineering save/recovery and editable SVG export passed without external requests/errors.');
}catch(error){console.log({errors,requests,toast:await page?.locator('#toast').textContent().catch(()=>null)});throw error;}
finally{await browser.close();server?.kill();}
