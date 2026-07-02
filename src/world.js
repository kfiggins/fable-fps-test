import * as THREE from 'three';

export const ARENA_HALF = 30;
const WALL_HEIGHT = 5;

// Push a position out of any box it overlaps, in the XZ plane only.
// feetY/headY define the vertical span of the thing being collided.
export function collideXZ(pos, radius, feetY, headY, boxes) {
  for (const b of boxes) {
    if (headY <= b.min.y || feetY >= b.max.y) continue;
    const minX = b.min.x - radius;
    const maxX = b.max.x + radius;
    const minZ = b.min.z - radius;
    const maxZ = b.max.z + radius;
    if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) continue;
    const dxMin = pos.x - minX;
    const dxMax = maxX - pos.x;
    const dzMin = pos.z - minZ;
    const dzMax = maxZ - pos.z;
    const m = Math.min(dxMin, dxMax, dzMin, dzMax);
    if (m === dxMin) pos.x = minX;
    else if (m === dxMax) pos.x = maxX;
    else if (m === dzMin) pos.z = minZ;
    else pos.z = maxZ;
  }
}

export function clampToArena(pos, radius) {
  const lim = ARENA_HALF - radius - 0.6;
  pos.x = Math.max(-lim, Math.min(lim, pos.x));
  pos.z = Math.max(-lim, Math.min(lim, pos.z));
}

export function createWorld(scene) {
  scene.background = new THREE.Color(0x8db8d8);
  scene.fog = new THREE.Fog(0x8db8d8, 55, 110);

  const hemi = new THREE.HemisphereLight(0xcfe5f5, 0x4a5240, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sun.position.set(25, 40, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  scene.add(sun);

  const solids = [];        // meshes bullets can hit (floor, walls, cover)
  const occluders = [];     // meshes that block line of sight (walls, cover)
  const obstacleBoxes = []; // Box3 used for movement collision

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0x5d6b4a, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  solids.push(floor);

  const grid = new THREE.GridHelper(ARENA_HALF * 2, 30, 0x4a5540, 0x4a5540);
  grid.position.y = 0.01;
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  scene.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6e7480, roughness: 0.9 });
  const wallDefs = [
    { x: 0, z: -ARENA_HALF, w: ARENA_HALF * 2 + 1, d: 1 },
    { x: 0, z: ARENA_HALF, w: ARENA_HALF * 2 + 1, d: 1 },
    { x: -ARENA_HALF, z: 0, w: 1, d: ARENA_HALF * 2 + 1 },
    { x: ARENA_HALF, z: 0, w: 1, d: ARENA_HALF * 2 + 1 },
  ];
  for (const wd of wallDefs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wd.w, WALL_HEIGHT, wd.d), wallMat);
    wall.position.set(wd.x, WALL_HEIGHT / 2, wd.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    solids.push(wall);
    occluders.push(wall);
    obstacleBoxes.push(new THREE.Box3().setFromObject(wall));
  }

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 0.85 });
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x7d848f, roughness: 0.9 });
  const coverDefs = [
    { x: 0, z: 0, w: 4, h: 2.6, d: 4, mat: blockMat },        // center block
    { x: -12, z: -10, w: 3, h: 1.8, d: 3, mat: crateMat },
    { x: 13, z: -12, w: 2.2, h: 1.6, d: 2.2, mat: crateMat },
    { x: -14, z: 11, w: 2.2, h: 1.6, d: 2.2, mat: crateMat },
    { x: 12, z: 12, w: 3, h: 1.8, d: 3, mat: crateMat },
    { x: 0, z: -18, w: 8, h: 2.2, d: 1.2, mat: blockMat },    // north wall segment
    { x: 0, z: 18, w: 8, h: 2.2, d: 1.2, mat: blockMat },     // south wall segment
    { x: -20, z: 0, w: 1.2, h: 2.2, d: 8, mat: blockMat },    // west wall segment
    { x: 20, z: 0, w: 1.2, h: 2.2, d: 8, mat: blockMat },     // east wall segment
    { x: -7, z: 6, w: 1.8, h: 1.4, d: 1.8, mat: crateMat },
    { x: 7, z: -6, w: 1.8, h: 1.4, d: 1.8, mat: crateMat },
  ];
  for (const cd of coverDefs) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(cd.w, cd.h, cd.d), cd.mat);
    box.position.set(cd.x, cd.h / 2, cd.z);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
    solids.push(box);
    occluders.push(box);
    obstacleBoxes.push(new THREE.Box3().setFromObject(box));
  }

  const spawnPoints = [
    new THREE.Vector3(-24, 0, -24),
    new THREE.Vector3(24, 0, -24),
    new THREE.Vector3(-24, 0, 24),
    new THREE.Vector3(24, 0, 24),
    new THREE.Vector3(0, 0, -25),
    new THREE.Vector3(0, 0, 25),
    new THREE.Vector3(-25, 0, 0),
    new THREE.Vector3(25, 0, 0),
  ];

  return { solids, occluders, obstacleBoxes, spawnPoints };
}
