import * as THREE from 'three';

export const ARENA_HALF = 45;
const WALL_HEIGHT = 6;
const EYE = 1.7;

// Push a position out of any box it overlaps, in the XZ plane only.
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

// mapId: 'arena' | 'foundry'
export function createWorld(scene, mapId = 'arena') {
  const solids = [];
  const occluders = [];
  const obstacleBoxes = [];
  const coverSpots = [];
  const hazards = []; // { minX, maxX, minZ, maxZ } molten floor rects

  const isFoundry = mapId === 'foundry';

  scene.background = new THREE.Color(isFoundry ? 0x2a2d33 : 0x8db8d8);
  scene.fog = isFoundry
    ? new THREE.Fog(0x2a2d33, 45, 130)
    : new THREE.Fog(0x8db8d8, 70, 170);

  const hemi = new THREE.HemisphereLight(
    isFoundry ? 0x8090a8 : 0xcfe5f5,
    isFoundry ? 0x3a2a1a : 0x4a5240,
    isFoundry ? 0.65 : 0.9
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(isFoundry ? 0xc8d0e0 : 0xfff2d8, isFoundry ? 0.9 : 1.6);
  sun.position.set(35, 55, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isFoundry ? 1024 : 2048, isFoundry ? 1024 : 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 160;
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
    new THREE.MeshStandardMaterial({ color: isFoundry ? 0x3a3d42 : 0x5d6b4a, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  solids.push(floor);

  const grid = new THREE.GridHelper(
    ARENA_HALF * 2, 45,
    isFoundry ? 0x2c2f34 : 0x4a5540,
    isFoundry ? 0x2c2f34 : 0x4a5540
  );
  grid.position.y = 0.01;
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  scene.add(grid);

  function addBox(x, y, z, w, h, d, mat, { cover = false, shadow = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    solids.push(mesh);
    occluders.push(mesh);
    obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
    if (cover && h >= 1.4) {
      const center = new THREE.Vector3(x, 0, z);
      for (const [ox, oz] of [
        [w / 2 + 0.9, 0], [-w / 2 - 0.9, 0], [0, d / 2 + 0.9], [0, -d / 2 - 0.9],
      ]) {
        coverSpots.push({ point: new THREE.Vector3(x + ox, 0, z + oz), blockCenter: center });
      }
    }
    return mesh;
  }

  // outer walls (both maps)
  const wallMat = new THREE.MeshStandardMaterial({
    color: isFoundry ? 0x44474f : 0x6e7480, roughness: 0.9,
  });
  addBox(0, WALL_HEIGHT / 2, -ARENA_HALF, ARENA_HALF * 2 + 1, WALL_HEIGHT, 1, wallMat);
  addBox(0, WALL_HEIGHT / 2, ARENA_HALF, ARENA_HALF * 2 + 1, WALL_HEIGHT, 1, wallMat);
  addBox(-ARENA_HALF, WALL_HEIGHT / 2, 0, 1, WALL_HEIGHT, ARENA_HALF * 2 + 1, wallMat);
  addBox(ARENA_HALF, WALL_HEIGHT / 2, 0, 1, WALL_HEIGHT, ARENA_HALF * 2 + 1, wallMat);

  let routeFor;
  let spawnPoints;
  let playerSpawn;

  if (!isFoundry) {
    // ================= MAP 1: THE ARENA =================
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 0.85 });
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x7d848f, roughness: 0.9 });
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x8a8fa3, roughness: 0.8 });
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x767b8d, roughness: 0.85 });
    const bldgMat = new THREE.MeshStandardMaterial({ color: 0x9c9482, roughness: 0.85 });

    const TOWER_H = 4;
    const TOWER_W = 5;
    const towers = [];
    function addTower(tx, tz, dirX, dirZ) {
      addBox(tx, TOWER_H / 2, tz, TOWER_W, TOWER_H, TOWER_W, towerMat, { cover: true });
      for (let i = 0; i < 7; i++) {
        const top = 3.5 - i * 0.5;
        const dist = TOWER_W / 2 + 0.4 + i * 0.8;
        addBox(
          tx + dirX * dist, top / 2, tz + dirZ * dist,
          dirX !== 0 ? 0.8 : 2.2, top, dirX !== 0 ? 2.2 : 0.8, stepMat
        );
      }
      const p = TOWER_H + 0.4;
      const half = TOWER_W / 2;
      if (!(dirX === 1)) addBox(tx + half - 0.175, p, tz, 0.35, 0.8, TOWER_W, towerMat);
      if (!(dirX === -1)) addBox(tx - half + 0.175, p, tz, 0.35, 0.8, TOWER_W, towerMat);
      if (!(dirZ === 1)) addBox(tx, p, tz + half - 0.175, TOWER_W, 0.8, 0.35, towerMat);
      if (!(dirZ === -1)) addBox(tx, p, tz - half + 0.175, TOWER_W, 0.8, 0.35, towerMat);
      const postOff = half - 0.45;
      for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        addBox(tx + px * postOff, TOWER_H + 1.2, tz + pz * postOff, 0.7, 2.4, 0.7, towerMat);
      }
      addBox(tx - dirX * postOff, TOWER_H + 1.2, tz - dirZ * postOff, 0.7, 2.4, 0.7, towerMat);
      towers.push({
        x: tx, z: tz, dirX, dirZ,
        route: [
          new THREE.Vector3(tx + dirX * 8.5, 0, tz + dirZ * 8.5),
          new THREE.Vector3(tx + dirX * 5.3, 1.75, tz + dirZ * 5.3),
          new THREE.Vector3(tx + dirX * 1.8, 4, tz + dirZ * 1.8),
          new THREE.Vector3(tx, 4, tz),
        ],
      });
    }
    addTower(-28, -28, 1, 0);
    addTower(30, -14, -1, 0);
    addTower(-4, 30, 0, -1);

    // central 3-floor building
    const BH = 3.2;
    const BHALF = 5;
    const BT = 0.35;
    const sideDefs = [
      { axis: 'z', pos: -BHALF + BT / 2 },
      { axis: 'z', pos: BHALF - BT / 2 },
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
        if (s.axis === 'z') {
          addBox(0, base + (BH + 2.2) / 2, s.pos, openW, BH - 2.2, BT, bldgMat);
          if (!isDoor) addBox(0, base + 0.55, s.pos, openW, 1.1, BT, bldgMat);
        } else {
          addBox(s.pos, base + (BH + 2.2) / 2, 0, BT, BH - 2.2, openW, bldgMat);
          if (!isDoor) addBox(s.pos, base + 0.55, 0, BT, 1.1, openW, bldgMat);
        }
      }
    }
    const slabT = 0.35;
    for (const sl of [{ top: BH, side: 1 }, { top: 2 * BH, side: -1 }, { top: 3 * BH, side: 1 }]) {
      const y = sl.top - slabT / 2;
      const mainMinX = sl.side === 1 ? -4.8 : -3.1;
      const mainMaxX = sl.side === 1 ? 3.1 : 4.8;
      addBox((mainMinX + mainMaxX) / 2, y, 0, mainMaxX - mainMinX, slabT, 9.6, bldgMat);
      addBox(sl.side === 1 ? 3.95 : -3.95, y, 3.15, 1.7, slabT, 3.3, bldgMat);
    }
    for (const fl of [{ x: 3.9, base: 0 }, { x: -3.9, base: BH }, { x: 3.9, base: 2 * BH }]) {
      for (let i = 0; i < 6; i++) {
        const h = 0.5 * (i + 1);
        addBox(fl.x, fl.base + h / 2, -3.4 + i * 0.9, 1.5, h, 0.9, stepMat);
      }
    }
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

    const doorOut = new THREE.Vector3(0, 0, 6.3);
    const doorIn = new THREE.Vector3(0, 0, 3.4);
    const flights = [
      [new THREE.Vector3(3.9, 0, -3.6), new THREE.Vector3(3.9, 2.0, -0.7), new THREE.Vector3(3.9, 3.2, 2.6)],
      [new THREE.Vector3(-3.9, 3.2, -3.6), new THREE.Vector3(-3.9, 5.2, -0.7), new THREE.Vector3(-3.9, 6.4, 2.6)],
      [new THREE.Vector3(3.9, 6.4, -3.6), new THREE.Vector3(3.9, 8.4, -0.7), new THREE.Vector3(3.9, 9.6, 2.6)],
    ];
    const inBuilding = (x, z) => Math.abs(x) < BHALF + 0.4 && Math.abs(z) < BHALF + 0.4;
    const buildingFloor = (feet) => (feet < 2.6 ? 0 : feet < 5.8 ? 1 : feet < 9 ? 2 : 3);
    const onTowerArea = (t, x, z, feet) => {
      if (Math.abs(x - t.x) < 3.4 && Math.abs(z - t.z) < 3.4 && feet > 3.3) return true;
      const along = (x - t.x) * t.dirX + (z - t.z) * t.dirZ;
      const perp = Math.abs((x - t.x) * t.dirZ - (z - t.z) * t.dirX);
      return along > 2.4 && along < 9 && perp < 1.6 && feet > 0.3;
    };

    routeFor = function (botPos, playerPos) {
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
          if (Math.abs(botPos.x - t.x) < 3.4 && Math.abs(botPos.z - t.z) < 3.4 && bFeet > 3.3) return null;
          return { key: `t${i}`, points: t.route };
        }
      }
      return null;
    };

    // arena cover + crates
    addBox(0, 1.2, -14, 9, 2.4, 1.2, blockMat, { cover: true });
    addBox(0, 1.2, 14, 9, 2.4, 1.2, blockMat, { cover: true });
    addBox(-16, 1.2, 0, 1.2, 2.4, 9, blockMat, { cover: true });
    addBox(16, 1.2, 0, 1.2, 2.4, 9, blockMat, { cover: true });
    addBox(25, 1.3, 27, 7, 2.6, 1.2, blockMat, { cover: true });
    addBox(-26, 1.3, 12, 1.2, 2.6, 7, blockMat, { cover: true });
    for (const [x, z, h] of [
      [-10, -8, 2], [11, -9, 1.8], [-12, 10, 1.8], [10, 11, 2],
      [-22, 2, 1.6], [22, -4, 1.6], [6, -22, 1.8], [-8, 22, 1.8],
      [24, 18, 2], [-24, -14, 1.8], [14, 24, 1.6], [-18, -20, 1.6],
      [18, -24, 1.8], [-32, 18, 1.8],
    ]) {
      addBox(x, h / 2, z, h + 0.4, h, h + 0.4, crateMat, { cover: true });
    }

    spawnPoints = [
      [-40, -40], [40, -40], [-40, 40], [40, 40], [0, -41], [0, 41],
      [-41, 0], [41, 0], [-40, 20], [40, -20], [20, 40], [-20, -40],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
    playerSpawn = { x: 16, z: 16, yaw: -Math.PI / 4 };
  } else {
    // ================= MAP 2: THE FOUNDRY =================
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x4a4e57, roughness: 0.7, metalness: 0.35 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x6a707c, roughness: 0.6, metalness: 0.4 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x35383f, roughness: 0.8, metalness: 0.3 });
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x565b66, roughness: 0.8 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x5c5346, roughness: 0.85 });
    const moltenMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });

    // rails are decoration: they never block movement (bots chase you anywhere)
    function addRail(x, y, z, w, h, d) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), railMat);
      mesh.position.set(x, y, z);
      scene.add(mesh);
    }

    function addLava(minX, maxX, minZ, maxZ, lightCount) {
      hazards.push({ minX, maxX, minZ, maxZ });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), moltenMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((minX + maxX) / 2, 0.03, (minZ + maxZ) / 2);
      scene.add(mesh);
      solids.push(mesh);
      for (let i = 0; i < lightCount; i++) {
        const lamp = new THREE.PointLight(0xff5a1a, 5, 16);
        lamp.position.set(
          minX + ((i + 0.5) / lightCount) * (maxX - minX),
          1.2,
          minZ + ((i + 0.5) / lightCount) * (maxZ - minZ)
        );
        scene.add(lamp);
      }
    }

    // --- THE CRUCIBLE: central lava pool with a raised island ---
    addLava(-9, 9, -9, 9, 3);
    // island platform (sniper nest surrounded by lava)
    addBox(0, 1.2, 0, 6, 2.4, 6, steelMat, { cover: true });
    // low parapets on the island's north/south edges (visual only)
    addRail(0, 2.7, -2.85, 6, 0.6, 0.3);
    addRail(0, 2.7, 2.85, 6, 0.6, 0.3);
    // stepped bridges east + west across the pool
    for (const s of [1, -1]) {
      addBox(s * 7.75, 0.2, 0, 3.5, 0.4, 2.8, steelMat); // bridge deck
      addBox(s * 5.5, 0.45, 0, 1, 0.9, 2.8, stepMat);
      addBox(s * 4.5, 0.7, 0, 1, 1.4, 2.8, stepMat);
      addBox(s * 3.5, 0.95, 0, 1, 1.9, 2.8, stepMat);
    }

    // --- feeder channels north + south, with bridges ---
    addLava(-2, 2, -45, -9, 3);
    addLava(-2, 2, 9, 45, 3);
    for (const z of [-30, -16, 16, 30]) {
      addBox(0, 0.2, z, 6, 0.4, 4.5, steelMat);
    }

    // --- furnace halls (walk-through, walkable roofs) ---
    const structures = [];
    function addFurnace(cx, cz, stairsDirX) {
      const W = 9, D = 6, H = 4.5, T = 0.4;
      addBox(cx, H / 2, cz - D / 2 + T / 2, W, H, T, darkMat, { cover: true });
      addBox(cx, H / 2, cz + D / 2 - T / 2, W, H, T, darkMat, { cover: true });
      for (const sx of [-1, 1]) {
        const ex = cx + sx * (W / 2 - T / 2);
        const postD = (D - 2.4) / 2;
        addBox(ex, H / 2, cz - D / 2 + postD / 2, T, H, postD, darkMat);
        addBox(ex, H / 2, cz + D / 2 - postD / 2, T, H, postD, darkMat);
        addBox(ex, (H + 2.6) / 2, cz, T, H - 2.6, 2.4, darkMat);
      }
      addBox(cx, H - 0.2, cz, W, 0.4, D, steelMat);
      addRail(cx, H + 0.35, cz - D / 2 + 0.15, W, 0.7, 0.3);
      addRail(cx, H + 0.35, cz + D / 2 - 0.15, W, 0.7, 0.3);
      for (let i = 0; i < 9; i++) {
        const top = 4.5 - i * 0.5;
        addBox(cx + stairsDirX * (W / 2 + 0.45 + i * 0.85), top / 2, cz, 0.85, top, 2.2, stepMat);
      }
      addBox(cx - stairsDirX * 2.5, H + 1.3, cz, 1.2, 2.6, 1.2, darkMat); // chimney
      structures.push({
        kind: 'furnace', x: cx, z: cz,
        route: [
          new THREE.Vector3(cx + stairsDirX * (4.5 + 8.6), 0, cz),
          new THREE.Vector3(cx + stairsDirX * (4.5 + 4.3), 2.25, cz),
          new THREE.Vector3(cx + stairsDirX * 2.5, 4.5, cz),
          new THREE.Vector3(cx, 4.5, cz),
        ],
      });
    }
    addFurnace(-26, -24, -1); // NW hall, stairs toward the west wall
    addFurnace(26, 24, 1);    // SE hall, stairs toward the east wall

    // --- NE overlook platform (catwalk junction) ---
    {
      const px = 26, pz = -24, top = 4.5;
      addBox(px, top - 0.2, pz, 6, 0.4, 6, steelMat);
      for (const [ox, oz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) {
        addBox(px + ox, (top - 0.4) / 2, pz + oz, 0.6, top - 0.4, 0.6, darkMat);
      }
      addRail(px - 2.85, top + 0.35, pz, 0.3, 0.7, 6);
      addRail(px + 2.85, top + 0.35, pz, 0.3, 0.7, 6);
      for (let i = 0; i < 9; i++) {
        const stop = 4.5 - i * 0.5;
        addBox(px, stop / 2, pz - (3 + 0.45 + i * 0.85), 2.2, stop, 0.85, stepMat);
      }
      structures.push({
        kind: 'plat', x: px, z: pz,
        route: [
          new THREE.Vector3(px, 0, pz - 3 - 8.6),
          new THREE.Vector3(px, 2.25, pz - 3 - 4.3),
          new THREE.Vector3(px, 4.5, pz - 1),
          new THREE.Vector3(px, 4.5, pz),
        ],
      });
    }

    // --- straight catwalk circuit at 4.5: NW roof -> NE platform -> SE roof ---
    function addCatwalk(x1, z1, x2, z2) {
      const horizontal = z1 === z2;
      const len = horizontal ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;
      if (horizontal) {
        addBox(cx, 4.32, cz, len, 0.35, 2.2, steelMat, { shadow: false });
        addRail(cx, 4.95, cz - 1.25, len, 0.9, 0.15);
        addRail(cx, 4.95, cz + 1.25, len, 0.9, 0.15);
      } else {
        addBox(cx, 4.32, cz, 2.2, 0.35, len, steelMat, { shadow: false });
        addRail(cx - 1.25, 4.95, cz, 0.15, 0.9, len);
        addRail(cx + 1.25, 4.95, cz, 0.15, 0.9, len);
      }
      // support columns (skip any that would stand in lava)
      const n = Math.max(1, Math.round(len / 8));
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const sx = x1 + (x2 - x1) * t;
        const sz = z1 + (z2 - z1) * t;
        if (hazards.some((h) => sx > h.minX - 0.5 && sx < h.maxX + 0.5 && sz > h.minZ - 0.5 && sz < h.maxZ + 0.5)) continue;
        addBox(sx, 2.07, sz, 0.55, 4.15, 0.55, darkMat);
      }
    }
    addCatwalk(-21.5, -24, 23, -24); // NW roof east edge -> NE platform west edge
    addCatwalk(26, -21, 26, 21);     // NE platform south edge -> SE roof north edge

    // --- SKY TIERS: a grapple playground stacked over the crucible ---
    // floating walkway (no support columns — it's suspended scenery)
    function skyWalk(x1, z1, x2, z2, topY) {
      const horizontal = z1 === z2;
      const len = horizontal ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;
      if (horizontal) {
        addBox(cx, topY - 0.18, cz, len, 0.35, 2.2, steelMat, { shadow: false });
        addRail(cx, topY + 0.45, cz - 1.25, len, 0.9, 0.15);
        addRail(cx, topY + 0.45, cz + 1.25, len, 0.9, 0.15);
      } else {
        addBox(cx, topY - 0.18, cz, 2.2, 0.35, len, steelMat, { shadow: false });
        addRail(cx - 1.25, topY + 0.45, cz, 0.15, 0.9, len);
        addRail(cx + 1.25, topY + 0.45, cz, 0.15, 0.9, len);
      }
    }
    function skyPlatform(px, pz, size, topY) {
      addBox(px, topY - 0.18, pz, size, 0.35, size, steelMat, { shadow: false });
    }

    const H_MID = 11;
    const H_HIGH = 22;
    // mid ring: square loop around the pool
    for (const [cx, cz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
      skyPlatform(cx, cz, 5, H_MID);
    }
    skyWalk(-11.5, -14, 11.5, -14, H_MID);
    skyWalk(-11.5, 14, 11.5, 14, H_MID);
    skyWalk(-14, -11.5, -14, 11.5, H_MID);
    skyWalk(14, -11.5, 14, 11.5, H_MID);
    // high ring: smaller, twice as high — the crown
    for (const [cx, cz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
      skyPlatform(cx, cz, 4, H_HIGH);
    }
    skyWalk(-8, -10, 8, -10, H_HIGH);
    skyWalk(-8, 10, 8, 10, H_HIGH);
    skyWalk(-10, -8, -10, 8, H_HIGH);
    skyWalk(10, -8, 10, 8, H_HIGH);

    // floating stair flights: NE overlook (4.5) -> landing (8.5) -> mid ring corner (11)
    for (let i = 0; i < 8; i++) {
      const top = 5 + i * 0.5;
      addBox(22.5 - i * 0.9, top - 0.2, -24, 0.9, 0.4, 2, stepMat, { shadow: false });
    }
    skyPlatform(14.8, -24, 3, 8.7);
    for (let i = 0; i < 4; i++) {
      const top = 9.2 + i * 0.5;
      addBox(14.4, top - 0.2, -21.2 + i * 1.3, 1.6, 0.4, 1.3, stepMat, { shadow: false });
    }

    // --- mid ring -> high ring switchback (bots can climb all the way) ---
    // flight A: west along z=14 from the SE mid corner, 11.5 -> 16.5
    for (let i = 0; i < 11; i++) {
      const top = 11.5 + i * 0.5;
      addBox(11.2 - i * 1.35, top - 0.2, 14, 1.35, 0.4, 2, stepMat, { shadow: false });
    }
    skyPlatform(-4, 14, 3.2, 16.5); // switchback landing
    // flight B: north along x=-4, 17 -> 22
    for (let i = 0; i < 11; i++) {
      const top = 17 + i * 0.5;
      addBox(-4, top - 0.2, 12.6 - i * 1.9, 2, 0.4, 1.9, stepMat, { shadow: false });
    }
    addBox(-4, 21.8, -8, 2.2, 0.4, 3.4, steelMat, { shadow: false }); // connector onto the high ring

    // --- LAVA FALL: a suspended vat pouring into the crucible ---
    // pylons rise straight out of the lava
    addBox(-4.2, 11.5, -4, 1.2, 23, 1.2, darkMat);
    addBox(4.2, 11.5, -4, 1.2, 23, 1.2, darkMat);
    addBox(0, 24.5, -4, 6, 3, 6, darkMat); // the vat
    // molten surface on top of the vat
    {
      const vatTop = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), moltenMat);
      vatTop.rotation.x = -Math.PI / 2;
      vatTop.position.set(0, 26.05, -4);
      scene.add(vatTop);
      // the fall itself: pure visual, no collision
      const fall = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 23, 1.1),
        new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.92 })
      );
      fall.position.set(0, 11.5, -4);
      scene.add(fall);
      const splash = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), moltenMat);
      splash.rotation.x = -Math.PI / 2;
      splash.position.set(0, 0.06, -4);
      scene.add(splash);
      for (const ly of [8, 19]) {
        const lamp = new THREE.PointLight(0xff5a1a, 6, 16);
        lamp.position.set(0, ly, -4);
        scene.add(lamp);
      }
    }

    // --- SW storage yard: crate maze ---
    for (const [x, z, h] of [
      [-24, 18, 2], [-28, 24, 1.8], [-20, 26, 1.6], [-30, 14, 1.6],
      [-16, 22, 1.8], [-24, 30, 2],
    ]) {
      addBox(x, h / 2, z, h + 0.6, h, h + 0.6, crateMat, { cover: true });
    }
    // machinery scattered with purpose near structures
    for (const [x, z, w, h, d] of [
      [14, -8, 3.4, 2.8, 3], [-14, 8, 3.4, 2.8, 3], [12, 34, 4, 3, 3],
      [-12, -34, 4, 3, 3], [36, 2, 3, 2.6, 4], [-36, -2, 3, 2.6, 4],
    ]) {
      addBox(x, h / 2, z, w, h, d, darkMat, { cover: true });
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 10), steelMat);
      pipe.position.set(x + w / 4, h + 1.1, z);
      pipe.castShadow = true;
      scene.add(pipe);
    }
    // tall cooling chimneys for skyline
    for (const [x, z] of [[-34, -34], [34, 34], [-8, -40], [8, 40]]) {
      addBox(x, 4.5, z, 2, 9, 2, darkMat, { cover: true });
    }

    // island routes: cross a bridge, up the steps
    const islandRoutes = [1, -1].map((s) => [
      new THREE.Vector3(s * 11.5, 0, 0),
      new THREE.Vector3(s * 7.5, 0.4, 0),
      new THREE.Vector3(s * 4.5, 1.4, 0),
      new THREE.Vector3(0, 2.4, 0),
    ]);

    const onStructure = (st, x, z, feet) => {
      if (st.kind === 'furnace') {
        return Math.abs(x - st.x) < 5.4 && Math.abs(z - st.z) < 3.9 && feet > 3.6;
      }
      return Math.abs(x - st.x) < 3.6 && Math.abs(z - st.z) < 3.6 && feet > 3.6;
    };
    // waypoint chains up the sky tiers (bots follow these to evict campers)
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const midRingRoute = [
      V(26, 0, -35.6), V(26, 2.25, -31.3), V(26, 4.5, -25),
      V(18.7, 7.0, -24), V(14.8, 8.7, -24), V(14.4, 10.1, -18.9), V(14, 11, -14),
    ];
    const highRingRoute = [
      ...midRingRoute,
      V(14, 11, 13.5), V(5.5, 13.7, 14), V(-4, 16.5, 14),
      V(-4, 19.3, 3.2), V(-4, 21.9, -8),
    ];

    const onCatwalkArea = (x, z, feet) =>
      feet > 3.6 &&
      ((Math.abs(z + 24) < 1.8 && x > -22 && x < 24) ||
        (Math.abs(x - 26) < 1.8 && z > -22 && z < 22));
    const onIsland = (x, z, feet) => Math.abs(x) < 4 && Math.abs(z) < 4 && feet > 1.6;

    routeFor = function (botPos, playerPos) {
      const pFeet = playerPos.y - EYE;
      if (pFeet < 1.4) return null;
      if (onIsland(playerPos.x, playerPos.z, pFeet)) {
        if (onIsland(botPos.x, botPos.z, botPos.y)) return null;
        const r = botPos.x > 0 ? 0 : 1;
        return { key: `isl${r}`, points: islandRoutes[r] };
      }
      if (pFeet < 3) return null;
      for (let i = 0; i < structures.length; i++) {
        if (onStructure(structures[i], playerPos.x, playerPos.z, pFeet)) {
          if (onStructure(structures[i], botPos.x, botPos.z, botPos.y)) return null;
          return { key: `s${i}`, points: structures[i].route };
        }
      }
      if (pFeet > 17) {
        if (botPos.y > 17) return null;
        return { key: 'skyH', points: highRingRoute };
      }
      if (pFeet > 8.5) {
        if (botPos.y > 8.5) return null;
        return { key: 'skyM', points: midRingRoute };
      }
      if (onCatwalkArea(playerPos.x, playerPos.z, pFeet)) {
        if (botPos.y > 3.6) return null;
        let best = 0;
        let bd = Infinity;
        for (let i = 0; i < structures.length; i++) {
          const d = Math.hypot(botPos.x - structures[i].route[0].x, botPos.z - structures[i].route[0].z);
          if (d < bd) { bd = d; best = i; }
        }
        return { key: `cw${best}`, points: structures[best].route };
      }
      return null;
    };

    spawnPoints = [
      [-40, -40], [40, -40], [-40, 40], [40, 40], [22, -41], [-22, 41],
      [-41, -18], [41, 18], [-40, 30], [40, -30], [14, 41], [-14, -41],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
    playerSpawn = { x: -24, z: 26, yaw: 2.4 };
  }

  return {
    solids, occluders, obstacleBoxes, spawnPoints, coverSpots,
    routeFor, hemi, sun, hazards, playerSpawn, mapId,
  };
}
