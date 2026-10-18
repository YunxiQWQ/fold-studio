import * as THREE from 'three';
import {BOARD_THICKNESS} from './geometry.js';

export function createPanelGeometry(panel, dieline, cx, cy) {
  const shape = new THREE.Shape(panel.points.map(([x,y]) => new THREE.Vector2(x-cx, -(y-cy))));
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

export function updateCylinderRibbonPositions(geometry, W, H, D, t) {
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const segX = 64, segY = 1;
  const stride = segX + 1;
  const backOffset = (segX + 1) * (segY + 1);
  const R = D / 2;
  const thickness = BOARD_THICKNESS;

  for (let j = 0; j <= segY; j++) {
    const v = j / segY;
    const y = (0.5 - v) * H;
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
  const { diameter: D, height: H } = cylinder;
  const R = D / 2;
  const group = new THREE.Group();
  group.name = 'ContainerAccessories';

  if (type === 'beverage-can') {
    const aluMat = new THREE.MeshStandardMaterial({
      color: 0xd6d8da,
      metalness: 0.9,
      roughness: 0.22,
      name: 'Can_Aluminum',
    });

    const topRimGeom = new THREE.CylinderGeometry(R * 0.94, R, H * 0.045, 48, 1, false);
    const topRim = new THREE.Mesh(topRimGeom, aluMat);
    topRim.position.y = H / 2 - (H * 0.045) / 2;
    group.add(topRim);

    const lidDiscGeom = new THREE.CylinderGeometry(R * 0.93, R * 0.93, 1, 48);
    const lidDisc = new THREE.Mesh(lidDiscGeom, aluMat);
    lidDisc.position.y = H / 2 - 1.2;
    group.add(lidDisc);

    const tabGeom = new THREE.TorusGeometry(R * 0.16, 1.1, 8, 24);
    const tab = new THREE.Mesh(tabGeom, aluMat);
    tab.rotation.x = Math.PI / 2;
    tab.position.set(0, H / 2 - 0.4, R * 0.22);
    group.add(tab);

    const botChimeGeom = new THREE.CylinderGeometry(R, R * 0.88, H * 0.06, 48, 1, false);
    const botChime = new THREE.Mesh(botChimeGeom, aluMat);
    botChime.position.y = -H / 2 + (H * 0.06) / 2;
    group.add(botChime);

    const botDiscGeom = new THREE.CylinderGeometry(R * 0.87, R * 0.87, 1, 48);
    const botDisc = new THREE.Mesh(botDiscGeom, aluMat);
    botDisc.position.y = -H / 2 + 1.2;
    group.add(botDisc);
  } else if (type === 'glass-jar') {
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.92,
      opacity: 1,
      transparent: true,
      roughness: 0.08,
      ior: 1.5,
      thickness: 3.5,
      name: 'Jar_Glass',
    });

    const bodyGlassGeom = new THREE.CylinderGeometry(R * 0.985, R * 0.985, H * 0.96, 48, 1, false);
    const bodyGlass = new THREE.Mesh(bodyGlassGeom, glassMat);
    bodyGlass.position.y = -H * 0.02;
    group.add(bodyGlass);

    const lidMat = new THREE.MeshStandardMaterial({
      color: 0xdfb443,
      metalness: 0.85,
      roughness: 0.25,
      name: 'Jar_Lid_Gold',
    });
    const lidH = Math.max(9, H * 0.12);
    const lidGeom = new THREE.CylinderGeometry(R * 1.015, R * 1.015, lidH, 48);
    const lid = new THREE.Mesh(lidGeom, lidMat);
    lid.position.y = H / 2 - lidH / 2;
    group.add(lid);
  }

  return group;
}
