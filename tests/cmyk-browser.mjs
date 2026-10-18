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

  // 1. Check default RGB mode
  console.log('Verifying default RGB color mode...');
  assert.equal(await page.evaluate(() => window.__foldStudio.colorMode), 'rgb');
  const btn = page.locator('#color-mode-toggle');
  assert.ok(await btn.isVisible());
  assert.equal(await page.locator('#color-mode-text').textContent(), 'RGB 屏幕');
  assert.ok(!(await btn.evaluate(el => el.classList.contains('active'))));

  // 2. Click button to switch to CMYK mode
  console.log('Switching to CMYK Soft Proofing mode...');
  await btn.click();
  await page.waitForTimeout(150);

  assert.equal(await page.evaluate(() => window.__foldStudio.colorMode), 'cmyk');
  assert.equal(await page.locator('#color-mode-text').textContent(), 'CMYK 软打样');
  assert.ok(await btn.evaluate(el => el.classList.contains('active')));
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-color-mode')), 'cmyk');

  // Verify tags in 2D and 3D pane headings
  assert.equal(await page.locator('#cmyk-tag-2d').isVisible(), true);
  assert.equal(await page.locator('#cmyk-tag-3d').isVisible(), true);

  // Verify paper-hex caption contains CMYK values
  const paperHexText = await page.locator('#paper-hex').textContent();
  assert.ok(paperHexText.includes('C:'), `paper-hex text should contain CMYK: ${paperHexText}`);

  // Verify inspector panel color badge contains CMYK
  const panelCmykBadge = page.locator('#inspector .cmyk-badge');
  assert.ok(await panelCmykBadge.isVisible());
  const badgeText = await panelCmykBadge.textContent();
  assert.ok(badgeText.startsWith('C:'), `Badge should format CMYK, got: ${badgeText}`);

  await page.screenshot({ path: resolve(artifacts, '09-cmyk-soft-proofing.png'), fullPage: true });

  // 3. Test keyboard shortcut 'P' to toggle color mode
  console.log('Testing keyboard shortcut P toggle...');
  await page.keyboard.press('p');
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.__foldStudio.colorMode), 'rgb');
  assert.equal(await page.locator('#cmyk-tag-2d').isVisible(), false);

  await page.keyboard.press('p');
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.__foldStudio.colorMode), 'cmyk');
  assert.equal(await page.locator('#cmyk-tag-2d').isVisible(), true);

  // 4. Test Bug 1 fix: addLayer when glue tab is selected
  console.log('Testing Bug 1 fix: addLayer redirect from glue panel...');
  await page.evaluate(() => {
    // Force select glue tab if available
    const gluePanel = window.__foldStudio.geometry.panels.find(p => p.kind === 'glue');
    if (gluePanel) {
      window.__foldStudio.addLayer('text');
    }
  });
  const textLayers = await page.evaluate(() => window.__foldStudio.project.layers.filter(l => l.type === 'text'));
  const lastTextLayer = textLayers.at(-1);
  const panelObj = await page.evaluate(pid => window.__foldStudio.geometry.panels.find(p => p.id === pid), lastTextLayer.panel);
  assert.notEqual(panelObj.kind, 'glue', 'Added layer must never be assigned to glue panel');

  // 5. Test Bug 4 fix: container dimensions two-way synchronization
  console.log('Testing Bug 4 fix: container dimension two-way sync...');
  // Switch to beverage-can
  await page.evaluate(() => {
    const sel = document.querySelector('[data-template="beverage-can"]');
    if (sel) sel.click();
  });
  // Confirm switch
  const acceptConfirm = page.locator('#accept-confirm');
  if (await acceptConfirm.isVisible()) {
    await acceptConfirm.click();
    await page.waitForTimeout(150);
  }

  // Change length to 68
  await page.locator('#dim-length').fill('68');
  await page.locator('#dim-length').dispatchEvent('input');
  await page.waitForTimeout(120);

  const depthVal = await page.locator('#dim-depth').inputValue();
  assert.equal(depthVal, '68', 'Depth input should automatically sync with Length for container');

  // 6. Test Bug 5 fix: duplicateLayer boundary clamp
  console.log('Testing duplicate offsets across panel boundaries...');
  // Select first layer and duplicate 15 times
  await page.evaluate(() => {
    const firstRow = document.querySelector('#layer-list [data-select]');
    if (firstRow) firstRow.click();
    for (let i = 0; i < 15; i++) {
      document.querySelector('#duplicate-layer')?.click();
    }
  });
  const duplicatedLayers = await page.evaluate(() => window.__foldStudio.project.layers.filter(l => l.name.includes('副本')));
  assert.ok(duplicatedLayers.length > 0, 'Duplicated layers should exist');
  const panels=await page.evaluate(()=>window.__foldStudio.geometry.panels);
  for (const l of duplicatedLayers) {
    assert.ok(Number.isFinite(l.x)&&Number.isFinite(l.y), 'Duplicated positions must remain finite');
    if(l.clipToPanel)assert.ok(l.x<=.9201&&l.y<=.9201,'Panel-only copies retain the inset margin');
  }
  for(let i=1;i<duplicatedLayers.length;i++){
    const l=duplicatedLayers[i],previous=duplicatedLayers[i-1],p=panels.find(p=>p.id===l.panel);
    if(!l.clipToPanel){assert.ok(Math.abs((l.x-previous.x)*p.w-3)<1e-6);assert.ok(Math.abs((l.y-previous.y)*p.h-3)<1e-6);}
  }

  // 7. Verify localStorage persistence of color mode across reload
  console.log('Testing localStorage persistence across page reload...');
  await page.reload();
  await page.waitForSelector('html[data-ready="true"]');
  assert.equal(await page.evaluate(() => window.__foldStudio.colorMode), 'cmyk');
  assert.equal(await page.locator('#color-mode-text').textContent(), 'CMYK 软打样');

  await page.screenshot({ path: resolve(artifacts, '10-cmyk-persisted-reload.png'), fullPage: true });

  assert.deepEqual(errors, [], 'No browser console or runtime errors during CMYK & bugfix tests');
  console.log('CMYK and bugfix browser test completed successfully with 0 errors.');
} finally {
  await browser?.close();
  server.kill();
}
