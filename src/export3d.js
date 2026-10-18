import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { foldMatrices } from './folding.js';
import { paintArtwork } from './artwork.js';
import { surfaceOf } from './project.js';
import { createPanelGeometry, createCylinderRibbonGeometry, updateCylinderRibbonPositions, buildContainerAccessories } from './model3d.js';

export async function exportGLB(project, dieline, images, options = {}) {
  const {
    fold = project.fold,
    resolution = 2048,
    includeInside = true,
  } = options;

  await images.preload(project.layers);
  await document.fonts.ready;

  const { width, height, minX, minY } = dieline;
  const scale = resolution / Math.max(width, height);
  const w = Math.ceil(width * scale) + 2;
  const h = Math.ceil(height * scale) + 2;

  // 1. Outside texture & material
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d');
  outCtx.fillStyle = surfaceOf(project, 'outside').paper;
  outCtx.fillRect(0, 0, w, h);
  outCtx.setTransform(w / width, 0, 0, h / height, -minX * w / width, -minY * h / height);
  paintArtwork(outCtx, project, dieline, images, 'outside');

  const outTexture = new THREE.CanvasTexture(outCanvas);
  outTexture.colorSpace = THREE.SRGBColorSpace;
  outTexture.name = 'Outside_Texture';

  const frontMaterial = new THREE.MeshStandardMaterial({
    name: 'Outside_Surface',
    map: outTexture,
    roughness: project.material === 'gloss' ? 0.32 : 0.87,
    metalness: 0,
  });

  // 2. Inside texture & material
  let inTexture = null;
  if (includeInside) {
    const inCanvas = document.createElement('canvas');
    inCanvas.width = w;
    inCanvas.height = h;
    const inCtx = inCanvas.getContext('2d');
    inCtx.fillStyle = surfaceOf(project, 'inside').paper;
    inCtx.fillRect(0, 0, w, h);
    inCtx.setTransform(w / width, 0, 0, h / height, -minX * w / width, -minY * h / height);
    paintArtwork(inCtx, project, dieline, images, 'inside');

    inTexture = new THREE.CanvasTexture(inCanvas);
    inTexture.colorSpace = THREE.SRGBColorSpace;
    inTexture.name = 'Inside_Texture';
  }

  const innerMaterial = new THREE.MeshStandardMaterial({
    name: 'Inside_Surface',
    map: inTexture,
    color: inTexture ? 0xffffff : new THREE.Color(project.insidePaper || '#eeeadd'),
    roughness: project.material === 'gloss' ? 0.32 : 0.95,
    metalness: 0,
  });

  // 3. Cardboard cut edge material
  const edgeMaterial = new THREE.MeshStandardMaterial({
    name: 'Cardboard_Edge',
    color: 0xc8bfa6,
    roughness: 1,
    metalness: 0,
  });

  // 4. Construct hierarchical model
  const rootGroup = new THREE.Group();
  rootGroup.name = `${project.name || 'FoldStudio'}_Box`;

  const rootPanel = dieline.panels.find(p => p.id === dieline.rootId);
  const cx = rootPanel.x + rootPanel.w / 2;
  const cy = rootPanel.y + rootPanel.h / 2;
  const transforms = foldMatrices(dieline, fold, cx, cy);

  for(const panel of dieline.panels){
    const curved=dieline.cylinder && panel.id==='body';
    const geometry=curved?createCylinderRibbonGeometry(panel.w,panel.h,dieline,panel):createPanelGeometry(panel,dieline,cx,cy);
    if(curved)updateCylinderRibbonPositions(geometry,panel.w,panel.h,dieline.cylinder.diameter,fold);
    const mesh=new THREE.Mesh(geometry,[frontMaterial,innerMaterial,edgeMaterial]);
    mesh.name=panel.label+'_'+panel.id;
    if(!curved)transforms.get(panel.id)?.decompose(mesh.position,mesh.quaternion,mesh.scale);
    mesh.updateMatrix();rootGroup.add(mesh);
  }
  if(dieline.cylinder && fold>.12){
    const accessories=buildContainerAccessories(project.type,dieline.cylinder);
    accessories.scale.setScalar(Math.min(1,Math.max(0,(fold-.12)/.88)));
    rootGroup.add(accessories);
  }

  rootGroup.rotation.x = dieline.rootRotationX;
  rootGroup.updateMatrixWorld(true);

  // 5. Binary GLTF export
  const exporter = new GLTFExporter();
  try {
    const glbBuffer = await exporter.parseAsync(rootGroup, {
      binary: true,
      trs: true,
      maxTextureSize: resolution,
    });
    return glbBuffer;
  } finally {
    outTexture.dispose();
    inTexture?.dispose();
    frontMaterial.dispose();
    innerMaterial.dispose();
    edgeMaterial.dispose();
    for (const child of rootGroup.children) {
      if (child.isGroup) {
        for (const sub of child.children) {
          sub.geometry?.dispose();
          sub.material?.dispose();
        }
      }
      child.geometry?.dispose();
    }
  }
}
