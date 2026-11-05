import { chromium } from 'playwright';
import { createServer } from 'vite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { newProject, validateProject } from '../src/project.js';

const directory = resolve('artifacts/legacy-project');
mkdirSync(directory, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
await server.listen();
const installed = process.env.FOLD_BROWSER_PATH ?? resolve(process.env.LOCALAPPDATA ?? '', 'ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser = await chromium.launch({
  ...(existsSync(installed) ? { executablePath: installed } : {}),
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 }, acceptDownloads: true });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const ready = () => page.locator('#editor-host[data-svg-ready="true"]').waitFor();
const original = newProject();
const legacy = structuredClone(original);
legacy.version = 1;
delete legacy.insidePaper;
delete legacy.insidePanelColors;
legacy.layers.forEach(layer => { delete layer.side; });
const doubleSided = structuredClone(original);
doubleSided.insidePaper = '#c9bda6';
doubleSided.insidePanelColors.front = '#87aa91';
doubleSided.layers.push(...original.layers.slice(0, 3).map(layer => ({ ...layer, id: 'inside-' + layer.id, side: 'inside' })));
const fixtures = [
  ['v1-single-sided', legacy],
  ['v2-double-sided', doubleSided],
];
// Retained verification downloads also exercise real older serializations.
for (const file of ['artifacts/roundtrip.fold', 'artifacts/text-stretch.fold', 'artifacts/svg-import/imported.fold']) {
  if (existsSync(file)) fixtures.push([file.split('/').at(-1).replace('.fold', ''), JSON.parse(readFileSync(file, 'utf8'))]);
}
async function open(project, name) {
  project = structuredClone(project);
  project.name = name;
  await page.locator('#project-input').setInputFiles({ name: name + '.fold', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await page.waitForFunction(name => window.__foldStudio.project.name === name, name);
  await ready();
}
async function choose(id) {
  const row = page.locator(`[data-node-id="${id}"]`);
  const parents = await row.evaluate(element => {
    const keys = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && !parent.open) keys.unshift(parent.querySelector(':scope>summary [data-toggle-node]').dataset.toggleNode);
    }
    return keys;
  });
  for (const key of parents) await page.locator(`[data-toggle-node="${key}"]`).click();
  await row.click();
}
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.locator('html[data-ready="true"]').waitFor();
  for (const [name, source] of fixtures) {
    await open(source, name);
    const normalized = validateProject({ ...source, name });
    assert.deepEqual(await page.evaluate(() => window.__foldStudio.project), normalized);
    const results = [];
    for (const side of ['outside', 'inside']) {
      await page.locator('#side-' + side).click();
      await ready();
      const expectedLayers = normalized.layers.filter(layer => (layer.side ?? 'outside') === side);
      for (const layer of expectedLayers) assert.equal(await page.locator(`#svgcontent [id="${layer.id}"]`).count(), 1, name + ' retains ' + layer.name);
      if (!expectedLayers.length) continue;
      await choose(expectedLayers.find(layer => layer.type === 'text')?.id ?? expectedLayers[0].id);
      const field = page.locator('#node-name');
      await field.fill((await field.inputValue()) + ' verified');
      await field.blur();
      await page.waitForFunction(side => !!window.__foldStudio.project.svgArtwork?.[side], side);
      const difference = await page.evaluate(async ({ expected, side }) => {
        const [{ ImageCache, paintArtwork }, { svgSceneLayers }] = await Promise.all([import('/src/artwork.js'), import('/src/svg-scene.js')]);
        const geometry = window.__foldStudio.geometry;
        const paint = async project => {
          const images = new ImageCache();
          await images.preload([...svgSceneLayers(project, geometry), ...project.layers]);
          const canvas = document.createElement('canvas'), scale = 2;
          canvas.width = Math.ceil(geometry.width * scale); canvas.height = Math.ceil(geometry.height * scale);
          const context = canvas.getContext('2d');
          context.setTransform(side === 'inside' ? -scale : scale, 0, 0, scale, (side === 'inside' ? geometry.maxX : -geometry.minX) * scale, -geometry.minY * scale);
          paintArtwork(context, project, geometry, images, side);
          return context.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const before = await paint(expected), after = await paint(window.__foldStudio.project);
        let error = 0;
        for (let index = 0; index < before.length; index++) error += Math.abs(before[index] - after[index]);
        return error / before.length;
      }, { expected: normalized, side });
      assert.ok(difference < 2, `${name} ${side} changed appearance by ${difference}/255`);
      results.push({ side, meanChannelError: difference });
    }
    const save = page.waitForEvent('download');
    await page.locator('#save-project').click();
    const file = resolve(directory, name + '.fold');
    await (await save).saveAs(file);
    const migrated = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(migrated.version, 3);
    assert.deepEqual(migrated.dimensions, normalized.dimensions);
    for (const key of ['paper', 'insidePaper', 'panelColors', 'insidePanelColors']) assert.deepEqual(migrated[key], normalized[key]);
    for (const layer of normalized.layers.filter(layer => layer.type === 'image')) assert.ok(JSON.stringify(migrated).includes(layer.src));
    await open(migrated, name + '-reopened');
    assert.deepEqual(await page.evaluate(() => window.__foldStudio.project), { ...migrated, name: name + '-reopened' });
    checks.push({ name, version: source.version, layerCount: normalized.layers.length, comparisons: results, savedAndReopened: true });
  }
  const grouped = structuredClone(original);
  grouped.layers[0].group = 'legacy-a';
  grouped.layers[2].group = 'legacy-a';
  await open(grouped, 'v2-interleaved-group');
  await choose(grouped.layers[0].id);
  const selected = await page.evaluate(() => window.svgCanvas.getSelectedElements().filter(Boolean).map(node => node.id));
  assert.ok(selected.includes(grouped.layers[2].id), 'legacy group membership must survive migration');
  const groupIds = [grouped.layers[0].id, grouped.layers[2].id];
  const positions = await page.evaluate(ids => ids.map(id => document.getElementById(id).getBoundingClientRect().toJSON()), groupIds);
  await page.keyboard.press('Control+D');
  const duplicates = await page.evaluate(() => window.svgCanvas.getSelectedElements().filter(Boolean).map(node => ({ id: node.id, group: node.getAttribute('data-fold-group') })));
  assert.equal(duplicates.length, 2);
  assert.ok(duplicates.every(node => !groupIds.includes(node.id)));
  assert.equal(new Set(duplicates.map(node => node.group)).size, 1);
  for (let index = 0; index < groupIds.length; index++) {
    const current = await page.locator(`[id="${groupIds[index]}"]`).boundingBox();
    assert.ok(Math.abs(current.x - positions[index].x) < 1 && Math.abs(current.y - positions[index].y) < 1, 'duplicating must leave originals in place');
  }
  await page.locator('#save-project').click();
  const migratedGroup = await page.evaluate(() => window.__foldStudio.project);
  await open(migratedGroup, 'v3-groups-reopened');
  await choose(grouped.layers[0].id);
  assert.deepEqual(new Set(await page.evaluate(() => window.svgCanvas.getSelectedElements().filter(Boolean).map(node => node.id))), new Set(groupIds));
  await page.locator('#edit-menu-toggle').click();
  await page.locator('[data-action="ungroup"]').click();
  await page.locator('#save-project').click();
  await choose(grouped.layers[0].id);
  assert.equal(await page.evaluate(() => window.svgCanvas.getSelectedElements().filter(Boolean).length), 1);
  await page.locator('#undo').click();
  await ready();
  await choose(grouped.layers[0].id);
  assert.equal(await page.evaluate(() => window.svgCanvas.getSelectedElements().filter(Boolean).length), 2);
  checks.push({ name: 'interleaved-legacy-groups', selection: true, independentDuplicate: true, savedAndReopened: true, ungroupAndUndo: true });
  assert.deepEqual(errors, []);
  writeFileSync(resolve(directory, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ completed: checks, errors }, null, 2));
  await page.screenshot({ path: resolve(directory, 'failure.png') });
  throw error;
} finally {
  await browser.close();
  await server.close();
}
