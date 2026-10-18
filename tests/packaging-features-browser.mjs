import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
let serverOutput = '';
server.stdout.on('data', d => serverOutput += d);
server.stderr.on('data', d => serverOutput += d);
const url = `http://127.0.0.1:${port}`;

let browser;
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(url)).ok) { ready = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, serverOutput);

  const installed = process.env.FOLD_BROWSER_PATH ?? (process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1228/chrome-win64/chrome.exe') : '');
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(installed) ? { executablePath: installed } : {}),
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(url);
  await page.waitForSelector('html[data-ready="true"]');
  await page.waitForFunction(() => window.__foldStudio?.stats?.triangles > 0);

  // 1. Test expand / restore 2D editor via button and shortcut M
  console.log('Testing editor expansion...');
  assert.equal(await page.evaluate(() => window.__foldStudio.isExpanded), false);
  const split = page.locator('.canvas-split');
  await page.locator('#toggle-expand-editor').click();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__foldStudio.isExpanded), true);
  assert.ok(await split.evaluate(el => el.classList.contains('expanded-editor')));
  await page.screenshot({ path: resolve(artifacts, '07-expanded-editor.png'), fullPage: true });

  // Toggle back with shortcut 'M'
  await page.keyboard.press('m');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__foldStudio.isExpanded), false);
  assert.ok(!(await split.evaluate(el => el.classList.contains('expanded-editor'))));

  // 2. Test Barcode addition and editing
  console.log('Testing Barcode addition...');
  await page.locator('#add-barcode').click();
  await page.waitForTimeout(100);
  const barcodeLayer = await page.evaluate(() => {
    const proj = window.__foldStudio.project;
    return proj.layers.find(l => l.type === 'barcode');
  });
  assert.ok(barcodeLayer, 'Barcode layer should be created');
  assert.equal(barcodeLayer.format, 'ean13');

  // Verify inspector fields
  await page.waitForSelector('#prop-barcode-code');
  await page.locator('#prop-barcode-code').fill('6901234567892');
  await page.locator('#prop-barcode-code').blur();
  await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => window.__foldStudio.project.layers.find(l => l.type === 'barcode').code), '6901234567892');

  // Switch format to Code 128
  await page.locator('#prop-barcode-format').selectOption('code128');
  await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => window.__foldStudio.project.layers.find(l => l.type === 'barcode').format), 'code128');

  // 3. Test QR Code addition and editing
  console.log('Testing QR Code addition...');
  await page.locator('#add-qrcode').click();
  await page.waitForTimeout(100);
  const qrLayer = await page.evaluate(() => {
    const proj = window.__foldStudio.project;
    return proj.layers.find(l => l.type === 'qrcode');
  });
  assert.ok(qrLayer, 'QR Code layer should be created');
  await page.waitForSelector('#prop-qrcode-text');
  await page.locator('#prop-qrcode-text').fill('https://fold.studio/test-pack');
  await page.locator('#prop-qrcode-text').blur();
  await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => window.__foldStudio.project.layers.find(l => l.type === 'qrcode').text), 'https://fold.studio/test-pack');

  // 4. Test Symbol addition and editing
  console.log('Testing Packaging Symbol addition...');
  await page.locator('#add-symbol').click();
  await page.waitForTimeout(100);
  const symbolLayer = await page.evaluate(() => {
    const proj = window.__foldStudio.project;
    return proj.layers.find(l => l.type === 'symbol');
  });
  assert.ok(symbolLayer, 'Symbol layer should be created');
  await page.waitForSelector('#prop-symbol');
  await page.locator('#prop-symbol').selectOption('food-contact');
  await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => window.__foldStudio.project.layers.find(l => l.type === 'symbol').symbol), 'food-contact');

  // 5. Test Inspector empty selection panel add grid
  console.log('Testing panel-add-grid buttons...');
  await page.keyboard.press('Escape'); // deselect layer
  await page.waitForTimeout(100);
  assert.ok(await page.locator('#panel-add-barcode').isVisible());
  assert.ok(await page.locator('#panel-add-qrcode').isVisible());
  assert.ok(await page.locator('#panel-add-symbol').isVisible());

  await page.screenshot({ path: resolve(artifacts, '08-barcode-qrcode-symbols.png'), fullPage: true });

  assert.deepEqual(errors, [], 'No browser console or runtime errors during packaging element tests');
  console.log('Packaging features test completed successfully with 0 errors.');
} finally {
  await browser?.close();
  server.kill();
}
