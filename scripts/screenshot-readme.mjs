import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const server=await createServer({root,server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});
await server.listen();
const installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
let browser;
try{
  browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.waitForSelector('html[data-ready="true"]');
  await page.locator('#open-templates').click();
  await page.locator('[data-template="gable-handle-carton"]').click();
  if(await page.locator('#confirm-dialog').isVisible())await page.locator('#accept-confirm').click();
  await page.waitForFunction(()=>window.__foldStudio?.stats?.modelType==='gable-handle-carton');
  await page.locator('#fold-slider').fill('100');
  await page.locator('#fold-slider').dispatchEvent('input');
  await page.locator('#fit-3d').click();
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(3500);
  if(errors.length)throw new Error(errors.join('\n'));
  const target=resolve(root,'docs/images/fold-studio-workspace.png');
  mkdirSync(resolve(root,'docs/images'),{recursive:true});
  await page.screenshot({path:target});
  console.log('Saved docs/images/fold-studio-workspace.png (1600 × 1000)');
}finally{
  await browser?.close();
  await server.close();
}
