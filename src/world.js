import * as THREE from 'three';

export const ARENA_HALF = 45;
const WALL_HEIGHT = 6;

// Push a position out of any box it overlaps, in the XZ plane only.
// feetY/headY define the vertical span of the thing being collided.
// Boxes whose top is within stepHeight of the feet don't block — they
// can be stepped onto instead (see groundHeight).
export function collideXZ(pos, radius, feetY, headY, boxes, stepHeight = 0) {
  for (const b of boxes) {
    if (headY <= b.min.y || feetY >= b.max.y) continue;
    if (b.max.y <= feetY + stepHeight) continue;
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

// Highest box top at this XZ position that is at or below feet + stepHeight.
// 0 means the arena floor.
export function groundHeight(pos, radius, feetY, boxes, stepHeight) {
  let support = 0;
  for (const b of boxes) {
    if (b.max.y > feetY + stepHeight + 0.01) continue;
    if (pos.x < b.min.x - radius || pos.x > b.max.x + radius) continue;
    if (pos.z < b.min.z - radius || pos.z > b.max.z + radius) continue;
    if (b.max.y > support) support = b.max.y;
  }
  return support;
}

export function clampToArena(pos, radius) {
  const lim = ARENA_HALF - radius - 0.6;
  pos.x = Math.max(-lim, Math.min(lim, pos.x));
  pos.z = Math.max(-lim, Math.min(lim, pos.z));
}

export function createWorld(scene) {
  scene.background = new THREE.Color(0x8db8d8);
  scene.fog = new THREE.Fog(0x8db8d8, 70, 170);

  const hemi = new THREE.HemisphereLight(0xcfe5f5, 0x4a5240, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sun.position.set(35, 55, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 160;
  scene.add(sun);

  const solids = [];        // meshes bullets can hit (floor, walls, cover)
  const occluders = [];     // meshes that block line of sight (walls, cover)
  const obstacleBoxes = []; // Box3 used for movement collision
  const coverSpots = [];    // {point, blockCenter} — spots the AI can hide at

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0x5d6b4a, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  solids.push(floor);

  const grid = new THREE.GridHelper(ARENA_HALF * 2, 45, 0x4a5540, 0x4a5540);
  grid.position.y = 0.01;
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  scene.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6e7480, roughness: 0.9 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 0.85 });
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x7d848f, roughness: 0.9 });
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x8a8fa3, roughness: 0.8 });
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x767b8d, roughness: 0.85 });

  function addBox(x, y, z, w, h, d, mat, { cover = false } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    solids.push(mesh);
    occluders.push(mesh);
    obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
    if (cover && h >= 1.4) {
      const center = new THREE.Vector3(x, 0, z);
      const offsets = [
        [w / 2 + 0.9, 0],
        [-w / 2 - 0.9, 0],
        [0, d / 2 + 0.9],
        [0, -d / 2 - 0.9],
      ];
      for (const [ox, oz] of offsets) {
        coverSpots.push({
          point: new THREE.Vector3(x + ox, 0, z + oz),
          blockCenter: center,
        });
      }
    }
    return mesh;
  }

  // outer walls
  addBox(0, WALL_HEIGHT / 2, -ARENA_HALF, ARENA_HALF * 2 + 1, WALL_HEIGHT, 1, wallMat);
  addBox(0, WALL_HEIGHT / 2, ARENA_HALF, ARENA_HALF * 2 + 1, WALL_HEIGHT, 1, wallMat);
  addBox(-ARENA_HALF, WALL_HEIGHT / 2, 0, 1, WALL_HEIGHT, ARENA_HALF * 2 + 1, wallMat);
  addBox(ARENA_HALF, WALL_HEIGHT / 2, 0, 1, WALL_HEIGHT, ARENA_HALF * 2 + 1, wallMat);

  // towers: solid 4m base, 7 steps up (0.5m risers — walkable via step-up),
  // parapets on every side except the stair side
  const TOWER_H = 4;
  const TOWER_W = 5;
  function addTower(tx, tz, dirX, dirZ) {
    addBox(tx, TOWER_H / 2, tz, TOWER_W, TOWER_H, TOWER_W, towerMat, { cover: true });

    for (let i = 0; i < 7; i++) {
      const top = 3.5 - i * 0.5;
      const dist = TOWER_W / 2 + 0.4 + i * 0.8;
      const sx = tx + dirX * dist;
      const sz = tz + dirZ * dist;
      const w = dirX !== 0 ? 0.8 : 2.2;
      const d = dirX !== 0 ? 2.2 : 0.8;
      addBox(sx, top / 2, sz, w, top, d, stepMat);
    }

    // parapets (0.8 high) on the three non-stair sides
    const p = TOWER_H + 0.4;
    const half = TOWER_W / 2;
    if (!(dirX === 1)) addBox(tx + half - 0.175, p, tz, 0.35, 0.8, TOWER_W, towerMat);
    if (!(dirX === -1)) addBox(tx - half + 0.175, p, tz, 0.35, 0.8, TOWER_W, towerMat);
    if (!(dirZ === 1)) addBox(tx, p, tz + half - 0.175, TOWER_W, 0.8, 0.35, towerMat);
    if (!(dirZ === -1)) addBox(tx, p, tz - half + 0.175, TOWER_W, 0.8, 0.35, towerMat);

    // full-height corner posts on the platform — cover to dodge behind up top
    const postOff = half - 0.45;
    const postH = 2.4;
    for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      addBox(tx + px * postOff, TOWER_H + postH / 2, tz + pz * postOff, 0.7, postH, 0.7, towerMat);
    }
    // mid-edge post on the side opposite the stairs for the peek-and-hide spot
    addBox(tx - dirX * postOff, TOWER_H + postH / 2, tz - dirZ * postOff, 0.7, postH, 0.7, towerMat);
  }
  addTower(-28, -28, 1, 0);  // NW tower, stairs facing east
  addTower(30, -14, -1, 0);  // E tower, stairs facing west
  addTower(-4, 30, 0, -1);   // S tower, stairs facing north

  // center block
  addBox(0, 1.5, 0, 5, 3, 5, blockMat, { cover: true });

  // mid-map wall segments
  addBox(0, 1.2, -14, 9, 2.4, 1.2, blockMat, { cover: true });
  addBox(0, 1.2, 14, 9, 2.4, 1.2, blockMat, { cover: true });
  addBox(-16, 1.2, 0, 1.2, 2.4, 9, blockMat, { cover: true });
  addBox(16, 1.2, 0, 1.2, 2.4, 9, blockMat, { cover: true });
  addBox(25, 1.3, 27, 7, 2.6, 1.2, blockMat, { cover: true });
  addBox(-26, 1.3, 12, 1.2, 2.6, 7, blockMat, { cover: true });

  // crates (1.4–2m — the taller ones can be jump-mantled)
  const crates = [
    [-10, -8, 2], [11, -9, 1.8], [-12, 10, 1.8], [10, 11, 2],
    [-22, 2, 1.6], [22, -4, 1.6], [6, -22, 1.8], [-8, 22, 1.8],
    [24, 18, 2], [-24, -14, 1.8], [14, 24, 1.6], [-18, -20, 1.6],
    [18, -24, 1.8], [-32, 18, 1.8],
  ];
  for (const [x, z, h] of crates) {
    addBox(x, h / 2, z, h + 0.4, h, h + 0.4, crateMat, { cover: true });
  }

  const spawnPoints = [
    new THREE.Vector3(-40, 0, -40),
    new THREE.Vector3(40, 0, -40),
    new THREE.Vector3(-40, 0, 40),
    new THREE.Vector3(40, 0, 40),
    new THREE.Vector3(0, 0, -41),
    new THREE.Vector3(0, 0, 41),
    new THREE.Vector3(-41, 0, 0),
    new THREE.Vector3(41, 0, 0),
    new THREE.Vector3(-40, 0, 20),
    new THREE.Vector3(40, 0, -20),
    new THREE.Vector3(20, 0, 40),
    new THREE.Vector3(-20, 0, -40),
  ];

  return { solids, occluders, obstacleBoxes, spawnPoints, coverSpots };
}
