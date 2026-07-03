import * as THREE from 'three';

const PICKUP_RADIUS = 1.9;
const THROW_SPEED = 17;
const FUSE = 2.5;
const GRAVITY = 22;

const _dir = new THREE.Vector3();

// Ground pickups (grenades + scrap) and live thrown grenades.
export class GrenadeManager {
  constructor(scene, effects, sounds) {
    this.scene = scene;
    this.effects = effects;
    this.sounds = sounds;
    this.pickups = [];
    this.live = [];
    this.grenadeGeo = new THREE.IcosahedronGeometry(0.24, 0);
    this.grenadeMat = new THREE.MeshStandardMaterial({
      color: 0x3dd68c, emissive: 0x1a7a4c, roughness: 0.4,
    });
    this.scrapGeo = new THREE.OctahedronGeometry(0.22, 0);
    this.scrapMat = new THREE.MeshStandardMaterial({
      color: 0xffc94d, emissive: 0x8a6410, roughness: 0.3, metalness: 0.6,
    });
    this.liveGeo = new THREE.SphereGeometry(0.13, 10, 8);
    this.liveMat = new THREE.MeshStandardMaterial({
      color: 0x2a3130, emissive: 0xff5533, emissiveIntensity: 0.6, roughness: 0.5,
    });
  }

  clear() {
    for (const p of this.pickups) this.scene.remove(p.mesh);
    for (const g of this.live) this.scene.remove(g.mesh);
    this.pickups = [];
    this.live = [];
  }

  spawnPickup(pos, type = 'grenade', value = 0) {
    const mesh = new THREE.Mesh(
      type === 'scrap' ? this.scrapGeo : this.grenadeGeo,
      type === 'scrap' ? this.scrapMat : this.grenadeMat
    );
    const baseY = (pos.y || 0) + 0.5;
    mesh.position.set(pos.x + (Math.random() - 0.5) * 0.8, baseY, pos.z + (Math.random() - 0.5) * 0.8);
    this.scene.add(mesh);
    this.pickups.push({ mesh, baseY, type, value, t: Math.random() * 10 });
  }

  throwFrom(camera, speed = THROW_SPEED) {
    const mesh = new THREE.Mesh(this.liveGeo, this.liveMat);
    camera.getWorldPosition(mesh.position);
    camera.getWorldDirection(_dir);
    mesh.position.addScaledVector(_dir, 0.6);
    mesh.position.y -= 0.15;
    const vel = _dir.clone().multiplyScalar(speed);
    vel.y += 3.5 + speed * 0.08;
    this.scene.add(mesh);
    this.live.push({ mesh, vel, fuse: FUSE, cluster: false });
  }

  // Cluster Bombs legendary: the main blast spawns short-fuse bomblets
  spawnCluster(pos) {
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(this.liveGeo, this.liveMat);
      mesh.position.copy(pos);
      mesh.position.y += 0.3;
      const a = (i / 3) * Math.PI * 2 + Math.random();
      const vel = new THREE.Vector3(Math.cos(a) * 5, 5.5, Math.sin(a) * 5);
      this.scene.add(mesh);
      this.live.push({ mesh, vel, fuse: 1.2, cluster: true, armTime: 0.25 });
    }
  }

  // onPickup(type, value) -> true if collected; onExplode(position, isCluster)
  update(dt, playerPos, playerEye, obstacleBoxes, onPickup, onExplode) {
    const playerFeet = playerPos.y - playerEye;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.mesh.rotation.y += dt * 2.2;
      p.mesh.position.y = p.baseY + Math.sin(p.t * 3) * 0.12;
      const dx = p.mesh.position.x - playerPos.x;
      const dz = p.mesh.position.z - playerPos.z;
      const dy = p.baseY - 0.5 - playerFeet;
      if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS && Math.abs(dy) < 1.6) {
        if (onPickup(p.type, p.value)) {
          this.scene.remove(p.mesh);
          this.pickups.splice(i, 1);
        }
      }
    }

    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.fuse -= dt;
      if (g.armTime) g.armTime -= dt;
      g.vel.y -= GRAVITY * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      g.mesh.rotation.x += dt * 8;

      let boom = g.fuse <= 0 || g.mesh.position.y <= 0.12;
      if (!boom && (!g.armTime || g.armTime <= 0)) {
        for (const b of obstacleBoxes) {
          if (b.containsPoint(g.mesh.position)) {
            boom = true;
            break;
          }
        }
      }
      if (boom) {
        g.mesh.position.y = Math.max(0.3, g.mesh.position.y);
        onExplode(g.mesh.position.clone(), g.cluster);
        this.scene.remove(g.mesh);
        this.live.splice(i, 1);
      }
    }
  }
}
