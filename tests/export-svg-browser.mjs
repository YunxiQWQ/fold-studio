import {chooseExport} from './helpers/export-ui.mjs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
const url=`http://127.0.0.1:${server.httpServer.address().port}`,artifacts=resolve('artifacts/svg-editable');mkdirSync(artifacts,{recursive:true});
const installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
let browser;const errors=[];
try{
  browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/svg-harness',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await page.goto(url+'/svg-harness');
  const result=await page.evaluate(async()=>{
    const [{exportSVG},{newProject,validateProject},{BOX_TYPES,makeDieline,cutSegments,creasePaths},{ImageCache,paintArtwork},{PACKAGING_SYMBOLS}]=await Promise.all([import('/src/export-svg.js'),import('/src/project.js'),import('/src/geometry.js'),import('/src/artwork.js'),import('/src/symbols.js')]);
    const check=(ok,message)=>{if(!ok)throw Error(message);},parser=new DOMParser();
    const parse=svg=>{const doc=parser.parseFromString(svg,'image/svg+xml');check(!doc.querySelector('parsererror'),'invalid SVG XML');return doc;};
    const exported=[];
    for(const type of Object.keys(BOX_TYPES)){
      const p=newProject(type),d=makeDieline(type,p.dimensions),svg=await exportSVG(p,d),doc=parse(svg);
      check(doc.querySelectorAll('image').length===0,type+' unexpectedly rasterized artwork');
      check(doc.querySelectorAll('#cut > path').length===cutSegments(d).length,type+' missing cut paths');
      check(doc.querySelectorAll('#crease > path').length===creasePaths(d).length,type+' missing crease paths');
      check(doc.querySelectorAll('[data-type="text"] text').length>0,type+' lost editable text');
      check(JSON.stringify(validateProject(JSON.parse(doc.querySelector('metadata').textContent)))===JSON.stringify(validateProject(p)),type+' metadata round trip changed');
      exported.push({type,paths:doc.querySelectorAll('path').length,texts:doc.querySelectorAll('text').length});
    }
    const p=newProject(),d=makeDieline(p.type,p.dimensions),base={panel:'front',x:.5,y:.5,w:.75,h:.15,rotation:0,opacity:1,visible:true,color:'#243c52',side:'outside'};
    p.name='Editable SVG <&" 中文';p.layers=[];p.paper='#ffffff';p.insidePaper='#f5eee4';
    const add=(data)=>{const l={...base,id:'svg-layer-'+p.layers.length,name:'Layer <&" '+p.layers.length,...data};p.layers.push(l);return l;};
    add({type:'text',text:'可编辑中文 & English\n第二行测试',font:'sans',size:6,bold:true,italic:true,underline:true,lineHeight:1.6,charSpacing:70,stroke:'#345678',strokeWidth:.12,y:.22,rotation:12,textScaleX:1.35,textScaleY:.8});
    for(const [i,shape] of ['rect','ellipse','triangle','line','arrow','botanical'].entries())add({type:'shape',shape,x:.17+(i%3)*.32,y:.48+Math.floor(i/3)*.18,w:.22,h:.13,radius:4,stroke:'#a84839',strokeWidth:.4,rotation:i*13,opacity:.65});
    add({type:'barcode',format:'ean13',code:'4006381333931',y:.9,w:.8,h:.15,color:'#000000'});
    add({type:'qrcode',text:'editable QR 中文',y:.08,x:1.1,w:.3,h:.2,color:'#000000',clipToPanel:false});
    add({type:'text',text:'内面文字\nInside SVG',font:'serif',size:7,side:'inside',flipX:true,y:.3,rotation:-17,textAlign:'left',textScaleX:.7,textScaleY:1.3});
    add({type:'shape',shape:'arrow',side:'inside',x:.85,w:.6,h:.2,rotation:22,clipToPanel:true});
    const imageCanvas=document.createElement('canvas');imageCanvas.width=80;imageCanvas.height=40;const ictx=imageCanvas.getContext('2d');ictx.fillStyle='#ff6a00';ictx.fillRect(0,0,40,40);ictx.fillStyle='#1a80ef';ictx.fillRect(40,0,40,40);
    add({type:'image',src:imageCanvas.toDataURL(),x:.82,y:.12,w:.32,h:.12,crop:{x:.3,y:.1,w:.6,h:.8},flipY:true,rotation:-15});
    const images=new ImageCache();await images.preload(p.layers);
    const svg=await exportSVG(p,d,images),doc=parse(svg);
    check(doc.querySelectorAll('image').length===1,'SVG must embed only the original photograph as an individual image');
    check(doc.querySelector('#artwork').tagName==='g','artwork is not an editable group');
    check(doc.querySelectorAll('#design > g').length===p.layers.filter(l=>l.side==='outside').length,'individual outside layers missing');
    const photo=doc.querySelector('image');check(photo.getAttribute('href')===p.layers.at(-1).src,'original photo bytes changed');
    const internal=await exportSVG(p,d,images,{side:'inside'}),insideDoc=parse(internal);
    check(insideDoc.querySelector('#artwork').getAttribute('transform').includes('scale(-1 1)'),'inside sheet was not mirrored');
    check(insideDoc.querySelectorAll('image').length===0,'outside photo leaked onto inside');
    for(const symbol of PACKAGING_SYMBOLS){
      const s=newProject();s.layers=[{...base,id:'symbol',type:'symbol',symbol:symbol.id,w:.5,h:.4}];
      const symbolDoc=parse(await exportSVG(s,d));check(symbolDoc.querySelector('[data-type="symbol"] path'),symbol.id+' missing vector symbol');check(!symbolDoc.querySelector('image'),symbol.id+' rasterized');
    }
    const symbolSheet=newProject();symbolSheet.paper='#ffffff';
    symbolSheet.layers=PACKAGING_SYMBOLS.map((symbol,i)=>({...base,id:'symbol-'+i,type:'symbol',name:symbol.name,symbol:symbol.id,x:.1+(i%5)*.2,y:.08+Math.floor(i/5)*.13,w:.16,h:.1}));
    const symbolsSvg=await exportSVG(symbolSheet,d);
    async function compare(side,source){
      const doc=parse(source);doc.querySelector('#dieline').remove();
      const scale=4,width=Math.ceil(d.width*scale),height=Math.ceil(d.height*scale);
      const canvas=()=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
      const expected=canvas(),background=canvas(),actual=canvas();
      for(const [c,project]of [[expected,p],[background,{...p,layers:[]}]]){
        const ctx=c.getContext('2d');if(side==='inside')ctx.setTransform(-scale,0,0,scale,d.maxX*scale,-d.minY*scale);else ctx.setTransform(scale,0,0,scale,-d.minX*scale,-d.minY*scale);
        paintArtwork(ctx,project,d,images,side);
      }
      const blob=new Blob([new XMLSerializer().serializeToString(doc)],{type:'image/svg+xml'}),blobUrl=URL.createObjectURL(blob),img=new Image();
      try{img.src=blobUrl;await img.decode();actual.getContext('2d').drawImage(img,0,0,d.width*scale,d.height*scale);}finally{URL.revokeObjectURL(blobUrl);}
      const a=actual.getContext('2d').getImageData(0,0,width,height).data,e=expected.getContext('2d').getImageData(0,0,width,height).data,b=background.getContext('2d').getImageData(0,0,width,height).data;
      let sum=0,ink=0;for(let i=0;i<a.length;i+=4){let changed=false;for(let k=0;k<4;k++)if(Math.abs(a[i+k]-b[i+k])>20||Math.abs(e[i+k]-b[i+k])>20)changed=true;if(changed){ink++;for(let k=0;k<4;k++)sum+=Math.abs(a[i+k]-e[i+k]);}}
      return{side,inkPixels:ink,meanInkError:sum/(4*ink),actual:actual.toDataURL(),expected:expected.toDataURL()};
    }
    const comparisons=[await compare('outside',svg),await compare('inside',internal)];
    for(const c of comparisons)check(c.meanInkError<8,`${c.side} SVG layout differs from canvas: ${c.meanInkError}`);
    return{exported,symbols:PACKAGING_SYMBOLS.length,svg,internal,symbolsSvg,project:p,comparisons};
  });
  for(const c of result.comparisons){for(const kind of ['actual','expected'])writeFileSync(resolve(artifacts,`${c.side}-${kind}.png`),Buffer.from(c[kind].split(',')[1],'base64'));delete c.actual;delete c.expected;}
  writeFileSync(resolve(artifacts,'editable-outside.svg'),result.svg);writeFileSync(resolve(artifacts,'editable-inside.svg'),result.internal);
  writeFileSync(resolve(artifacts,'all-symbols.svg'),result.symbolsSvg);
  await page.goto(url);await page.waitForSelector('html[data-ready="true"]');
  await page.locator('#project-input').setInputFiles({name:'editable.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(result.project))});
  await page.waitForFunction(()=>window.__foldStudio.project.name.startsWith('Editable SVG'));
  const event=page.waitForEvent('download');await page.locator('#export-toggle').click();await chooseExport(page,'flat','svg',true);const download=await event;await download.saveAs(resolve(artifacts,'ui-export.svg'));
  const beforeImport=await page.evaluate(async()=>{const {listDocuments}=await import('/src/project-library-storage.js');return (await listDocuments()).length;});
  await page.locator('#project-input').setInputFiles(resolve(artifacts,'ui-export.svg'));
  await page.waitForFunction(async count=>{const {listDocuments}=await import('/src/project-library-storage.js');return (await listDocuments()).length===count+1;},beforeImport);
  assert.deepEqual(await page.evaluate(()=>window.__foldStudio.project),result.project);assert.deepEqual(errors,[]);
  const report={models:result.exported.length,symbols:result.symbols,comparisons:result.comparisons,errors,checks:['native text and separate vector layer groups','all model cut/crease paths and project metadata','all packaging symbols remain vectors','original photo bytes and crop retained','inside mirroring and canvas visual comparison','actual UI SVG download and project reimport']};
  writeFileSync(resolve(artifacts,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await server.close();}
