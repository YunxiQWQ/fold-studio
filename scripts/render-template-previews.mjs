import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const sources=['src/geometry.js','src/reference-cartons.js','src/rigid-reference-cartons.js','src/paper-bag.js','src/selected-structures.js','src/selected-containers.js','src/source-containers.generated.js','src/curved-carton.js','src/curved-carton-mesh.js','src/folding.js','src/model3d.js','src/preview3d.js','src/project.js','src/artwork.js','src/artwork-space.js','scripts/render-template-previews.mjs'];
const hash=createHash('sha256');for(const file of sources)hash.update(await readFile(file));const geometryHash=hash.digest('hex');
const manifestPath='src/template-previews.manifest.json',modulePath='src/template-previews.generated.js';
try{const old=JSON.parse(await readFile(manifestPath,'utf8'));if(old.geometryHash===geometryHash&&existsSync(modulePath)){console.log('结构预览与当前模型一致，无需重新生成');process.exit(0);}}catch{}
const server=await createServer({plugins:[{name:'template-preview-page',configureServer(s){s.middlewares.use('/__template-previews',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="margin:0"><div id="host" style="width:384px;height:288px"></div></body></html>');});}}],server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
let browser;
try{
 const installed=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
 browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:384,height:288}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__template-previews`);
 const previews=await page.evaluate(async()=>{
   const [{Preview3D},{ImageCache},{BOX_TYPES,makeDieline},{newProject}]=await Promise.all([import('/src/preview3d.js'),import('/src/artwork.js'),import('/src/geometry.js'),import('/src/project.js')]);
   const THREE=await import('/node_modules/three/build/three.module.js');
   const preview=new Preview3D(document.querySelector('#host'),new ImageCache(),()=>{},()=>{});preview.setQuality('economy');preview.renderer.toneMappingExposure=.95;
   const result={},folds={carton:.94,'reverse-carton':.94,'lock-bottom':.94,mailer:.88,lidbox:1,'drawer-box':1,'book-box':.90,shipper:.90,'display-hinged':.82,'card-deck-lock':.96};
   try{for(const [type,info]of Object.entries(BOX_TYPES)){
     const project=newProject(type);project.layers=[];project.paper='#9bb184';project.insidePaper='#e4e4cb';project.fold=folds[type]??1;
     const geometry=makeDieline(type,project.dimensions);preview.build(project,geometry);
     const edges=[];for(const mesh of preview.meshes.values()){const line=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,35),new THREE.LineBasicMaterial({color:'#546747',transparent:true,opacity:.55}));mesh.add(line);edges.push(line);}
     preview.fit();preview.render();
     const canvas=document.createElement('canvas');canvas.width=384;canvas.height=288;const ctx=canvas.getContext('2d');ctx.drawImage(preview.renderer.domElement,0,0);
     const pixels=ctx.getImageData(0,0,384,288).data;let occupied=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>20)occupied++;
     if(occupied<1000)throw new Error(type+' 缩略图为空');
     result[type]={src:canvas.toDataURL('image/png'),fold:project.fold,dimensions:info.defaults,panels:geometry.panels.length,occupied};
     for(const line of edges){line.removeFromParent();line.geometry.dispose();line.material.dispose();}
     await new Promise(r=>requestAnimationFrame(r));
   }}finally{preview.dispose();preview.renderer.forceContextLoss();}
   return result;
 });
 if(errors.length)throw Error(errors.join('\n'));await mkdir('artifacts/template-previews',{recursive:true});
 for(const [type,entry]of Object.entries(previews))await writeFile(`artifacts/template-previews/${type}.png`,Buffer.from(entry.src.split(',')[1],'base64'));
 await writeFile(modulePath,'// Generated from the actual Preview3D model. Run npm run build:previews after geometry changes.\nexport const TEMPLATE_PREVIEWS='+JSON.stringify(previews)+';\n');
 await writeFile(manifestPath,JSON.stringify({geometryHash,sources,previews:Object.fromEntries(Object.entries(previews).map(([type,{src,...entry}])=>[type,entry]))},null,2)+'\n');
 console.log(`已从实际模型生成 ${Object.keys(previews).length} 款结构预览，运行时不增加 WebGL 上下文`);
}finally{await browser?.close();await server.close();}
