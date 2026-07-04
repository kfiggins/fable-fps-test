import * as THREE from 'three';

export const ARENA_HALF = 45;
const WALL_HEIGHT = 6;
const EYE = 1.7;

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

  const solids = [];
  const occluders = [];
  const obstacleBoxes = [];
  const coverSpots = [];

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
  const bldgMat = new THREE.MeshStandardMaterial({ color: 0x9c9482, roughness: 0.85 });

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

  // ---- towers ----
  const TOWER_H = 4;
  const TOWER_W = 5;
  const towers = [];
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

    const p = TOWER_H + 0.4;
    const half = TOWER_W / 2;
    if (!(dirX === 1)) addBox(tx + half - 0.175, p, tz, 0.35, 0.8, TOWER_W, towerMat);
    if (!(dirX === -1)) addBox(tx - half + 0.175, p, tz, 0.35, 0.8, TOWER_W, towerMat);
    if (!(dirZ === 1)) addBox(tx, p, tz + half - 0.175, TOWER_W, 0.8, 0.35, towerMat);
    if (!(dirZ === -1)) addBox(tx, p, tz - half + 0.175, TOWER_W, 0.8, 0.35, towerMat);

    const postOff = half - 0.45;
    const postH = 2.4;
    for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      addBox(tx + px * postOff, TOWER_H + postH / 2, tz + pz * postOff, 0.7, postH, 0.7, towerMat);
    }
    addBox(tx - dirX * postOff, TOWER_H + postH / 2, tz - dirZ * postOff, 0.7, postH, 0.7, towerMat);

    towers.push({
      x: tx, z: tz, dirX, dirZ,
      route: [
        new THREE.Vector3(tx + dirX * 8.5, 0, tz + dirZ * 8.5),    // stair foot (aligned)
        new THREE.Vector3(tx + dirX * 5.3, 1.75, tz + dirZ * 5.3), // mid stairs
        new THREE.Vector3(tx + dirX * 1.8, 4, tz + dirZ * 1.8),    // platform edge
        new THREE.Vector3(tx, 4, tz),                               // center
      ],
    });
  }
  addTower(-28, -28, 1, 0);
  addTower(30, -14, -1, 0);
  addTower(-4, 30, 0, -1);

  // ---- central building: 3 floors + roof, interior stairs, windows ----
  const BH = 3.2;   // per-floor height
  const BHALF = 5;  // footprint half-size
  const BT = 0.35;  // wall thickness
  {
    const sideDefs = [
      { axis: 'z', pos: -BHALF + BT / 2 },
      { axis: 'z', pos: BHALF - BT / 2 }, // south — ground-floor door
      { axis: 'x', pos: -BHALF + BT / 2 },
      { axis: 'x', pos: BHALF - BT / 2 },
    ];
    for (let f = 0; f < 3; f++) {
      const base = f * BH;
      for (let si = 0; si < 4; si++) {
        const s = sideDefs[si];
        const isDoor = f === 0 && si === 1;
        const openW = isDoor ? 2.4 : 3;
        const postLen = (2 * BHALF - openW) / 2;
        for (const sign of [-1, 1]) {
          const c = sign * (BHALF - postLen / 2);
          if (s.axis === 'z') addBox(c, base + BH / 2, s.pos, postLen, BH, BT, bldgMat);
          else addBox(s.pos, base + BH / 2, c, BT, BH, postLen, bldgMat);
        }
        // header above the opening; window walls also get a sill below
        if (s.axis === 'z') {
          addBox(0, base + (BH + 2.2) / 2, s.pos, openW, BH - 2.2, BT, bldgMat);
          if (!isDoor) addBox(0, base + 0.55, s.pos, openW, 1.1, BT, bldgMat);
        } else {
          addBox(s.pos, base + (BH + 2.2) / 2, 0, BT, BH - 2.2, openW, bldgMat);
          if (!isDoor) addBox(s.pos, base + 0.55, 0, BT, 1.1, openW, bldgMat);
        }
      }
    }

    // floor slabs + roof, each with a stairwell opening over its flight
    const slabT = 0.35;
    const slabDefs = [
      { top: BH, side: 1 },
      { top: 2 * BH, side: -1 },
      { top: 3 * BH, side: 1 },
    ];
    for (const sl of slabDefs) {
      const y = sl.top - slabT / 2;
      // main slab covers everything except the stair strip
      const mainMinX = sl.side === 1 ? -4.8 : -3.1;
      const mainMaxX = sl.side === 1 ? 3.1 : 4.8;
      addBox((mainMinX + mainMaxX) / 2, y, 0, mainMaxX - mainMinX, slabT, 9.6, bldgMat);
      // landing strip: only the far end of the stair strip is solid
      const stripX = sl.side === 1 ? 3.95 : -3.95;
      addBox(stripX, y, 3.15, 1.7, slabT, 3.3, bldgMat);
    }

    // stair flights: 6 steps, 0.5 rise / 0.9 run, hugging alternating walls
    const flightDefs = [
      { x: 3.9, base: 0 },
      { x: -3.9, base: BH },
      { x: 3.9, base: 2 * BH },
    ];
    for (const fl of flightDefs) {
      for (let i = 0; i < 6; i++) {
        const h = 0.5 * (i + 1);
        addBox(fl.x, fl.base + h / 2, -3.4 + i * 0.9, 1.5, h, 0.9, stepMat);
      }
    }

    // interior lights so the floors aren't pitch black
    for (let f = 0; f < 3; f++) {
      const lamp = new THREE.PointLight(0xffe8c0, 6, 11);
      lamp.position.set(0, f * BH + 2.6, 0);
      scene.add(lamp);
    }

    // roof parapet
    const py = 3 * BH + 0.3;
    addBox(0, py, -BHALF + 0.15, 2 * BHALF, 0.6, 0.3, bldgMat);
    addBox(0, py, BHALF - 0.15, 2 * BHALF, 0.6, 0.3, bldgMat);
    addBox(-BHALF + 0.15, py, 0, 0.3, 0.6, 2 * BHALF, bldgMat);
    addBox(BHALF - 0.15, py, 0, 0.3, 0.6, 2 * BHALF, bldgMat);

    coverSpots.push(
      { point: new THREE.Vector3(6.2, 0, 0), blockCenter: new THREE.Vector3(0, 0, 0) },
      { point: new THREE.Vector3(-6.2, 0, 0), blockCenter: new THREE.Vector3(0, 0, 0) },
      { point: new THREE.Vector3(0, 0, -6.2), blockCenter: new THREE.Vector3(0, 0, 0) }
    );
  }

  // building waypoints for bot routing
  const doorOut = new THREE.Vector3(0, 0, 6.3);
  const doorIn = new THREE.Vector3(0, 0, 3.4);
  // per flight: aligned foot just before step 0, mid-stairs, landing on the strip
  const flights = [
    [new THREE.Vector3(3.9, 0, -3.6), new THREE.Vector3(3.9, 2.0, -0.7), new THREE.Vector3(3.9, 3.2, 2.6)],
    [new THREE.Vector3(-3.9, 3.2, -3.6), new THREE.Vector3(-3.9, 5.2, -0.7), new THREE.Vector3(-3.9, 6.4, 2.6)],
    [new THREE.Vector3(3.9, 6.4, -3.6), new THREE.Vector3(3.9, 8.4, -0.7), new THREE.Vector3(3.9, 9.6, 2.6)],
  ];

  const inBuilding = (x, z) => Math.abs(x) < BHALF + 0.4 && Math.abs(z) < BHALF + 0.4;
  const buildingFloor = (feet) => (feet < 2.6 ? 0 : feet < 5.8 ? 1 : feet < 9 ? 2 : 3);

  function onTowerArea(t, x, z, feet) {
    if (Math.abs(x - t.x) < 3.4 && Math.abs(z - t.z) < 3.4 && feet > 3.3) return true;
    // on the stairs
    const along = (x - t.x) * t.dirX + (z - t.z) * t.dirZ;
    const perp = Math.abs((x - t.x) * t.dirZ - (z - t.z) * t.dirX);
    return along > 2.4 && along < 9 && perp < 1.6 && feet > 0.3;
  }

  // How a ground bot reaches the player. Returns { key, points } or null
  // (null = walk straight at them, the pre-building behavior).
  function routeFor(botPos, playerPos) {
    const pFeet = playerPos.y - EYE;
    const bFeet = botPos.y;

    if (inBuilding(playerPos.x, playerPos.z) || pFeet > 2.6) {
      if (inBuilding(playerPos.x, playerPos.z)) {
        const pFloor = buildingFloor(pFeet);
        const botInside = inBuilding(botPos.x, botPos.z);
        const bFloor = botInside ? buildingFloor(bFeet) : 0;
        if (botInside && bFloor === pFloor) return null;
        const points = [];
        if (!botInside) points.push(doorOut, doorIn);
        if (bFloor < pFloor) {
          for (let f = bFloor; f < pFloor; f++) points.push(...flights[f]);
        } else if (bFloor > pFloor) {
          for (let f = bFloor - 1; f >= pFloor; f--) {
            points.push(flights[f][2], flights[f][1], flights[f][0]);
          }
        }
        if (!points.length) return null;
        return { key: `b${bFloor}>${pFloor}${botInside ? '' : 'o'}`, points };
      }
    }

    for (let i = 0; i < towers.length; i++) {
      const t = towers[i];
      if (onTowerArea(t, playerPos.x, playerPos.z, pFeet)) {
        if (Math.abs(botPos.x - t.x) < 3.4 && Math.abs(botPos.z - t.z) < 3.4 && bFeet > 3.3) {
          return null; // already up there with them
        }
        return { key: `t${i}`, points: t.route };
      }
    }
    return null;
  }

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

  return { solids, occluders, obstacleBoxes, spawnPoints, coverSpots, routeFor, hemi, sun };
}
