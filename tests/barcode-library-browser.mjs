import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {BARCODE_FORMATS} from '../src/barcode-formats.js';
import {barcodeStatus,gs1Payload} from '../src/barcode.js';
import {newProject} from '../src/project.js';
import {scanBarcodes} from './helpers/barcode-reader.mjs';
import {chooseExport} from './helpers/export-ui.mjs';

const root=resolve(import.meta.dirname,'..'),dir=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/barcode-upgrade/browser');mkdirSync(dir,{recursive:true});
let server,output='',stage='startup';
const url=process.env.FOLD_TEST_OFFLINE?pathToFileURL(resolve(root,'折间.html')).href:process.env.FOLD_SITE_TEST_URL??await new Promise((yes,no)=>{
  server=spawn(process.execPath,['server.mjs','--port','0'],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const timeout=setTimeout(()=>{server.kill();no(Error(output));},15000);server.on('error',e=>{clearTimeout(timeout);no(e);});
  const log=b=>{output+=b;const m=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timeout);yes(m[0]+'/fold');}};server.stdout.on('data',log);server.stderr.on('data',log);
});
const exe=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(exe)?{executablePath:exe}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1100},acceptDownloads:true}),checks=[],errors=[],network=[];
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));if(process.env.FOLD_TEST_OFFLINE)page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
const ready=()=>page.locator('#editor-host[data-svg-ready="true"]').waitFor();
const generator=()=>page.evaluate(()=>{const a=window.__foldStudio.nativeEditor,n=a.canvas.getSelectedElements().find(Boolean),p=window.__foldStudio.project;return p.svgGenerators?.[n.id]??p.layers.find(layer=>layer.id===n.id);});
const selectedMarkup=()=>page.evaluate(()=>window.__foldStudio.nativeEditor.canvas.getSelectedElements().find(Boolean).innerHTML);
async function choose(id){await page.evaluate(id=>{const a=window.__foldStudio.nativeEditor;a.canvas.selectOnly([a.wrapper.querySelector('#'+CSS.escape(id))]);a.refreshProperties();},id);await page.locator('#native-code').waitFor();}
async function reopen(file){await page.evaluate(()=>window.__barcodePreviousProject=window.__foldStudio.project);await page.locator('#project-input').setInputFiles(file);await page.waitForFunction(()=>window.__foldStudio.project!==window.__barcodePreviousProject);await ready();}
async function raster(){
  const png=await page.evaluate(async()=>{
    const api=window.__foldStudio.nativeEditor,node=api.canvas.getSelectedElements().find(Boolean),b=node.getBBox(),copy=node.cloneNode(true);copy.removeAttribute('transform');
    const pad=1,svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x-pad} ${b.y-pad} ${b.width+2*pad} ${b.height+2*pad}"><rect x="${b.x-pad}" y="${b.y-pad}" width="${b.width+2*pad}" height="${b.height+2*pad}" fill="white"/>${new XMLSerializer().serializeToString(copy)}</svg>`;
    const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();
    const canvas=document.createElement('canvas');canvas.width=Math.ceil((b.width+2*pad)*16);canvas.height=Math.ceil((b.height+2*pad)*16);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png').split(',')[1];
  });return Buffer.from(png,'base64');
}
try{
  await page.goto(url);await ready();const project=newProject('carton');project.name='条码测试';project.layers=[];
  await page.locator('#project-input').setInputFiles({name:'barcode-test.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>window.__foldStudio.project.name==='条码测试');await ready();
  await page.locator('#add-barcode').click();await page.locator('#native-code').waitFor();const id=(await generator()).id;
  await page.locator('#native-code').fill('590123412345');await page.locator('#native-code').press('Tab');assert.equal((await generator()).code,'590123412345','the first edit must not be overwritten by the legacy layer during migration');
  assert.equal(await page.locator('#native-barcode-format option').count(),14);
  assert.equal(await page.locator('#native-barcode-text').evaluate(el=>getComputedStyle(el.parentElement).display),'flex');
  assert.equal(await page.locator('#native-barcode-text').evaluate(el=>getComputedStyle(el.parentElement).flexDirection),'row');
  const formats={ean13:'EAN-13',ean8:'EAN-8',upca:'UPC-A',upce:'UPC-E',itf:'ITF',itf14:'ITF',code39:'Code39',code93:'Code93',codabar:'Codabar'};
  for(const spec of BARCODE_FORMATS){
    stage='generate and scan '+spec.id;await page.locator('#native-barcode-format').selectOption(spec.id);await page.locator('#native-barcode-example').click();await page.waitForFunction(({id,format,code})=>{const g=window.__foldStudio.project.svgGenerators[id];return g?.format===format&&g.code===code;},{id,format:spec.id,code:spec.example});
    assert.equal(await page.locator('#native-code').getAttribute('aria-invalid'),'false');
    const png=await raster();writeFileSync(resolve(dir,spec.id+'.png'),png);const found=await scanBarcodes(png,[formats[spec.id]??'Code128']);assert.equal(found.length,1,spec.id+' actual SVG scan');
    const data=barcodeStatus({format:spec.id,code:spec.example});let decoded=found[0].text;
    if(spec.id==='upce')decoded=JSON.parse(found[0].extra).UPCE;
    if(spec.id==='upca'&&decoded.length===13&&decoded.startsWith('0'))decoded=decoded.slice(1);
    if(spec.id==='gs1128'){assert.equal(found[0].symbologyIdentifier,']C1');assert.equal(decoded,gs1Payload(spec.example).replaceAll('\xCF','\x1d'));}
    else assert.equal(decoded,data.digits??data.text,spec.id+' exact payload');
    assert.doesNotMatch(await selectedMarkup(),/<image\b/);
  }
  checks.push('all 14 formats are selectable in the actual SVG inspector and independently scan from browser-rendered vector artwork');
  stage='invalid edit';await page.locator('#native-barcode-format').selectOption('ean13');await page.locator('#native-barcode-example').click();
  const original=await selectedMarkup();await page.locator('#native-code').fill('4006381333932');await page.locator('#native-code').press('Tab');
  assert.equal(await page.locator('#native-code').inputValue(),'4006381333932');assert.equal(await page.locator('#native-code').getAttribute('aria-invalid'),'true');assert.match(await page.locator('#native-code-status').innerText(),/校验位应为 1/);assert.equal(await selectedMarkup(),original);
  await page.locator('#native-barcode-example').click();checks.push('invalid input is explained and kept intact while the last valid artwork is preserved; examples require an explicit click');
  stage='move and resize before editing';
  const object=page.locator(`[id="${id}"]`),start=await object.boundingBox();await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(start.x+start.width/2+24,start.y+start.height/2+16,{steps:6});await page.mouse.up();
  const grip=await page.locator('#selectorGrip_resize_se').boundingBox();await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2+26,grip.y+grip.height/2+18,{steps:6});await page.mouse.up();
  const placed=await object.boundingBox();assert.ok(placed.width>start.width+10);await page.locator('#native-code').fill('590123412345');await page.locator('#native-code').press('Tab');const updated=await object.boundingBox();
  for(const key of ['x','y','width','height'])assert.ok(Math.abs(updated[key]-placed[key])<1,`editing a moved/resized barcode changed ${key}: ${placed[key]} -> ${updated[key]}`);
  checks.push('real pointer movement and handle resizing are retained when barcode content changes');
  stage='appearance and geometry';await page.locator('#native-barcode-format').selectOption('code93');await page.locator('#native-barcode-example').click();
  await page.evaluate(()=>window.__foldStudio.nativeEditor.rotateTo(17.5));
  const transform=await page.evaluate(()=>window.__foldStudio.nativeEditor.canvas.getSelectedElements().find(Boolean).getAttribute('transform'));
  await page.locator('#native-barcode-text-position').selectOption('top');await page.locator('#native-barcode-text-scale').fill('120');await page.locator('#native-barcode-text-scale').press('Tab');await page.locator('#native-barcode-font').selectOption('ocrb');
  await page.locator('#native-barcode-bg').selectOption('transparent');await page.locator('#native-barcode-color').fill('#123456');await page.locator('#native-barcode-color').dispatchEvent('change');
  const style=await generator();assert.equal(style.barcodeTextPosition,'top');assert.equal(style.barcodeTextScale,1.2);assert.equal(style.barcodeFont,'ocrb');assert.equal(style.color,'#123456');assert.equal(style.bgColor,'transparent');
  assert.equal(await page.evaluate(()=>window.__foldStudio.nativeEditor.canvas.getSelectedElements().find(Boolean).getAttribute('transform')),transform);
  assert.match(await selectedMarkup(),/OCRB10N/);assert.doesNotMatch(await selectedMarkup(),/fill="#ffffff"/);
  await page.locator('#native-barcode-text').uncheck();assert.doesNotMatch(await selectedMarkup(),/<text\b/);assert.equal(await page.locator('#native-barcode-font').isDisabled(),true);await page.locator('#native-barcode-text').check();
  await page.screenshot({path:resolve(dir,'inspector.png'),fullPage:true});checks.push('text visibility, position, font, size, colors and transparency update editable geometry without changing the object transform');
  stage='undo and redo';await page.locator('#native-code').fill('NEW-456');await page.locator('#native-code').press('Tab');assert.equal((await generator()).code,'NEW-456');
  await page.locator('#undo').click();await ready();await choose(id);assert.equal((await generator()).code,'FOLD-123');await page.locator('#redo').click();await ready();await choose(id);assert.equal((await generator()).code,'NEW-456');
  stage='save and reopen';const download=page.waitForEvent('download');await page.locator('#save-project').click();const saved=await download;await saved.saveAs(resolve(dir,'barcode.fold'));const json=JSON.parse(readFileSync(resolve(dir,'barcode.fold'),'utf8'));assert.equal(json.svgGenerators[id].format,'code93');assert.equal(json.svgGenerators[id].barcodeFont,'ocrb');
  await page.reload();await ready();await choose(id);assert.equal((await generator()).code,'NEW-456');
  await reopen(resolve(dir,'barcode.fold'));await choose(id);assert.equal((await generator()).barcodeTextScale,1.2);assert.equal((await generator()).bgColor,'transparent');
  checks.push('generator payload and appearance survive undo/redo, draft restore, .fold download and reopening');
  stage='SVG download';const svgDownload=page.waitForEvent('download');await chooseExport(page,'flat','svg',true);const svgFile=await svgDownload;await svgFile.saveAs(resolve(dir,'barcode.svg'));const svg=readFileSync(resolve(dir,'barcode.svg'),'utf8');assert.doesNotMatch(svg,/<image\b/);assert.match(svg,/NEW-456/);assert.match(svg,/<path\b/);assert.match(svg,/data-fold-studio/);
  await reopen(resolve(dir,'barcode.svg'));await choose(id);assert.equal((await generator()).code,'NEW-456');checks.push('downloaded SVG retains editable vector artwork, generator metadata and project reopening');
  stage='inside barcode';await page.locator('#side-inside').click();await ready();await page.locator('#add-barcode').click();await page.locator('#native-code').waitFor();await page.locator('#native-barcode-format').selectOption('upca');await page.locator('#native-barcode-example').click();
  assert.equal((await generator()).side,'inside');assert.equal((await generator()).format,'upca');assert.ok((await scanBarcodes(await raster(),['UPC-A'])).length===1);checks.push('inside-surface barcode generation and editing also produce a scannable symbol');
  stage='QR regression';await page.locator('#add-qrcode').click();await page.locator('#native-qrcode-level').waitFor();await page.locator('#native-code').fill('二维码不改动 https://example.org/qr');await page.locator('#native-code').press('Tab');assert.equal((await generator()).text,'二维码不改动 https://example.org/qr');assert.equal((await scanBarcodes(await raster(),['QRCode']))[0]?.text,'二维码不改动 https://example.org/qr');checks.push('the existing QR editor remains available, editable and scannable');
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
}catch(error){await page.screenshot({path:resolve(dir,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{writeFileSync(resolve(dir,'report.json'),JSON.stringify({stage,checks,errors,network},null,2));console.log({stage,checks,errors,network});await browser.close();server?.kill();}
