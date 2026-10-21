import * as THREE from 'three';
import {BOARD_THICKNESS} from './geometry.js';
import {createCurvedSkinGeometry} from './curved-carton-mesh.js';
import {SELECTED_CONTAINERS,createSourceRibbonGeometry,updateSourceRibbonGeometry,buildSourceHardware,buildBlankTin} from './selected-containers.js';

export function createPanelGeometry(panel, dieline, cx, cy) {
  if(panel.curvedSkin)return createCurvedSkinGeometry(panel,dieline,cx,cy,BOARD_THICKNESS);
  const shape = new THREE.Shape(panel.points.map(([x,y]) => new THREE.Vector2(x-cx, -(y-cy))));
  if (panel.holes) {
    for (const hole of panel.holes) {
      shape.holes.push(new THREE.Path(hole.map(([x,y]) => new THREE.Vector2(x-cx, -(y-cy)))));
    }
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {depth:BOARD_THICKNESS, bevelEnabled:false, steps:1, curveSegments:1});
  geometry.translate(0,0,-BOARD_THICKNESS/2);
  const {position,uv,normal}=geometry.attributes;
  for(let i=0;i<position.count;i++)uv.setXY(i,(position.getX(i)+cx-dieline.minX)/dieline.width,1-(cy-position.getY(i)-dieline.minY)/dieline.height);
  geometry.clearGroups();
  let start=0,last=null;
  for(let i=0;i<position.count;i+=3){
    const index=normal.getZ(i)>.5?0:normal.getZ(i)<-.5?1:2;
    if(last!==null && last!==index){geometry.addGroup(start,i-start,last);start=i;}
    last=index;
  }
  geometry.addGroup(start,position.count-start,last);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

// Raycaster also visits invisible objects. Only the first visible surface can be selected.
export function pickPanel(raycaster, root) {
  const hit=raycaster.intersectObjects(root.children,true).find(h=>{
    for(let obj=h.object;obj;obj=obj.parent)if(!obj.visible)return false;
    const material=Array.isArray(h.object.material)?h.object.material[h.face?.materialIndex]:h.object.material;
    if(material?.visible===false)return false;
    return true;
  });
  return hit?.object.userData.panel && hit.face?.materialIndex!==2
    ? {panel:hit.object.userData.panel,side:hit.face.materialIndex===1?'inside':'outside'} : null;
}

export function createCylinderRibbonGeometry(W, H, dieline, panel) {
  if(dieline.cylinder.sourceType){const g=createSourceRibbonGeometry(dieline.cylinder.sourceType,panel,dieline);g.sourceRibbon.totalHeight=dieline.cylinder.height;return g;}
  const segX = 64, segY = 1;
  const geom = new THREE.BufferGeometry();
  const vertCount = (segX + 1) * (segY + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  const panelX = panel.x, panelY = panel.y;
  for (let side = 0; side < 2; side++) {
    const offset = side * (segX + 1) * (segY + 1);
    for (let j = 0; j <= segY; j++) {
      const v = j / segY;
      const y2d = panelY + v * H;
      const vAtlas = 1 - (y2d - dieline.minY) / dieline.height;
      for (let i = 0; i <= segX; i++) {
        const u = i / segX;
        const x2d = panelX + u * W;
        const uAtlas = (x2d - dieline.minX) / dieline.width;
        const idx = offset + j * (segX + 1) + i;
        uvs[idx * 2] = uAtlas;
        uvs[idx * 2 + 1] = vAtlas;
      }
    }
  }

  const indicesFront = [];
  const indicesBack = [];
  const stride = segX + 1;
  const backOffset = (segX + 1) * (segY + 1);

  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = (j + 1) * stride + i;
      const d = c + 1;
      indicesFront.push(a, c, b, b, c, d);

      const ba = backOffset + a;
      const bb = backOffset + b;
      const bc = backOffset + c;
      const bd = backOffset + d;
      indicesBack.push(ba, bb, bc, bb, bd, bc);
    }
  }

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  geom.setIndex([...indicesFront, ...indicesBack]);
  geom.addGroup(0, indicesFront.length, 0);
  geom.addGroup(indicesFront.length, indicesBack.length, 1);

  return geom;
}

export function canProportions(D, H) {
  const neckH = Math.max(7, Math.min(10.5, H * 0.075));
  const botH = Math.max(7, Math.min(11, H * 0.075));
  return { neckH, botH };
}

export function updateCylinderRibbonPositions(geometry, W, H, D, t, ySpan = null) {
  if(geometry.sourceRibbon){updateSourceRibbonGeometry(geometry,D,geometry.sourceRibbon.totalHeight,t);return;}
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const segX = 64, segY = 1;
  const stride = segX + 1;
  const backOffset = (segX + 1) * (segY + 1);
  const R = D / 2;
  const thickness = BOARD_THICKNESS;

  for (let j = 0; j <= segY; j++) {
    const v = j / segY;
    const y = ySpan ? (1 - v) * ySpan[0] + v * ySpan[1] : (0.5 - v) * H;
    for (let i = 0; i <= segX; i++) {
      const u = i / segX;
      let x, z, nx, nz;
      if (t < 1e-5) {
        x = (u - 0.5) * W;
        z = 0;
        nx = 0; nz = 1;
      } else {
        const alpha = (u - 0.5) * t * 2 * Math.PI;
        const r = R / t;
        x = r * Math.sin(alpha);
        const zMid = -(r / 2) * (1 - Math.cos(t * Math.PI));
        z = r * (Math.cos(alpha) - 1) - zMid;
        nx = Math.sin(alpha);
        nz = Math.cos(alpha);
      }

      const fIdx = j * stride + i;
      pos.setXYZ(fIdx, x + nx * (thickness / 2), y, z + nz * (thickness / 2));
      norm.setXYZ(fIdx, nx, 0, nz);

      const bIdx = backOffset + fIdx;
      pos.setXYZ(bIdx, x - nx * (thickness / 2), y, z - nz * (thickness / 2));
      norm.setXYZ(bIdx, -nx, 0, -nz);
    }
  }
  pos.needsUpdate = true;
  norm.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

export function buildContainerAccessories(type, cylinder) {
  if(SELECTED_CONTAINERS[type]?.sourceMesh)return buildSourceHardware(type,cylinder);
  if(type==='blank-metal-tin')return buildBlankTin(cylinder);
  const { diameter: D, height: H } = cylinder;
  const R = D / 2;
  const group = new THREE.Group();
  group.name = 'ContainerAccessories';

  if (type.startsWith('beverage-can')) {
    const aluMat = new THREE.MeshStandardMaterial({
      color: 0xd8dade,
      metalness: 0.92,
      roughness: 0.22,
      side: THREE.DoubleSide,
      name: 'Can_Aluminum',
    });
    const tabMat = new THREE.MeshStandardMaterial({
      color: 0xebedef,
      metalness: 0.95,
      roughness: 0.16,
      side: THREE.DoubleSide,
      name: 'Can_Tab_Aluminum',
    });

    // Outer radius slightly proud of the label cylinder so the neck/chime overlap smoothly
    const R_outer = R + 0.28;
    // Standard industry lid sizing: slim cans have smaller 200 lid (~48mm on 53mm), standard/tall have 202 lid (~54mm on 66mm)
    const neckRatio = D <= 54 ? 0.90 : D <= 60 ? 0.86 : 0.83;
    const { neckH, botH } = canProportions(D, H);
    const seamH = 2.2;
    const coneH = neckH - seamH;
    const R_lid = R * neckRatio;
    const R_seam = R_lid * 1.025;

    // 1. Top Neck Taper (slanted shoulder)
    const topNeckGeom = new THREE.CylinderGeometry(R_lid, R, coneH, 64, 1, true);
    const topNeck = new THREE.Mesh(topNeckGeom, aluMat);
    topNeck.position.y = H / 2 - seamH - coneH / 2;
    group.add(topNeck);

    // 2. Double Seam Rim (rolled aluminum bead at top)
    const seamGeom = new THREE.CylinderGeometry(R_seam, R_seam, seamH, 64, 1, true);
    const seam = new THREE.Mesh(seamGeom, aluMat);
    seam.position.y = H / 2 - seamH / 2;
    group.add(seam);

    // 3. Recessed Lid Countersink Wall & Plate (sunken center panel)
    const countersinkDepth = 1.8;
    const sinkWallGeom = new THREE.CylinderGeometry(R_lid * 0.95, R_lid, countersinkDepth, 64, 1, true);
    const sinkWall = new THREE.Mesh(sinkWallGeom, aluMat);
    sinkWall.position.y = H / 2 - countersinkDepth / 2;
    group.add(sinkWall);

    const lidPlateGeom = new THREE.CylinderGeometry(R_lid * 0.95, R_lid * 0.95, 0.4, 64);
    const lidPlate = new THREE.Mesh(lidPlateGeom, aluMat);
    lidPlate.position.y = H / 2 - countersinkDepth;
    group.add(lidPlate);

    // 4. Stay-On Tab (SOT) Pull Tab Assembly
    const tabGroup = new THREE.Group();
    tabGroup.name = 'Can_StayOnTab';
    tabGroup.position.y = H / 2 - countersinkDepth + 0.35;

    // 4a. Center Rivet
    const rivetGeom = new THREE.CylinderGeometry(R * 0.038, R * 0.038, 0.6, 24);
    const rivet = new THREE.Mesh(rivetGeom, tabMat);
    rivet.position.set(0, 0.25, R * 0.04);
    tabGroup.add(rivet);

    // 4b. Tab Lever Plate (stamped body)
    const leverW = R * 0.22, leverL = R * 0.42;
    const leverGeom = new THREE.BoxGeometry(leverW, 0.35, leverL);
    const lever = new THREE.Mesh(leverGeom, tabMat);
    lever.position.set(0, 0.18, R * 0.08);
    tabGroup.add(lever);

    // 4c. Pull Ring Handle (finger aperture)
    const ringGeom = new THREE.TorusGeometry(R * 0.13, 0.75, 12, 32);
    const ring = new THREE.Mesh(ringGeom, tabMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.25, R * 0.24);
    tabGroup.add(ring);

    // 4d. Opening Score Impression (opening aperture deboss)
    const mouthGeom = new THREE.CylinderGeometry(R * 0.15, R * 0.15, 0.2, 32);
    mouthGeom.scale(1, 1, 0.75);
    const mouth = new THREE.Mesh(mouthGeom, aluMat);
    mouth.position.set(0, 0.05, -R * 0.24);
    tabGroup.add(mouth);

    group.add(tabGroup);

    // 5. Bottom Chime Taper (outer neck-in bevel)
    const botRatio = D <= 54 ? 0.86 : D <= 60 ? 0.84 : 0.82;
    const R_base = R * botRatio;

    const botChimeGeom = new THREE.CylinderGeometry(R, R_base, botH, 64, 1, true);
    const botChime = new THREE.Mesh(botChimeGeom, aluMat);
    botChime.position.y = -H / 2 + botH / 2;
    group.add(botChime);

    // 6. Bottom Stand Ring (contact rim)
    const standRingGeom = new THREE.CylinderGeometry(R_base, R_base, 0.8, 64, 1, true);
    const standRing = new THREE.Mesh(standRingGeom, aluMat);
    standRing.position.y = -H / 2 + 0.4;
    group.add(standRing);

    // 7. Inward Concave High-Pressure Dome
    const domeH = Math.min(5.5, botH * 0.65);
    const domeGeom = new THREE.CylinderGeometry(R_base * 0.15, R_base * 0.90, domeH, 48, 1, true);
    const botDome = new THREE.Mesh(domeGeom, aluMat);
    botDome.position.y = -H / 2 + domeH / 2;
    group.add(botDome);

    const domeApexGeom = new THREE.CylinderGeometry(R_base * 0.15, R_base * 0.15, 0.4, 32);
    const domeApex = new THREE.Mesh(domeApexGeom, aluMat);
    domeApex.position.y = -H / 2 + domeH;
    group.add(domeApex);
  }

  return group;
}
