import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..'),dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/toolbox-home');mkdirSync(dir,{recursive:true});
assert.ok(existsSync(resolve(root,'dist/toolbox/index.html')),'Run npm run build:site first');
let server,output='';
const url=process.env.FOLD_SITE_TEST_URL??await new Promise((yes,no)=>{
  server=spawn(process.execPath,['server.mjs','--port','0'],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const timeout=setTimeout(()=>{server.kill();no(Error('Site preview did not start: '+output));},15000);
  server.on('error',e=>{clearTimeout(timeout);no(e);});
  const log=data=>{output+=data;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);yes(match[0]);}};
  server.stdout.on('data',log);server.stderr.on('data',log);
});
const exe=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
const page=await context.newPage(),checks=[],errors=[],requests=[],dialogs=[];page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.stack));page.on('request',r=>requests.push(r.url()));page.on('dialog',d=>{dialogs.push(d.type());d.accept();});
await page.addInitScript(()=>{
  window.__toolboxStorage=[];
  for(const name of ['getItem','setItem','removeItem','clear']){const original=Storage.prototype[name];Storage.prototype[name]=function(...args){window.__toolboxStorage.push(name);return original.apply(this,args);};}
  const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.__toolboxStorage.push('indexedDB');return open(...args);};
});
const fold=()=>page.locator('a[href="/fold"]'),frame=()=>page.locator('a[href="https://github.com/YunxiQWQ/zhenxia/releases/latest"]');
const htmlText=value=>value.replace(/\r/g,'');
async function band(color){await page.waitForFunction(color=>getComputedStyle(document.querySelector('header')).backgroundColor===color,color);}
try{
  const config=JSON.parse(readFileSync(resolve(root,'vercel.json'),'utf8'));
  assert.ok(config.rewrites.some(r=>r.source==='/fold'&&r.destination==='/fold.html'));
  assert.ok(!config.redirects?.some(r=>r.source==='/'));
  const response=await page.request.get(url+'/');assert.equal(response.status(),200);
  const html=await response.text();assert.ok(html.includes('<title>雲溪工具箱</title>')&&!html.includes('figma:'));
  assert.equal(htmlText(html),htmlText(readFileSync(resolve(root,'dist/index.html'),'utf8')),'the on-disk root index must itself be the homepage');
  assert.ok(html.includes('/toolbox/assets/')&&html.includes('noindex, nofollow'));
  const foldHTML=readFileSync(resolve(root,'dist/fold.html'),'utf8');
  assert.ok(foldHTML.includes('id="app"')&&!foldHTML.includes('/toolbox/assets/'));
  for(const path of ['/fold','/fold/','/fold/index.html'])assert.equal(htmlText(await(await page.request.get(url+path)).text()),htmlText(foldHTML));
  for(const asset of foldHTML.matchAll(/(?:src|href)="\.\/([^" ]+\.(?:js|css))"/g)){
    const direct=await page.request.get(url+'/'+asset[1]),prefixed=await page.request.get(url+'/fold/'+asset[1]);
    assert.equal(direct.status(),200);assert.equal(prefixed.status(),200);assert.deepEqual(await direct.body(),await prefixed.body());
  }
  for(const path of ['/unknown-tool-404','/fold/unknown-tool-404','/robots.txt'])assert.equal((await page.request.get(url+path)).status(),404);
  if(['127.0.0.1','localhost'].includes(new URL(url).hostname))assert.equal((await page.request.post(url+'/')).status(),405);
  checks.push('actual production files serve the toolbox at /, Fold at /fold and /fold/, with separate assets, no global robots block and real 404s');

  await page.goto(url);await page.getByRole('heading',{name:'雲溪工具箱',exact:true}).waitFor();
  assert.equal(await page.title(),'雲溪工具箱');assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  assert.equal(await page.locator('section[aria-label="工具列表"] h2').count(),2);await fold().waitFor();await frame().waitFor();
  assert.ok((await frame().textContent()).includes('下载 Windows 版'));assert.equal(await page.getByText(/筹备中|介绍待补充|图待补/).count(),0);
  assert.equal(await page.getByRole('img',{name:'截图、贴图和剪贴板功能示意'}).count(),1);
  await page.waitForFunction(()=>document.fonts.status==='loaded');
  for(const width of [1280,1440,1920]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' desktop overflow');}
  await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:resolve(dir,'toolbox-desktop.png'),fullPage:true,animations:'disabled'});
  checks.push('desktop layout at 1280/1440/1920 keeps the original design; both real tools have complete copy, illustrations and usable entry links');

  await fold().hover();await band('rgb(255, 68, 22)');assert.equal(await fold().locator('[data-folded]').getAttribute('data-folded'),'true');
  assert.equal(await fold().evaluate(n=>!!n.style.getPropertyValue('--spin')),true);
  await page.screenshot({path:resolve(dir,'toolbox-fold-hover.png'),fullPage:true,animations:'disabled'});
  await page.locator('header').hover();await band('rgb(30, 43, 255)');
  await fold().focus();await band('rgb(255, 68, 22)');await page.keyboard.press('Tab');assert.equal(await frame().evaluate(n=>document.activeElement===n),true);await band('rgb(10, 10, 10)');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.ok(await page.locator('h1').evaluate(n=>parseFloat(getComputedStyle(n).animationDuration)<.001&&parseFloat(getComputedStyle(n).animationDelay)===0));
  checks.push('hover folds the CSS preview and changes the band; keyboard focus reaches both links; reduced motion removes animation and entry delays');

  assert.deepEqual(await page.evaluate(()=>window.__toolboxStorage),[]);assert.deepEqual(await context.cookies(),[]);
  assert.ok(requests.every(r=>new URL(r).origin===new URL(url).origin));assert.ok(!requests.some(r=>new URL(r).pathname.startsWith('/assets/')));
  checks.push('navigation page uses no cookies, local storage, IndexedDB, analytics, external fonts or Fold bundle before entering Fold');

  await fold().click();await page.waitForURL(url+'/fold');await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  assert.equal(await page.evaluate(()=>window.__foldStudio.editorEngine),'SVG-edit / SVGCanvas 7.4.2');
  await page.locator('#project-name').fill('工具箱导航回跳保留测试');await page.locator('#project-name').blur();
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('已在本机保存'));
  const download=page.waitForEvent('download');await page.locator('#save-project').click();await(await download).saveAs(resolve(dir,'navigation.fold'));
  await page.goto(url);await fold().waitFor();assert.deepEqual(await page.evaluate(()=>window.__toolboxStorage),[]);
  await fold().click();await page.waitForURL(url+'/fold');await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  assert.equal(await page.evaluate(()=>window.__foldStudio.project.name),'工具箱导航回跳保留测试');
  await page.goto(url+'/fold/');await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  assert.equal(await page.evaluate(()=>window.__foldStudio.project.name),'工具箱导航回跳保留测试');
  checks.push('real homepage link opens the SVG editor; returning through the homepage preserves the browser-saved Fold project');
  assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:resolve(dir,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{writeFileSync(resolve(dir,'report.json'),JSON.stringify({checks,errors,dialogs,requests},null,2));console.log({checks,errors,dialogs});await browser.close();server?.kill();}
