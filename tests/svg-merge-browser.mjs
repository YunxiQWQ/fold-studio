import {chromium} from 'playwright';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium-1228/chrome-win64/chrome.exe'),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
let page;const errors=[];
try{
  const context=await browser.newContext({viewport:{width:1700,height:1100},acceptDownloads:true});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForSelector('html[data-ready="true"]');
  const result=await page.evaluate(async()=>{
    const [{importSvgLayers},{compactSvgLayers},{newProject,validateProject},{makeDieline},{ImageCache,paintArtwork},{exportSVG}]=await Promise.all([import('/src/import-svg.js'),import('/src/svg-merge.js'),import('/src/project.js'),import('/src/geometry.js'),import('/src/artwork.js'),import('/src/export-svg.js')]);
    const source='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><defs><linearGradient id="g"><stop stop-color="#225537"/><stop offset="1" stop-color="#f0dd85"/></linearGradient><clipPath id="c"><circle cx="60" cy="60" r="35"/></clipPath></defs><g transform="translate(2 3)"><rect opacity="0.7" x="10" y="10" width="100" height="70" fill="url(#g)" clip-path="url(#c)"/><circle cx="140" cy="70" r="30" fill="#a7435d" opacity="0.7"/></g><text x="20" y="120" font-size="18" font-family="Arial">Keep text</text><path d="M 20 130 L 80 130 L 50 175 Z" fill="#46a9ba"/><rect x="130" y="120" width="65" height="50" fill="url(#g)"/></svg>';
    const comparisons=[];let fixture;
    for(const side of ['outside','inside']){
      const p=newProject(),d=makeDieline(p.type,p.dimensions),panel=d.panels.find(p=>p.id==='front');p.layers=(await importSvgLayers(source,{panel,side,compact:false})).layers;
      Object.assign(p.layers[0],{rotation:23,flipX:true,opacity:.47,svgOriginal:false,color:'#db4371'});Object.assign(p.layers[1],{panel:'right',x:.02,clipToPanel:true});Object.assign(p.layers[3],{flipY:true,rotation:-17});
      const compact=validateProject({...p,layers:compactSvgLayers(p.layers,d)});if(compact.layers.length!==3||compact.layers[1].text!=='Keep text')throw Error('compaction changed text or layer count');
      const cache=new ImageCache();for(const colorMode of ['rgb','cmyk']){
      await cache.preload([...p.layers,...compact.layers],colorMode);
      const raster=project=>{const c=document.createElement('canvas');c.width=Math.ceil(d.width*3);c.height=Math.ceil(d.height*3);const x=c.getContext('2d');x.setTransform(3,0,0,3,-d.minX*3,-d.minY*3);paintArtwork(x,project,d,cache,side,colorMode);return c;};
      const a=raster(p),b=raster(compact),base=raster({...p,layers:[]}),aa=a.getContext('2d').getImageData(0,0,a.width,a.height).data,bb=b.getContext('2d').getImageData(0,0,b.width,b.height).data,cc=base.getContext('2d').getImageData(0,0,base.width,base.height).data;let error=0,ink=0;
      for(let i=0;i<aa.length;i+=4)if([0,1,2,3].some(c=>Math.abs(aa[i+c]-cc[i+c])>3||Math.abs(bb[i+c]-cc[i+c])>3)){ink++;for(let c=0;c<4;c++)error+=Math.abs(aa[i+c]-bb[i+c]);}
      const meanError=error/ink/4;comparisons.push({side,colorMode,meanError});if(meanError>3)throw Error('merge changed appearance: '+side+' '+meanError);
      const svg=await exportSVG(compact,d,cache,{side,colorMode}),doc=new DOMParser().parseFromString(svg,'image/svg+xml');if(doc.querySelector('#design image')||!doc.querySelector('#design path')||!doc.querySelector('#design text'))throw Error('merged SVG lost native vector/text');
      }
      if(side==='outside')fixture=p;
    }
    const panel=makeDieline(fixture.type,fixture.dimensions).panels.find(p=>p.id==='front'),many='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100">'+Array.from({length:360},(_,i)=>`<g><g><rect x="${i}" y="10" width="1" height="50" fill="#225537"/></g></g>`).join('')+'<text x="0" y="90" font-family="Arial" font-size="16">Keep text</text></svg>',compact=await importSvgLayers(many,{panel,capacity:2});
    if(compact.layers.length!==2||compact.reduced!==359)throw Error('large SVG was not compacted before capacity check');
    let rejected=false;try{await importSvgLayers(many,{panel,capacity:120,compact:false});}catch{rejected=true;}if(!rejected)throw Error('individual mode bypassed capacity');
    return{fixture,many,comparisons,largeSvg:{original:361,layers:compact.layers.length,reduced:compact.reduced}};
  });
  // Legacy helper compatibility only; the product no longer offers compaction.
  assert.equal(await page.locator('[data-editor-action="merge-svg"]').count(),0);
  assert.equal(await page.locator('#svg-import-mode').count(),0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({legacyComparisons:result.comparisons,errors},null,2));
}catch(e){await page?.screenshot({path:'artifacts/svg-merge-failure.png'}).catch(()=>{});throw e;}finally{await browser.close();await server.close();}
