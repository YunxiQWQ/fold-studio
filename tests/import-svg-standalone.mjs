import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

// Run after npm run build: exercises the bundled importer, not Vite modules.
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium-1228/chrome-win64/chrome.exe'),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
try{
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1500,height:1000}}),requests=[],errors=[];
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(resolve('折间.html')).href);await page.waitForSelector('html[data-ready="true"]');
  const count=await page.evaluate(()=>window.__foldStudio.project.layers.length);
  const source='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect x="5" y="5" width="50" height="50" fill="#325745"/><circle cx="25" cy="25" r="10" fill="#cd8935"/><text x="60" y="35" font-family="Arial" font-size="18">Offline SVG</text></svg>';
  await page.locator('#image-input').setInputFiles({name:'offline.svg',mimeType:'image/svg+xml',buffer:Buffer.from(source)});
  await page.waitForFunction(n=>window.__foldStudio.project.layers.length===n+2,count);
  const layers=await page.evaluate(()=>window.__foldStudio.project.layers.slice(-2));assert.equal(layers[0].type,'svg');assert.equal(layers[1].type,'text');
  await page.locator(`[data-select="${layers[1].id}"]`).click();await page.locator('#prop-text').fill('Offline edited');await page.locator('#prop-text').blur();
  await page.locator('#export-toggle').click();const pending=page.waitForEvent('download');await page.locator('#export-svg').click();const download=await pending;mkdirSync('artifacts/svg-import',{recursive:true});const path=resolve('artifacts/svg-import/standalone.svg');await download.saveAs(path);const output=readFileSync(path,'utf8');
  assert.ok(output.includes('Offline edited'));assert.match(output,/<rect/);assert.equal((output.match(/<image\b/g)??[]).length,0);assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  console.log('Bundled offline HTML imports SVG through the image picker, edits native text and exports editable vector artwork with zero network requests.');
}finally{await browser.close();}
