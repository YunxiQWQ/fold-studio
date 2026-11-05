import {chromium} from 'playwright';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const fixtures = [
  ['luminance mask', '<defs><mask id="m"><rect width="240" height="160" fill="white"/><circle cx="90" cy="70" r="35" fill="black"/></mask></defs><rect x="20" y="20" width="170" height="100" fill="#b94e35" mask="url(#m)"/>'],
  ['alpha mask and gradient', '<defs><linearGradient id="fade"><stop stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="white"/></linearGradient><mask id="m" mask-type="alpha"><rect width="240" height="160" fill="url(#fade)"/></mask></defs><g mask="url(#m)"><rect x="10" y="15" width="190" height="120" fill="#357aae"/><text x="30" y="75" font-family="Arial" font-size="25">MASK</text></g>'],
  ['mask user space with CSS', '<defs><mask id="m" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="10" y="10" width="180" height="130"><ellipse cx="100" cy="70" rx="75" ry="45" fill="white"/></mask></defs><style>.art{mask:url("#m");fill:#7250a4}</style><rect class="art" x="10" y="10" width="180" height="130"/>'],
  ['object bounding box mask', '<defs><mask id="m" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="white"/><circle cx=".5" cy=".5" r=".3" fill="black"/></mask></defs><rect x="35" y="20" width="140" height="90" fill="#20966c" mask="url(#m)"/>'],
  ['pattern and inherited gradient', '<defs><linearGradient id="base"><stop stop-color="#20a075"/><stop offset="1" stop-color="#eacd56"/></linearGradient><linearGradient id="inherited" href="#base" x2="0" y2="1"/><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(13)"><rect width="24" height="24" fill="url(#inherited)"/><circle cx="12" cy="12" r="6" fill="#c06080"/></pattern></defs><rect x="15" y="15" width="190" height="120" fill="url(#p)"/>'],
  ['symbol and use', '<defs><symbol id="s" viewBox="0 0 20 20"><path d="M1 1L19 1L10 19Z" fill="currentColor"/></symbol></defs><use href="#s" x="10" y="15" width="70" height="100" color="#337d59"/><use href="#s" x="110" y="25" width="90" height="90" color="#af4284"/>'],
  ['markers and vector stroke', '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto-start-reverse"><path d="M0 0L6 3L0 6Z" fill="context-stroke"/></marker></defs><path d="M30 100Q100 -20 190 100" fill="none" stroke="#546ab5" stroke-width="5" marker-start="url(#arrow)" marker-end="url(#arrow)" vector-effect="non-scaling-stroke"/>'],
  ['text path', '<defs><path id="curve" d="M15 110Q110 -45 220 105"/></defs><text font-family="Arial" font-size="24" fill="#6c397d"><textPath href="#curve" startOffset="10%">Curved SVG text</textPath></text>'],
  ['nested viewports and percentages', '<rect x="0" y="0" width="240" height="160" fill="#ddd8bb"/><svg x="30" y="20" width="160" height="100" viewBox="-10 -10 40 40" preserveAspectRatio="xMidYMid slice"><circle cx="50%" cy="50%" r="20" fill="#ce7540"/><rect x="-10" y="-10" width="20" height="40" fill="#3d8c7b"/></svg>'],
  ['CSS cascade currentColor and group alpha', '<style>g .art{fill:#ff0000}.art{fill:currentColor!important}#dot{stroke:#222;stroke-width:3}</style><g color="#20677e" opacity=".6"><rect class="art" x="15" y="20" width="100" height="90"/><circle id="dot" class="art" cx="125" cy="70" r="45" style="fill:#77bb99"/></g>'],
  ['CSS transforms and blending', '<style>.turn{transform:rotate(15deg);transform-origin:100px 80px;mix-blend-mode:multiply}</style><rect width="240" height="160" fill="#eee7b4"/><g class="turn"><rect x="30" y="30" width="100" height="90" fill="#2aabd0"/><circle cx="125" cy="85" r="50" fill="#c84c92"/></g>'],
  ['ordinary editable text beside a mask', '<defs><mask id="m"><rect width="240" height="160" fill="white"/></mask></defs><circle cx="50" cy="45" r="30" fill="#3e8558" mask="url(#m)"/><text x="20" y="125" fill="#172e44" font-family="Arial" font-size="20">Editable text</text>'],
  ['image and crop', '<defs><clipPath id="c"><circle cx="100" cy="75" r="50"/></clipPath></defs><image href="INLINE_IMAGE" x="10" y="10" width="190" height="130" preserveAspectRatio="xMidYMid slice" clip-path="url(#c)"/>'],
];
const filters = [
  ['blur','<feGaussianBlur stdDeviation="4"/>'],
  ['drop shadow','<feDropShadow dx="7" dy="6" stdDeviation="3" flood-color="#324566" flood-opacity=".8"/>'],
  ['offset flood composite merge','<feOffset in="SourceAlpha" dx="8" dy="9" result="off"/><feFlood flood-color="#7852ab" result="paint"/><feComposite in="paint" in2="off" operator="in" result="shadow"/><feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>'],
  ['color matrix','<feColorMatrix type="hueRotate" values="130"/>'],
  ['component transfer','<feComponentTransfer><feFuncR type="linear" slope=".3" intercept=".2"/><feFuncG type="gamma" amplitude="1" exponent="2" offset="0"/><feFuncB type="table" tableValues="1 0"/></feComponentTransfer>'],
  ['morphology','<feMorphology operator="dilate" radius="3"/>'],
  ['turbulence displacement','<feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G"/>'],
  ['blend','<feFlood flood-color="#39a783" flood-opacity=".4" result="paint"/><feBlend in="SourceGraphic" in2="paint" mode="multiply"/>'],
  ['tile','<feOffset dx="10" dy="8" result="off"/><feTile in="off"/>'],
];
for(const [name,content] of filters) fixtures.push([name,`<defs><filter id="fx" x="-30%" y="-30%" width="160%" height="160%">${content}</filter></defs><g filter="url(#fx)"><rect x="45" y="35" width="90" height="65" rx="10" fill="#da734e"/><circle cx="145" cy="85" r="25" fill="#4690c7"/></g>`]);
fixtures.push(['positioned and vertical text','<text x="20 38 58" y="60" rotate="0 15 -12" fill="#275a88" font-family="Arial" font-size="25">SVG</text><text x="170" y="20" style="writing-mode:vertical-rl" font-size="22">縦文字</text>']);
fixtures.push(['CSS filter functions','<g style="filter:drop-shadow(5px 6px 3px rgba(10,20,40,.7)) hue-rotate(35deg) blur(1px)"><rect x="40" y="25" width="140" height="90" rx="15" fill="#2b9482"/></g>']);
fixtures.push(['local use outside defs','<g id="logo" fill="#9e413d"><circle cx="45" cy="50" r="30"/></g><use href="#logo" transform="translate(95 40) scale(.7)"/>']);
fixtures.push(['quoted Unicode references and paint fallback','<defs><pattern id="纹样" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="5" fill="#517a8d"/></pattern></defs><rect width="240" height="160" fill="url(\'#纹样\') #557755"/>']);
fixtures.push(['CSS repeated opacity and clipped text','<defs><clipPath id="c"><rect x="20" y="20" width="150" height="90"/></clipPath></defs><style>g{opacity:.5}.label{clip-path:url(#c)}</style><g><g><rect x="25" y="30" width="170" height="95" fill="#5c4e9e"/><text class="label" x="35" y="70" font-size="26" font-family="Arial">Clipped text</text></g></g>']);
fixtures.push(['percentage text and CSS font shorthand','<defs><mask id="m"><rect width="240" height="160" fill="white"/></mask></defs><g font-size="20"><text x="20" y="55" font-size="120%" fill="#398864">Percent font</text></g><text x="20" y="100" style="font:bold 22px Arial;fill:#b54d65">Font style</text>']);
fixtures.push(['uniform fixed stroke with dashes','<g transform="translate(20 10) scale(1.5)"><path d="M10 10L110 70" fill="none" stroke="#4d6ca5" stroke-width="6" stroke-dasharray="10 4" stroke-dashoffset="2" vector-effect="non-scaling-stroke"/></g>']);
fixtures.push(['CSS inherited paint and selector priority','<style>svg{fill:#285c85}.paint{fill:inherit}.paint:last-child{fill:#a84362!important}</style><g><rect class="paint" x="15" y="20" width="100" height="100"/><circle class="paint" cx="150" cy="75" r="40"/></g>']);

const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium-1228/chrome-win64/chrome.exe'),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
let page;
try {
  page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});
  const requests=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith('http://127.0.0.1'))requests.push(request.url());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.waitForSelector('html[data-ready="true"]');
  const result=await page.evaluate(async fixtures=>{
    const [{importSvgLayers,importSvgDocument,parseSvgDocument},{newProject,validateProject},{makeDieline},{ImageCache,drawLayer},{exportSVG},{compactSvgLayers},{svgViewport}]=await Promise.all([
      import('/src/import-svg.js'),import('/src/project.js'),import('/src/geometry.js'),import('/src/artwork.js'),import('/src/export-svg.js'),import('/src/svg-merge.js'),import('/src/svg-document.js')]);
    const imageCanvas=document.createElement('canvas');imageCanvas.width=40;imageCanvas.height=20;
    const imageContext=imageCanvas.getContext('2d');imageContext.fillStyle='#269768';imageContext.fillRect(0,0,20,20);imageContext.fillStyle='#c75f46';imageContext.fillRect(20,0,20,20);
    const inlineImage=imageCanvas.toDataURL();
    const project=newProject(),d=makeDieline(project.type,project.dimensions),panel=d.panels.find(p=>p.id==='front');
    const check=(condition,message)=>{if(!condition)throw Error(message);};
    const raster=layers=>{const canvas=document.createElement('canvas');canvas.width=720;canvas.height=480;
      const context=canvas.getContext('2d'),fit=Math.min(panel.w*.8/240,panel.h*.8/160);
      context.setTransform(3/fit,0,0,3/fit,(120-panel.x/fit-panel.w/2/fit)*3,(80-panel.y/fit-panel.h/2/fit)*3);
      for(const layer of layers)drawLayer(context,layer,panel,cache);
      return canvas;
    };
    const compare=(a,b)=>{const aa=a.getContext('2d').getImageData(0,0,720,480).data,bb=b.getContext('2d').getImageData(0,0,720,480).data;let error=0,ink=0;
      for(let i=0;i<aa.length;i+=4)if(aa[i+3]||bb[i+3]){ink++;error+=Math.abs(aa[i+3]-bb[i+3]);for(let c=0;c<3;c++)error+=Math.abs(aa[i+c]*aa[i+3]/255-bb[i+c]*bb[i+3]/255);}
      return{meanError:error/(ink*4),ink};
    };
    const cache=new ImageCache(),reports=[];let fixture;
    for(const [name,body]of fixtures){
      const source=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="240" height="160" viewBox="0 0 240 160">${body.replace('INLINE_IMAGE',inlineImage)}</svg>`;
      try{
        const imported=await importSvgLayers(source,{panel});
        const p=validateProject({...project,layers:imported.layers});
        await cache.preload(p.layers);
        const actual=raster(p.layers),expected=document.createElement('canvas');expected.width=720;expected.height=480;
        const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(source);await image.decode();expected.getContext('2d').drawImage(image,0,0,720,480);
        const diff=compare(actual,expected);
        const native=importSvgDocument(source,{panel});
        validateProject({...project,layers:[native]});await cache.preload([native]);
        const nativeError=compare(raster([native]),expected).meanError;
        check(Number.isFinite(nativeError)&&nativeError<1,'complete SVG document appearance error '+nativeError);
        check(diff.ink>1000,'Empty source or imported appearance');
        check(Number.isFinite(diff.meanError)&&diff.meanError<8,'appearance error '+diff.meanError);
        const output=await exportSVG(p,d,cache),doc=new DOMParser().parseFromString(output,'image/svg+xml');
        check(!doc.querySelector('parsererror'),'Export XML invalid');
        check(doc.querySelectorAll('#design image').length===(name==='image and crop'?1:0),'Unexpected rasterization');
        check(JSON.stringify(validateProject(JSON.parse(doc.querySelector('metadata').textContent)).layers)===JSON.stringify(p.layers),'Project metadata changed');
        const exported=doc.documentElement;
        exported.replaceChildren(doc.querySelector('defs'),doc.querySelector('#design'));
        const fit=Math.min(panel.w*.8/240,panel.h*.8/160);
        exported.setAttribute('viewBox',`${panel.x+panel.w/2-120*fit} ${panel.y+panel.h/2-80*fit} ${240*fit} ${160*fit}`);
        exported.setAttribute('width','720');exported.setAttribute('height','480');
        const exportImage=new Image();exportImage.src='data:image/svg+xml,'+encodeURIComponent(new XMLSerializer().serializeToString(exported));await exportImage.decode();
        const exportCanvas=document.createElement('canvas');exportCanvas.width=720;exportCanvas.height=480;exportCanvas.getContext('2d').drawImage(exportImage,0,0);
        const exportError=compare(exportCanvas,actual).meanError;
        // Vertical fallback font baselines differ between SVG image and nested
        // SVG rendering in Chromium. Keep a separate, visible tolerance/report.
        const exportTolerance=name==='positioned and vertical text'?15:4;
        if(exportError>=exportTolerance){
          for(const canvas of [actual,exportCanvas]){const c=canvas.getContext('2d');c.save();c.resetTransform();c.globalCompositeOperation='destination-over';c.fillStyle='white';c.fillRect(0,0,720,480);c.restore();}
          window.svgCommonFailure={name,output,panel,actual:actual.toDataURL(),exported:exportCanvas.toDataURL()};
        }
        check(exportError<exportTolerance,'SVG re-export appearance error '+exportError);
        const reimport=await importSvgLayers(output,{panel});
        validateProject({...project,layers:reimport.layers});await cache.preload(reimport.layers);
        if(name==='ordinary editable text beside a mask') {
          check(p.layers.some(l=>l.type==='text'&&l.text==='Editable text'),'Independent text no longer editable');
          fixture={project:p,source};
        }
        if(p.layers.length>1){
          const merged=compactSvgLayers(p.layers,d);await cache.preload(merged);
          check(compare(raster(merged),actual).meanError<2,'Merge changed appearance');
        }
        reports.push({name,layers:p.layers.length,texts:p.layers.filter(l=>l.type==='text').length,nativeError,exportError,...diff});
      }catch(error){throw Error(name+': '+error.message);}
    }
    const unsupported=[
      '<script>alert(1)</script>','<foreignObject width="10" height="10"><div>HTML</div></foreignObject>',
      '<animate attributeName="opacity" values="0;1" dur="1s"/>',
      '<filter id="f"><feImage href="https://example.org/test.png"/></filter>',
      '<filter id="f"><feConvolveMatrix order="3"/></filter>',
      '<image href="https://example.org/test.png" width="20" height="20"/>',
      '<style>@font-face{font-family:x;src:url(https://example.org/a.woff)}</style><text>x</text>',
      '<style>.a{fill:url(https://example.org/x.svg)}</style><rect class="a" width="10" height="10"/>',
      '<defs><g id="a"><use href="#a"/></g></defs><use href="#a"/>',
      '<rect width="10" height="10" mask="url(#missing)"/>',
      '<style>.a{animation:spin 1s}</style><rect class="a" width="20" height="20"/>',
      '<rect style="background-image:image-set(url(https://example.org/a.png) 1x)" width="20" height="20"/>',
      '<rect onload="alert(1)" width="20" height="20"/>',
      '<g transform="scale(2 1)"><path d="M0 0L20 20" stroke="red" vector-effect="non-scaling-stroke"/></g>',
      '<defs><path id="p" d="M0 0L20 20" stroke="red" vector-effect="non-scaling-stroke"/></defs><use href="#p"/>',
      '<style>.a{unknown-property:value;fill:red}</style><rect class="a" width="20" height="20"/>',
      '<mask id="m"><rect width="10" height="10" mask="url(#m)"/></mask><rect width="10" height="10" mask="url(#m)"/>',
      '<pattern id="p" href="#q"/><pattern id="q" href="#p"/><rect width="10" height="10" fill="url(#p)"/>',
      '<rect width="10" height="10" style="mask-image:url(#a),url(#b)"/>',
    ];
    const rejected=[];
    for(const body of unsupported){
      let message;
      try{parseSvgDocument(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`);}catch(error){message=error.message;}
      check(message,'Unsupported content silently imported: '+body);
      rejected.push(message);
    }
    const viewport=svgViewport({attrs:{width:'2in',height:'25.4mm'}});
    check(viewport[2]===192&&viewport[3]===96,'physical units changed');
    return {reports,rejected,fixture};
  },fixtures);
  mkdirSync('artifacts/svg-common',{recursive:true});
  await page.locator('#project-input').setInputFiles({name:'mask.fold',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(result.fixture.project))});
  await page.waitForFunction(()=>window.__foldStudio.project.layers.some(l=>l.text==='Editable text'));
  const text=await page.evaluate(()=>window.__foldStudio.project.layers.find(l=>l.type==='text'));
  await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  await page.locator(`[data-node-id="${text.id}"]`).click();await page.locator('#node-text').fill('Mask and text');await page.locator('#node-text').blur();
  await page.waitForFunction(()=>JSON.stringify(window.__foldStudio.project.svgArtwork).includes('Mask and text'));
  const before=await page.evaluate(()=>JSON.stringify(window.__foldStudio.project));
  await page.locator('#image-input').setInputFiles({name:'unsupported.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>')});
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('foreignObject'));
  await page.locator('#svg-support-dialog').waitFor({state:'visible'});
  assert.ok((await page.locator('#svg-support-dialog').textContent()).includes('feImage'));
  assert.ok((await page.locator('#svg-support-error').textContent()).includes('foreignObject'));
  await page.locator('#svg-support-dialog button').click();
  await page.locator('#edit-menu-toggle').click();await page.locator('#svg-support-button').click();
  assert.equal(await page.locator('#svg-support-error').isVisible(),false);
  await page.locator('#svg-support-dialog button').click();
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__foldStudio.project)),before);
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  writeFileSync('artifacts/svg-common/report.json',JSON.stringify({reports:result.reports,rejected:result.rejected,requests,errors},null,2));
  await page.screenshot({path:'artifacts/svg-common/editor.png'});
  console.log(JSON.stringify({reports:result.reports,rejected:result.rejected.length,requests,errors},null,2));
}catch(error){
  const failure=await page?.evaluate(()=>window.svgCommonFailure).catch(()=>null);
  if(failure){mkdirSync('artifacts/svg-common',{recursive:true});writeFileSync('artifacts/svg-common/failure.svg',failure.output);console.log(failure.panel);for(const key of ['actual','exported'])writeFileSync(`artifacts/svg-common/failure-${key}.png`,Buffer.from(failure[key].split(',')[1],'base64'));}
  await page?.screenshot({path:'artifacts/svg-common-failure.png'}).catch(()=>{});throw error;
}
finally{await browser.close();await server.close();}
