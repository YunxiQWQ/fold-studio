import {chromium} from 'playwright';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import zxing from '@zxing/library';
import jsQR from 'jsqr';
const {RGBLuminanceSource,HybridBinarizer,BinaryBitmap,MultiFormatReader,DecodeHintType,BarcodeFormat}=zxing;

const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium-1228/chrome-win64/chrome.exe'),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const errors=[],checks=[];let page;
try{
  page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForSelector('html[data-ready="true"]');
  async function fingerprint(){await page.waitForTimeout(90);return page.evaluate(()=>document.querySelector('.lower-canvas').toDataURL());}
  for(const [type,control,first,second] of [['barcode','#prop-barcode-code','4006381333931','5901234123457'],['qrcode','#prop-qrcode-text','https://example.org/first','https://example.org/second']]){
    await page.locator('#add-'+type).click();await page.locator(control).fill(first);await page.locator(control).blur();const before=await fingerprint();
    const initialStats=await page.evaluate(()=>window.__foldStudio.stats);await page.locator(control).fill(second);await page.locator(control).blur();const after=await fingerprint();
    assert.notEqual(after,before,`${type}: editing content must repaint the actual Fabric canvas without moving the object`);
    const nextStats=await page.evaluate(()=>window.__foldStudio.stats);assert.ok(nextStats.textureUpdates>initialStats.textureUpdates);assert.equal(nextStats.geometryBuilds,initialStats.geometryBuilds);
    checks.push(`${type}: content edits repaint immediately without move/resize`);
  }
  await page.locator('#add-symbol').click();const before=await fingerprint();await page.locator('#prop-symbol').selectOption('fragile');
  assert.notEqual(await fingerprint(),before,'symbol selection must repaint the actual Fabric canvas');checks.push('symbol selection repaints immediately');
  const previewBefore=await page.locator('.symbol-current canvas').evaluate(c=>c.toDataURL());await page.locator('#layer-color').fill('#b00000');await page.locator('#layer-color').blur();await page.waitForTimeout(60);assert.notEqual(await page.locator('.symbol-current canvas').evaluate(c=>c.toDataURL()),previewBefore);checks.push('symbol color edits also refresh the inspector thumbnail');
  await page.locator('#browse-symbols').click();assert.equal(await page.locator('[data-symbol-id]').count(),34);
  await page.locator('#symbol-search').fill('冷冻');assert.equal(await page.locator('[data-symbol-id]').count(),2);
  await page.locator('#symbol-search').fill('');await page.locator('#symbol-category').selectOption('食品与日用');assert.ok(await page.locator('[data-symbol-id]').count()>=5);
  await page.locator('#symbol-category').selectOption('');await page.locator('[data-symbol-id="no-hooks"]').click();
  assert.equal(await page.locator('#prop-symbol').inputValue(),'no-hooks');assert.equal(await page.locator('#symbol-library').isVisible(),false);
  const symbol=await page.evaluate(()=>window.__foldStudio.selection.selected);await page.locator('#undo').click();assert.equal(await page.evaluate(id=>window.__foldStudio.project.layers.find(l=>l.id===id).symbol,symbol),'fragile');await page.locator('#redo').click();assert.equal(await page.evaluate(id=>window.__foldStudio.project.layers.find(l=>l.id===id).symbol,symbol),'no-hooks');
  checks.push('34-symbol visual library, search, categories, selection, undo and redo');
  await page.locator('#add-barcode').click();await page.locator('#prop-barcode-code').fill('4006381333932');await page.locator('#prop-barcode-code').blur();assert.equal(await page.locator('#prop-barcode-code').getAttribute('aria-invalid'),'true');assert.match(await page.locator('#code-feedback').innerText(),/校验位应为 1/);
  await page.locator('#prop-barcode-code').fill('400638133393');await page.locator('#prop-barcode-code').blur();assert.equal(await page.locator('#prop-barcode-code').getAttribute('aria-invalid'),'false');assert.match(await page.locator('#code-feedback').innerText(),/4006381333931/);
  await page.locator('#prop-barcode-format').selectOption('code128');await page.locator('#prop-barcode-code').fill('包裹');await page.locator('#prop-barcode-code').blur();assert.equal(await page.locator('#prop-barcode-code').getAttribute('aria-invalid'),'true');
  const longCode='package-1234567890'.repeat(4);await page.locator('#prop-barcode-code').fill(longCode);await page.locator('#prop-barcode-code').blur();assert.equal(await page.locator('#prop-barcode-code').getAttribute('aria-invalid'),'false');
  await page.locator('#prop-barcode-format').selectOption('ean13');assert.equal(await page.locator('#prop-barcode-code').inputValue(),longCode,'format switches must preserve user input');await page.locator('#prop-barcode-format').selectOption('code128');
  checks.push('EAN validation, computed check digit, Code 128 Unicode errors and >40-character input without replacement/truncation');
  await page.locator('#add-qrcode').click();const payload='中文包装 😀\nhttps://example.org/产品?批次=123\n'+'完整内容'.repeat(40);await page.locator('#prop-qrcode-text').fill(payload);await page.locator('#prop-qrcode-text').blur();await page.locator('#prop-qrcode-level').selectOption('H');assert.equal(await page.locator('#prop-qrcode-text').getAttribute('aria-invalid'),'false');
  const qrId=await page.evaluate(()=>window.__foldStudio.selection.selected);
  await page.locator('#prop-qrcode-text').fill('中'.repeat(2000));await page.locator('#prop-qrcode-text').blur();assert.match(await page.locator('#code-feedback').innerText(),/容量/);await page.locator('#prop-qrcode-text').fill('');await page.locator('#prop-qrcode-text').blur();assert.match(await page.locator('#code-feedback').innerText(),/输入/);
  await page.locator('#prop-qrcode-text').fill(payload);await page.locator('#prop-qrcode-text').blur();
  checks.push('UTF-8 QR content over 106 bytes, ECC editing, explicit capacity/empty errors without silent truncation');
  // Decode the browser Canvas renderer, including antialiasing at physical millimetre dimensions.
  for(const [type,text,format,side]of [['barcode','4006381333931','ean13','outside'],['barcode',longCode,'code128','outside'],['qrcode',payload,'qr','outside'],['qrcode','内面文字 😀 https://example.org/inside','qr','inside']]){
    const raster=await page.evaluate(async({type,text,format,side})=>{
      const {drawLayer}=await import('/src/artwork.js');const w=type==='barcode'?(format==='ean13'?38:150):(text.length>200?65:26),h=type==='barcode'?24:w,scale=12,c=document.createElement('canvas');c.width=w*scale;c.height=h*scale;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.translate(c.width/2,c.height/2);ctx.scale(scale,scale);if(side==='inside')ctx.scale(-1,1);
      drawLayer(ctx,{type,side,code:text,text,format,errorCorrectionLevel:'H',bgColor:'#ffffff',showText:true,color:'#000000',visible:true,opacity:1,x:.5,y:.5,w:1,h:1,rotation:0},{x:-w/2,y:-h/2,w,h});
      const rgba=ctx.getImageData(0,0,c.width,c.height).data;return {w:c.width,h:c.height,image:c.toDataURL(),pixels:Array.from({length:c.width*c.height},(_,i)=>rgba[i*4])};
    },{type,text,format,side});
    writeFileSync(`artifacts/scan-${side}-${format}.png`,Buffer.from(raster.image.split(',')[1],'base64'));
    const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,[format==='qr'?BarcodeFormat.QR_CODE:format==='ean13'?BarcodeFormat.EAN_13:BarcodeFormat.CODE_128]],[DecodeHintType.PURE_BARCODE,true]]);
    const bitmap=new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(Uint8ClampedArray.from(raster.pixels),raster.w,raster.h)));
    let decoded;try{
      if(format==='qr'){const rgba=Uint8ClampedArray.from({length:raster.pixels.length*4},(_,i)=>i%4===3?255:raster.pixels[Math.floor(i/4)]);decoded=jsQR(rgba,raster.w,raster.h,{inversionAttempts:'dontInvert'})?.data;}
      else decoded=new MultiFormatReader().decode(bitmap,hints).getText();
    }catch(error){throw new Error(`${side} ${format}: browser raster decode failed`,{cause:error});}
    assert.equal(decoded,text,`${side} ${format}: rendered content must scan exactly`);
  }
  checks.push('independent ZXing/jsQR scans actual browser Canvas EAN-13, long Code 128, long Chinese QR and inside QR exactly');
  const glyphs=await page.evaluate(async()=>{const {PACKAGING_SYMBOLS,drawSymbol}=await import('/src/symbols.js'),c=document.createElement('canvas');c.width=c.height=100;const ctx=c.getContext('2d');return PACKAGING_SYMBOLS.map(s=>{ctx.setTransform(1,0,0,1,50,50);ctx.clearRect(-50,-50,100,100);drawSymbol(ctx,s.id,80,80,'#000000');return{id:s.id,pixels:Array.from(ctx.getImageData(0,0,100,100).data).filter((_,i)=>i%4===3).reduce((n,v)=>n+(v>0),0)};});});assert.ok(glyphs.every(g=>g.pixels>150));checks.push('every legacy and open-source symbol renders nonempty vector artwork');
  await page.waitForTimeout(700);await page.reload();await page.waitForSelector('html[data-ready="true"]');const restored=await page.evaluate(()=>window.__foldStudio.project);assert.equal(restored.layers.find(l=>l.id===qrId).text,payload);assert.equal(restored.layers.find(l=>l.id===qrId).errorCorrectionLevel,'H');assert.equal(restored.layers.find(l=>l.id===symbol).symbol,'no-hooks');checks.push('new symbols and QR correction settings persist through draft restore');
  await page.locator(`[data-select="${symbol}"]`).click();await page.locator('#browse-symbols').click();await page.screenshot({path:'artifacts/symbol-library.png',fullPage:true});await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await page.locator('#browse-symbols').click();await page.locator('#symbol-search').fill('禁止吊钩');await page.locator('[data-symbol-id="no-hooks"]').click();assert.equal(await page.locator('#symbol-library').isVisible(),false);checks.push('mobile library search and selection remain reachable');
  const network=[];page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});await page.setViewportSize({width:1600,height:1000});await page.goto(pathToFileURL(resolve('折间.html')).href);await page.waitForSelector('html[data-ready="true"]');
  await page.locator('#add-qrcode').click();await page.locator('#prop-qrcode-text').fill('离线二维码 https://example.org/offline');await page.locator('#prop-qrcode-text').blur();await page.locator('#prop-qrcode-level').selectOption('Q');assert.equal(await page.locator('#prop-qrcode-text').getAttribute('aria-invalid'),'false');
  await page.locator('#add-barcode').click();await page.locator('#prop-barcode-code').fill('400638133393');await page.locator('#prop-barcode-code').blur();assert.match(await page.locator('#code-feedback').innerText(),/4006381333931/);
  await page.locator('#add-symbol').click();await page.locator('#browse-symbols').click();await page.locator('#symbol-search').fill('冷冻');await page.locator('[data-symbol-id="keep-frozen"]').click();assert.equal(await page.locator('#prop-symbol').inputValue(),'keep-frozen');assert.deepEqual(network,[]);checks.push('offline file supports QR/barcode edits and bundled symbol search with zero network requests');
  assert.deepEqual(errors,[]);writeFileSync('artifacts/packaging-edit-verification.json',JSON.stringify({checks,errors},null,2));console.log({checks,errors});
}catch(e){await page?.screenshot({path:'artifacts/packaging-edit-failure.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();await server.close();}
