import {chromium} from 'playwright';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';

const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium-1228/chrome-win64/chrome.exe'),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
try{
  // Keep the context independent so page.close() cannot auto-dispose it after a
  // beforeunload dismissal (as browser.newPage()'s owned context would).
  const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForSelector('html[data-ready="true"]');
  await page.reload();await page.waitForSelector('html[data-ready="true"]');
  await page.locator('#project-name').click();await page.locator('#project-name').fill('需要关闭保护的工程');await page.locator('#project-name').blur();
  await page.waitForFunction(()=>window.__foldStudio.project.name==='需要关闭保护的工程'&&document.querySelector('#save-status').textContent.includes('已在本机保存'));
  assert.equal(await page.evaluate(()=>navigator.userActivation.hasBeenActive),true);
  const dialogEvent=new Promise(resolve=>page.once('dialog',async dialog=>{assert.equal(dialog.type(),'beforeunload');await dialog.dismiss();resolve();}));await page.close({runBeforeUnload:true});await dialogEvent;assert.equal(page.isClosed(),false);
  const download=page.waitForEvent('download');await page.locator('#save-project').click();await(await download).saveAs(resolve('artifacts/close-protection.fold'));
  assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),false);
  const closed=page.waitForEvent('close');await page.close({runBeforeUnload:true});await closed;
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/close-protection-report.json',JSON.stringify({initialClean:true,autoBackupKeepsWarning:true,nativeCloseDialog:true,dismissKeepsPage:true,manualSaveClearsWarning:true},null,2));
  console.log('Native browser close protection passed: initial clean state, unsaved changes after automatic backup, dismiss to keep editing, explicit project download to close without warning.');
}finally{await browser.close();await server.close();}
