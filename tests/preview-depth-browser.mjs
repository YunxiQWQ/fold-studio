import {chromium} from 'playwright';
import {createServer} from 'vite';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});await server.listen();
const directory=resolve(process.env.FOLD_TEST_ARTIFACTS??'artifacts/context-depth/depth');mkdirSync(directory,{recursive:true});
const executable=process.env.FOLD_BROWSER_PATH??resolve(process.env.LOCALAPPDATA??'','ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const browser=await chromium.launch({...(existsSync(executable)?{executablePath:executable}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.locator('#editor-host[data-svg-ready="true"]').waitFor();
  const results=await page.evaluate(async baseline=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {Preview3D}=await import('/src/preview3d.js'),{newProject}=await import('/src/project.js'),{BOX_TYPES,makeDieline}=await import('/src/geometry.js');
    const host=document.createElement('div');host.style.cssText='position:fixed;inset:0 auto auto 0;width:260px;height:600px;background:white;z-index:10000';document.body.append(host);
    const preview=new Preview3D(host,{});preview.setQuality('economy');preview.renderer.toneMapping=THREE.NoToneMapping;
    preview.frontMaterial.map=null;preview.frontMaterial.color.set('#00ff00');preview.innerMaterial.map=null;preview.innerMaterial.color.set('#ff0000');
    const materials=[new THREE.MeshBasicMaterial({color:0x00ff00}),new THREE.MeshBasicMaterial({color:0xff0000}),new THREE.MeshBasicMaterial({color:0x0000ff})];
    const ray=new THREE.Raycaster(),results=[];
    function sample(name){
      preview.render();if(baseline){preview.camera.near=.1;preview.camera.far=20000;preview.camera.updateProjectionMatrix();preview.renderer.render(preview.scene,preview.camera);}
      const gl=preview.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let checked=0,wrong=0,outside=0,inside=0;
      for(let y=3;y<h-3;y+=4)for(let x=3;x<w-3;x+=4){
        ray.setFromCamera(new THREE.Vector2((x+.5)/w*2-1,(y+.5)/h*2-1),preview.camera);
        const hits=ray.intersectObject(preview.root,true).filter(hit=>hit.object.visible&&hit.object.material[hit.face.materialIndex]?.visible!==false);
        const hit=hits[0];if(!hit||hit.face.materialIndex===2)continue;
        // Avoid antialiased silhouette and triangle edges: nearby rays must agree.
        let solid=true;
        for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){
          ray.setFromCamera(new THREE.Vector2((x+.5+dx)/w*2-1,(y+.5+dy)/h*2-1),preview.camera);const near=ray.intersectObject(preview.root,true).find(hit=>hit.object.visible);
          if(!near||near.object!==hit.object||near.face.materialIndex!==hit.face.materialIndex)solid=false;
        }
        if(!solid)continue;
        const index=hit.face.materialIndex===0?1:0,p=(y*w+x)*4,other=index===1?0:1;
        checked++;if(index===1)outside++;else inside++;
        if(pixels[p+other]>pixels[p+index]+30)wrong++;
      }
      const row={name,checked,wrong,outside,inside,near:preview.camera.near,far:preview.camera.far};results.push(row);return row;
    }
    // Two real cardboard slabs, opposite printed sides facing the camera,
    // separated by the same 0.18 mm clearance used by overlapping carton flaps.
    const geometry=new THREE.BoxGeometry(200,150,.45);geometry.clearGroups();for(let i=0;i<6;i++)geometry.addGroup(i*6,6,i===4?0:i===5?1:2);
    for(const z of [0,.63]){const mesh=new THREE.Mesh(geometry,materials);mesh.position.z=z;if(!z)mesh.rotation.y=Math.PI;preview.root.add(mesh);}
    preview.camera.position.set(70,60,1600);preview.camera.lookAt(0,0,0);preview.root.updateMatrixWorld(true);sample('stacked-slabs');
    for(const type of ['carton','reverse-carton','lidbox','lock-bottom','book-box','drawer-box','mailer','tray','full-overlap-shipper','slotted-handle-carton','wrapped-lidbox']){
      if(!BOX_TYPES[type])continue;
      const project=newProject();project.type=type;project.dimensions={...BOX_TYPES[type].defaults};project.layers=[];
      preview.build(project,makeDieline(type,project.dimensions));for(const mesh of preview.meshes.values())mesh.material=materials;
      for(const fold of [1,.65]){preview.setFold(fold);preview.fit();sample(type+'-'+fold);}
      const inspection=preview.dieline.panels.find(panel=>panel.id===preview.dieline.rootId);
      preview.inspectPanel(inspection.id,'inside',true);sample(type+'-inside');
      preview.showAll();preview.camera.position.copy(preview.controls.target).add(new THREE.Vector3(2,1,12));preview.camera.lookAt(preview.controls.target);sample(type+'-close');
    }
    preview.dispose();host.remove();return results;
  },process.env.FOLD_DEPTH_BASELINE==='1');
  writeFileSync(resolve(directory,'results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({cases:results.length,pixels:results.reduce((sum,row)=>sum+row.checked,0),wrong:results.reduce((sum,row)=>sum+row.wrong,0),baseline:process.env.FOLD_DEPTH_BASELINE==='1'}));
  if(process.env.FOLD_DEPTH_BASELINE!=='1'){
    assert.ok(results.find(row=>row.name==='stacked-slabs').checked>50);
    for(const row of results){assert.ok(row.checked>0,row.name+' visible');assert.equal(row.wrong,0,row.name+' must not show a farther, opposite-side surface');assert.ok(row.near>0&&row.far>row.near);}
    assert.deepEqual(errors,[]);
  }
}finally{await browser.close();await server.close();}
