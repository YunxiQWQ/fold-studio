import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { foldMatrices } from './folding.js';
import { paintArtwork } from './artwork.js';
import { surfaceOf } from './project.js';
import { BOX_TYPES } from './geometry.js';
import {createPanelGeometry, createCylinderRibbonGeometry, updateCylinderRibbonPositions, buildContainerAccessories, pickPanel, canProportions} from './model3d.js';
import { proofColor } from './color.js';

const QUALITY = { economy: { dpr: 1, atlas: 768 }, balanced: { dpr: 1.35, atlas: 1536 }, crisp: { dpr: 1.8, atlas: 2048 } };

export class Preview3D {
  constructor(host, images, onPanel, onStats) {
    this.host = host; this.images = images; this.onPanel = onPanel; this.onStats = onStats;
    this.colorMode = 'rgb';
    this.theme = 'light';
    this.stats = { frames: 0, textureUpdates: 0, sideTextureUpdates: {outside:0,inside:0}, geometryBuilds: 0, lastFrameMs: 0, atlas: [0,0] };
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.setAttribute('aria-label', '包装三维预览，拖动旋转，滚轮缩放，点击选择面板');
    this.renderer.domElement.dataset.testid = 'preview-canvas';
    this.host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20000);
    this.makeControls();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d76, 2.6));
    for (const [color, intensity, position] of [[0xfff5e3, 2.5, [300,400,500]], [0xe3ecff, 1.4, [-400,200,-200]]]) {
      const light = new THREE.DirectionalLight(color, intensity); light.position.set(...position); this.scene.add(light);
    }
    this.atlas = document.createElement('canvas');
    this.texture = new THREE.CanvasTexture(this.atlas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false; this.texture.minFilter = THREE.LinearFilter;
    this.texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.frontMaterial = new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.85, metalness: 0 });
    this.innerMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeadd, roughness: 0.95 });
    this.surfaces={outside:{canvas:this.atlas,texture:this.texture,material:this.frontMaterial},inside:{canvas:document.createElement('canvas'),texture:null,material:this.innerMaterial}};
    this.edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xc8bfa6, roughness: 1 });
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.raycaster = new THREE.Raycaster();
    this.renderer.domElement.addEventListener('pointerdown', e => { this.pointerDown = e.button===0?[e.clientX, e.clientY]:null; });
    this.renderer.domElement.addEventListener('pointercancel',()=>{this.pointerDown=null;});
    this.renderer.domElement.addEventListener('pointerup', e => {
      const start=this.pointerDown;this.pointerDown=null;
      if (!start || Math.hypot(e.clientX-start[0],e.clientY-start[1]) > 5) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1, -(e.clientY-rect.top)/rect.height*2+1), this.camera);
      this.root.updateMatrixWorld(true);
      const hit=pickPanel(this.raycaster,this.root);
      if(hit)this.onPanel(hit.panel,hit.side);
    });
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.host);
    this.visibilityHandler = () => { if (!document.hidden) this.invalidate(); };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  setQuality(quality) {
    this.quality = QUALITY[quality] ?? QUALITY.balanced;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.dpr));
    this.resize();
  }

  setTheme(theme) {
    this.theme = theme;
    if (theme === 'gray' || theme === 'dark' || theme === 'slate') {
      this.renderer.toneMappingExposure = 1.32;
    } else {
      this.renderer.toneMappingExposure = 1.25;
    }
    this.invalidate();
  }

  makeControls(){
    this.controls?.dispose();this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=false;this.controls.minDistance=15;this.controls.maxDistance=12000;
    this.controls.addEventListener('change',()=>this.invalidate());
  }
  setCameraUp(up){if(this.camera.up.distanceToSquared(up)>1e-10){this.camera.up.copy(up);this.makeControls();}}
  showAll(){
    this.frontMaterial.visible=true;
    const isCan = this.project?.type?.startsWith('beverage-can');
    for(const mesh of this.root.children){
      if (mesh === this.accessories) {
        mesh.visible = this.foldValue > 0.12;
      } else if (isCan && (mesh.userData?.panel === 'top-lid' || mesh.userData?.panel === 'bottom-rim')) {
        mesh.visible = this.foldValue <= 0.12;
      } else {
        mesh.visible = true;
      }
    }
    this.invalidate();
    if(this.isolatedPanel){this.isolatedPanel=null;this.onIsolation?.(false);}
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h); this.camera.aspect = w/h; this.camera.updateProjectionMatrix();
    if(this.isolatedPanel)this.inspectPanel(this.isolatedPanel,this.inspectedSide,true);
    else if(this.dieline)this.fit();
    this.invalidate();
  }

  build(project, dieline) {
    this.project = project; this.dieline = dieline;
    this.isolatedPanel=null;this.onIsolation?.(false);
    for (const mesh of [...this.root.children]) {
      if (mesh.isGroup) {
        for (const child of mesh.children) { child.geometry?.dispose(); child.material?.dispose(); }
      }
      mesh.geometry?.dispose();
      this.root.remove(mesh);
    }
    const rootPanel = dieline.panels.find(p => p.id === dieline.rootId);
    this.cx = rootPanel.x + rootPanel.w/2; this.cy = rootPanel.y + rootPanel.h/2;
    this.meshes = new Map();
    this.accessories = null;

    for(const panel of dieline.panels){
      const geometry=dieline.cylinder && panel.id==='body'
        ? createCylinderRibbonGeometry(panel.w,panel.h,dieline,panel)
        : createPanelGeometry(panel,dieline,this.cx,this.cy);
      const mesh=new THREE.Mesh(geometry,[this.frontMaterial,this.innerMaterial,this.edgeMaterial]);
      mesh.userData.panel=panel.id;mesh.matrixAutoUpdate=false;
      this.root.add(mesh);this.meshes.set(panel.id,mesh);
    }
    if(dieline.cylinder){
      this.accessories=buildContainerAccessories(project.type,dieline.cylinder);
      this.root.add(this.accessories);
    }
    this.root.rotation.x = dieline.rootRotationX;
    this.stats.geometryBuilds++;
    this.setFold(project.fold); this.paint(project); this.fit();
    if(!this.compiled){this.compiled=true;this.renderer.compileAsync(this.scene,this.camera).then(()=>this.invalidate()).catch(error=>console.error('三维材质初始化失败',error));}
  }

  setFold(value) {
    if (!this.dieline) return;
    this.foldValue=value;
    if (this.dieline.cylinder) {
      const isCan = this.project?.type?.startsWith('beverage-can');
      const bodyMesh = this.meshes.get('body');
      if (bodyMesh) {
        let ySpan = null;
        if (isCan) {
          const { neckH, botH } = canProportions(this.dieline.cylinder.diameter, this.dieline.cylinder.height);
          const yTop = this.dieline.cylinder.height / 2 - neckH * value;
          const yBottom = -this.dieline.cylinder.height / 2 + botH * value;
          ySpan = [yTop, yBottom];
        }
        updateCylinderRibbonPositions(bodyMesh.geometry, this.dieline.cylinder.diameter * Math.PI, this.dieline.cylinder.height, this.dieline.cylinder.diameter, value, ySpan);
      }
      if (this.accessories) {
        this.accessories.visible = !this.isolatedPanel && value > 0.12;
        const s = Math.min(1, Math.max(0, (value - 0.12) / 0.88));
        this.accessories.scale.set(s, s, s);
      }
    }
    const isCan = this.project?.type?.startsWith('beverage-can');
    const transforms = foldMatrices(this.dieline,value,this.cx,this.cy);
    for (const panel of this.dieline.panels) {
      if (this.dieline.cylinder && panel.id === 'body') continue;
      const mesh = this.meshes.get(panel.id);
      if (mesh) {
        if (isCan && (panel.id === 'top-lid' || panel.id === 'bottom-rim')) {
          mesh.visible = this.isolatedPanel === panel.id || value <= 0.12;
        }
        mesh.matrix.copy(transforms.get(panel.id));
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
    this.root.updateMatrixWorld(true);
    if(this.isolatedPanel)this.inspectPanel(this.isolatedPanel,this.inspectedSide,true);
    this.invalidate();
  }

  setColorMode(colorMode) {
    this.colorMode = colorMode;
    if (this.project) this.paint(this.project);
  }

  paint(project, sides = ['outside','inside']) {
    if (!this.dieline) return;
    this.project = project;
    const { width, height, minX, minY } = this.dieline;
    const scale = (this.quality?.atlas ?? 1536) / Math.max(width,height);
    const w = Math.ceil(width*scale)+2, h=Math.ceil(height*scale)+2;
    for(const side of sides){
      const surface=this.surfaces[side],canvas=surface.canvas;
      if(canvas.width!==w||canvas.height!==h||!surface.texture){
        canvas.width=w;canvas.height=h;surface.texture?.dispose();
        surface.texture=new THREE.CanvasTexture(canvas);surface.texture.colorSpace=THREE.SRGBColorSpace;
        surface.texture.generateMipmaps=false;surface.texture.minFilter=THREE.LinearFilter;
        surface.texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
        surface.material.map=surface.texture;surface.material.color.set('#ffffff');surface.material.needsUpdate=true;
      }
      const ctx=canvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=proofColor(surfaceOf(project,side).paper,this.colorMode);ctx.fillRect(0,0,w,h);
      ctx.setTransform(w/width,0,0,h/height,-minX*w/width,-minY*h/height);
      paintArtwork(ctx,project,this.dieline,this.images,side,this.colorMode);
      surface.texture.needsUpdate=true;surface.material.roughness=project.material==='gloss'?.32:.87;
      this.stats.textureUpdates++;this.stats.sideTextureUpdates[side]++;
    }
    this.texture=this.surfaces.outside.texture;
    this.stats.atlas=[w,h];this.invalidate();
  }

  fit(view='iso') {
    if (!this.dieline) return;
    this.showAll();
    this.root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(this.root), size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3());
    const halfFov=this.camera.fov*Math.PI/360;
    const distance=Math.max(size.y,size.x/Math.max(.25,this.camera.aspect),size.z)*.64/Math.tan(halfFov)+size.z*.6;
    this.setCameraUp(new THREE.Vector3(0,1,0));
    const directions={iso:BOX_TYPES[this.project.type].family==='tray'?[1,1.45,1.5]:BOX_TYPES[this.project.type].family==='container'?[1,.45,1.7]:[1,.65,1.6],front:[0,0,1],reverse:[0,0,-1],bottom:[0,-1,.001],side:[1,0,0],top:[0,1,.001]};
    const direction=new THREE.Vector3(...(directions[view] ?? directions.iso)).normalize();
    this.camera.position.copy(center).addScaledVector(direction,Math.max(100,distance));
    this.controls.target.copy(center); this.controls.update(); this.invalidate();
  }

  inspectPanel(panelId,side='outside',isolate=false) {
    const panel=this.dieline?.panels.find(p=>p.id===panelId),mesh=this.meshes?.get(panelId);
    if(!panel||!mesh)return;
    this.root.updateMatrixWorld(true);
    this.inspectedSide=side;
    const curved=this.dieline.cylinder && panelId==='body';
    // In an isolated inside-label check, remove the opaque outside so the inner print is readable.
    this.frontMaterial.visible=!(curved && side==='inside' && isolate);
    const center=curved?new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()):new THREE.Vector3(panel.x+panel.w/2-this.cx,-(panel.y+panel.h/2-this.cy),0).applyMatrix4(mesh.matrixWorld);
    const normal=new THREE.Vector3(0,0,side==='outside'?1:-1).transformDirection(mesh.matrixWorld);
    const up=new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld);
    const distance=Math.max(panel.h,(curved && this.foldValue>.9?this.dieline.cylinder.diameter:panel.w)/Math.max(.25,this.camera.aspect))*.63/Math.tan(this.camera.fov*Math.PI/360);
    if(isolate){for(const child of this.root.children)child.visible=child===mesh;this.isolatedPanel=panelId;this.onIsolation?.(true);}
    this.setCameraUp(up);this.camera.position.copy(center).addScaledVector(normal,Math.max(15,distance));
    this.controls.target.copy(center);this.controls.update();this.invalidate();
  }

  invalidate() {
    if (this.raf || this.disposed || document.hidden) return;
    this.raf=requestAnimationFrame(() => { this.raf=0; this.render(); });
  }

  render() {
    if (this.disposed) return;
    const start=performance.now(); this.renderer.render(this.scene,this.camera);
    this.stats.frames++; this.stats.lastFrameMs=performance.now()-start;
    this.stats.modelType=this.project?.type;this.stats.fold=this.foldValue;
    this.stats.drawCalls=this.renderer.info.render.calls;
    this.stats.triangles=this.renderer.info.render.triangles;
    this.stats.textures=this.renderer.info.memory.textures;
    this.onStats?.(this.stats);
  }

  async capture() {
    this.render();
    return new Promise(resolve => this.renderer.domElement.toBlob(resolve,'image/png'));
  }

  dispose() {
    this.disposed=true; cancelAnimationFrame(this.raf); this.resizeObserver.disconnect(); this.controls.dispose();
    document.removeEventListener('visibilitychange',this.visibilityHandler);
    for(const mesh of this.root.children) {
      if (mesh.isGroup) {
        for (const child of mesh.children) {
          child.geometry?.dispose();
          child.material?.dispose();
        }
      }
      mesh.geometry?.dispose();
    }
    for(const surface of Object.values(this.surfaces))surface.texture?.dispose();
    this.frontMaterial.dispose(); this.innerMaterial.dispose(); this.edgeMaterial.dispose(); this.renderer.dispose();
  }
}

