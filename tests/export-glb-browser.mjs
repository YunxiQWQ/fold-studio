import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const artifacts = resolve('artifacts');
mkdirSync(artifacts, { recursive: true });

const port = await new Promise(r => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close(() => r(p));
  });
});

const server = spawn(process.execPath, ['server.mjs', '--port', String(port)], { stdio: 'pipe' });
const url = `http://127.0.0.1:${port}`;
let browser;

function verifyGLBBuffer(buf) {
  assert.ok(buf.length > 20, 'GLB file too small');
  // GLB header:
  // uint32 magic = 0x46546C67 ('glTF')
  // uint32 version = 2
  // uint32 length
  const magic = buf.readUInt32LE(0);
  assert.equal(magic, 0x46546c67, 'Magic number must be glTF');
  const version = buf.readUInt32LE(4);
  assert.equal(version, 2, 'glTF version must be 2');
  const length = buf.readUInt32LE(8);
  assert.equal(length, buf.length, 'GLB header length must match buffer size');
  console.log(`  -> Valid GLB: version ${version}, total size ${buf.length} bytes (${(buf.length/1024).toFixed(1)} KB)`);
}

try {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }

  const executable = process.env.FOLD_BROWSER_PATH ?? resolve(process.env.LOCALAPPDATA ?? '', 'ms-playwright/chromium-1228/chrome-win64/chrome.exe');
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(executable) ? { executablePath: executable } : {}),
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader']
  });

  console.log('Testing GLB 3D Model export on HTTP page...');
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await page.goto(url);
  await page.waitForSelector('html[data-ready="true"]');
  await page.waitForFunction(() => window.__foldStudio?.stats?.triangles > 0);

  // 1. Open export dropdown
  await page.locator('#export-toggle').click();
  assert.equal(await page.locator('#export-menu').isVisible(), true);

  // 2. Click export-glb
  await page.locator('#export-glb').click();
  assert.equal(await page.locator('#export-glb-dialog').isVisible(), true);

  // 3. Test closed state export
  await page.locator('input[name="glb-fold"][value="closed"]').check();
  const downloadPromise1 = page.waitForEvent('download');
  await page.locator('#confirm-export-glb').click();
  const downloadItem1 = await downloadPromise1;
  const glbPath1 = resolve(artifacts, 'exported-closed.glb');
  await downloadItem1.saveAs(glbPath1);

  const buf1 = readFileSync(glbPath1);
  verifyGLBBuffer(buf1);

  // 4. Test flat state export
  await page.locator('#export-toggle').click();
  await page.locator('#export-glb').click();
  await page.locator('input[name="glb-fold"][value="flat"]').check();
  const downloadPromise2 = page.waitForEvent('download');
  await page.locator('#confirm-export-glb').click();
  const downloadItem2 = await downloadPromise2;
  const glbPath2 = resolve(artifacts, 'exported-flat.glb');
  await downloadItem2.saveAs(glbPath2);

  const buf2 = readFileSync(glbPath2);
  verifyGLBBuffer(buf2);

  // 5. Test offline standalone HTML export
  console.log('Testing GLB 3D Model export on offline standalone HTML file...');
  const offlinePage = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await offlinePage.goto(pathToFileURL(resolve('折间.html')).href);
  await offlinePage.waitForSelector('html[data-ready="true"]');
  await offlinePage.waitForFunction(() => window.__foldStudio?.stats?.triangles > 0);

  await offlinePage.locator('#export-toggle').click();
  await offlinePage.locator('#export-glb').click();
  assert.equal(await offlinePage.locator('#export-glb-dialog').isVisible(), true);

  const downloadPromise3 = offlinePage.waitForEvent('download');
  await offlinePage.locator('#confirm-export-glb').click();
  const downloadItem3 = await downloadPromise3;
  const glbPath3 = resolve(artifacts, 'offline-exported.glb');
  await downloadItem3.saveAs(glbPath3);

  const buf3 = readFileSync(glbPath3);
  verifyGLBBuffer(buf3);

  // 6. Test Container GLB export (beverage cans and screw-top metal tin)
  console.log('Testing Container GLB export (beverage cans & screw-top metal tin)...');
  for (const containerType of ['beverage-can-250-slim', 'beverage-can', 'beverage-can-500-tall', 'screw-metal-tin']) {
    await page.locator('#open-templates').click();
    await page.waitForSelector('#templates-dialog[open]');
    await page.locator(`#box-templates button[data-template="${containerType}"]`).click();
    if (await page.locator('#confirm-dialog').isVisible()) {
      await page.locator('#accept-confirm').click();
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(() => window.__foldStudio?.stats?.triangles > 0);

    await page.locator('#export-toggle').click();
    await page.locator('#export-glb').click();
    await page.locator('input[name="glb-fold"][value="closed"]').check();
    const dlPromise = page.waitForEvent('download');
    await page.locator('#confirm-export-glb').click();
    const dl = await dlPromise;
    const glbPath = resolve(artifacts, `${containerType}-exported.glb`);
    await dl.saveAs(glbPath);
    const buf = readFileSync(glbPath);
    console.log(`Checking ${containerType} GLB:`);
    verifyGLBBuffer(buf);
  }

  console.log('All GLB Export tests passed successfully!');
} finally {
  await browser?.close();
  server.kill();
}
