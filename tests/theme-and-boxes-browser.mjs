import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { BOX_TYPES } from '../src/geometry.js';

const projectRoot = resolve(import.meta.dirname, '..');
const artifacts = resolve(projectRoot, 'artifacts');
mkdirSync(artifacts, { recursive: true });

const port = await new Promise(r => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close(() => r(p));
  });
});

const server = spawn(process.execPath, [resolve(projectRoot, 'server.mjs'), '--port', String(port)], { cwd: projectRoot, stdio: 'pipe' });
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
  assert.ok(ready, 'Server failed to start:\n' + serverOutput);

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

  // 1. Load HTTP page and verify initial theme
  await page.goto(url);
  await page.waitForSelector('html[data-ready="true"]');
  await page.waitForFunction(() => window.__foldStudio?.stats?.triangles > 0);

  console.log('Testing Multi-Theme Selection & Medium Gray (Studio Neutral)...');
  const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
  assert.equal(initialTheme, 'light', 'Default theme should be light');

  // Take screenshot of Light mode
  await page.screenshot({ path: resolve(artifacts, 'theme-light.png'), fullPage: true });

  // 1. Open Theme Menu and Select Medium Gray (工业中灰)
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(50);
  const menuVisible = await page.evaluate(() => !document.getElementById('theme-menu').hasAttribute('hidden'));
  assert.ok(menuVisible, 'Theme menu should be visible after clicking theme toggle');

  await page.locator('#theme-menu button[data-theme-value="gray"]').click();
  await page.waitForTimeout(100);
  const grayTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(grayTheme, 'gray', 'Theme should switch to medium gray (工业中灰)');
  const grayStored = await page.evaluate(() => localStorage.getItem('fold-theme'));
  assert.equal(grayStored, 'gray', 'Medium gray should be persisted to localStorage');
  const btnTextGray = await page.locator('#theme-toggle .theme-text').textContent();
  assert.equal(btnTextGray.trim(), '工业中灰', 'Button text should show 工业中灰');

  // Take screenshot of Medium Gray (Studio Neutral)
  await page.screenshot({ path: resolve(artifacts, 'theme-medium-gray.png'), fullPage: true });

  // 2. Switch to Deep Dark (极夜深色)
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(50);
  await page.locator('#theme-menu button[data-theme-value="dark"]').click();
  await page.waitForTimeout(100);
  const darkTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(darkTheme, 'dark', 'Theme should switch to dark (极夜深色)');
  assert.equal(await page.evaluate(() => localStorage.getItem('fold-theme')), 'dark');
  await page.screenshot({ path: resolve(artifacts, 'theme-dark.png'), fullPage: true });

  // 3. Switch to Cold Slate (工程蓝灰)
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(50);
  await page.locator('#theme-menu button[data-theme-value="slate"]').click();
  await page.waitForTimeout(100);
  const slateTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(slateTheme, 'slate', 'Theme should switch to slate (工程蓝灰)');
  await page.screenshot({ path: resolve(artifacts, 'theme-slate.png'), fullPage: true });

  // 4. Switch to Warm Kraft (暖沙原纸)
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(50);
  await page.locator('#theme-menu button[data-theme-value="warm"]').click();
  await page.waitForTimeout(100);
  const warmTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(warmTheme, 'warm', 'Theme should switch to warm (暖沙原纸)');
  await page.screenshot({ path: resolve(artifacts, 'theme-warm.png'), fullPage: true });

  // 5. Test Persistence on reload with Medium Gray
  await page.evaluate(() => window.__foldStudio.setTheme('gray'));
  await page.evaluate(() => localStorage.setItem('fold-theme', 'gray'));
  await page.reload();
  await page.waitForSelector('html[data-ready="true"]');
  const persistedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(persistedTheme, 'gray', 'Medium gray theme should persist across page reload');
  assert.equal(await page.locator('#theme-toggle .theme-text').textContent(), '工业中灰');

  // 6. Test Shift+T Keyboard Shortcut Cycling
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyT');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(100);
  const cycledTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(cycledTheme, 'dark', 'Shift+T should cycle from gray to dark');

  console.log('Passed: Multi-theme selection (Gray/Dark/Slate/Light/Warm), persistence, Shift+T, and screenshots');

  // 2. Test All Packaging Types via the Template Dialog
  console.log(`Testing ${Object.keys(BOX_TYPES).length} Packaging Types via Templates Dialog...`);
  await page.locator('#open-templates').click();
  await page.waitForSelector('#templates-dialog[open]');
  const templateButtons = await page.locator('#box-templates button[data-template]').all();
  assert.equal(templateButtons.length, Object.keys(BOX_TYPES).length, `Expected ${Object.keys(BOX_TYPES).length} packaging template buttons in the dialog`);

  // Screenshot of templates dialog
  await page.screenshot({ path: resolve(artifacts, 'templates-dialog.png') });

  // Test category filtering in the dialog
  await page.locator('.filter-tab[data-filter="container"]').click();
  const visibleContainerCards = await page.locator('#box-templates button[data-template]:not([hidden])').count();
  const expectedContainers = Object.values(BOX_TYPES).filter(t => t.category === 'container').length;
  assert.equal(visibleContainerCards, expectedContainers, `Expected ${expectedContainers} container cards when container category filter is active`);

  // Switch back to all
  await page.locator('.filter-tab[data-filter="all"]').click();

  const expectedTypes = Object.keys(BOX_TYPES);
  for (const type of expectedTypes) {
    if (!await page.locator('#templates-dialog').isVisible()) {
      await page.locator('#open-templates').click();
      await page.waitForSelector('#templates-dialog[open]');
    }
    const btn = page.locator(`#box-templates button[data-template="${type}"]`);
    await btn.scrollIntoViewIfNeeded();
    await btn.click();

    // Confirm dialog appears if different type
    const confirmDialog = page.locator('#confirm-dialog');
    if (await confirmDialog.isVisible({ timeout: 400 }).catch(() => false)) {
      await page.locator('#accept-confirm').click();
      await confirmDialog.waitFor({ state: 'hidden' });
    }
    await page.locator('#templates-dialog').waitFor({ state: 'hidden' });

    // Verify project switched
    const currentType = await page.evaluate(() => window.__foldStudio.project.type);
    assert.equal(currentType, type, `Project type should be ${type}`);

    // Verify current-template card updated
    const cardTitle = await page.locator('#current-template-name').textContent();
    assert.equal(cardTitle.trim(), BOX_TYPES[type].name);

    // Verify 3D geometry rendered
    await page.waitForFunction(type => window.__foldStudio?.stats?.modelType===type && window.__foldStudio.stats.triangles>0,type);
    const stats = await page.evaluate(() => window.__foldStudio.stats);
    assert.ok(stats.triangles > 0, `Box type ${type} should have > 0 triangles`);
    console.log(`  ✓ Packaging type: ${type} (${BOX_TYPES[type].name}) - triangles: ${stats.triangles}`);

    await page.locator('.preview-stage').screenshot({path:resolve(artifacts,`${type}-3d-stage.png`)});
    if (type.startsWith('beverage-can') || type === 'glass-jar') await page.screenshot({ path: resolve(artifacts, `${type}-3d.png`) });
  }

  // 3. Test Standalone Offline HTML file
  console.log('Testing Standalone Offline File (折间.html)...');
  const standalonePath = resolve(projectRoot, '折间.html');
  assert.ok(existsSync(standalonePath), '折间.html must exist');
  
  const offlinePage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  offlinePage.on('pageerror', e => errors.push('Offline: ' + e.message));

  await offlinePage.goto(pathToFileURL(standalonePath).href);
  await offlinePage.waitForSelector('html[data-ready="true"]');
  await offlinePage.waitForFunction(() => window.__foldStudio?.stats?.triangles > 0);

  // Test theme selection in offline standalone file
  await offlinePage.locator('#theme-toggle').click();
  await offlinePage.waitForTimeout(50);
  await offlinePage.locator('#theme-menu button[data-theme-value="gray"]').click();
  await offlinePage.waitForTimeout(100);
  const offlineTheme = await offlinePage.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(offlineTheme, 'gray', 'Standalone offline file must support medium gray theme');
  await offlinePage.screenshot({ path: resolve(artifacts, 'standalone-medium-gray.png'), fullPage: true });

  await offlinePage.close();
  await page.close();

  assert.equal(errors.length, 0, 'No console errors expected:\n' + errors.join('\n'));
  console.log('All Theme and Box Type Browser Tests Passed Successfully!');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
