import * as THREE from 'three';

const PICKUP_RADIUS = 1.8;
const THROW_SPEED = 17;
const FUSE = 2.5;
const GRAVITY = 22;

const _dir = new THREE.Vector3();

// Grenade pickups dropped by enemies + live thrown grenades.
export class GrenadeManager {
  constructor(scene, effects, sounds) {
    this.scene = scene;
    this.effects = effects;
    this.sounds = sounds;
    this.pickups = [];
    this.live = [];
    this.pickupGeo = new THREE.IcosahedronGeometry(0.24, 0);
    this.pickupMat = new THREE.MeshStandardMaterial({
      color: 0x3dd68c,
      emissive: 0x1a7a4c,
      roughness: 0.4,
    });
    this.liveGeo = new THREE.SphereGeometry(0.13, 10, 8);
    this.liveMat = new THREE.MeshStandardMaterial({
      color: 0x2a3130,
      emissive: 0xff5533,
      emissiveIntensity: 0.6,
      roughness: 0.5,
    });
  }

  clear() {
    for (const p of this.pickups) this.scene.remove(p.mesh);
    for (const g of this.live) this.scene.remove(g.mesh);
    this.pickups = [];
    this.live = [];
  }

  spawnPickup(pos) {
    const mesh = new THREE.Mesh(this.pickupGeo, this.pickupMat);
    mesh.position.set(pos.x, 0.5, pos.z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, t: Math.random() * 10 });
  }

  throwFrom(camera) {
    const mesh = new THREE.Mesh(this.liveGeo, this.liveMat);
    camera.getWorldPosition(mesh.position);
    camera.getWorldDirection(_dir);
    mesh.position.addScaledVector(_dir, 0.6);
    mesh.position.y -= 0.15;
    const vel = _dir.clone().multiplyScalar(THROW_SPEED);
    vel.y += 4.5;
    this.scene.add(mesh);
    this.live.push({ mesh, vel, fuse: FUSE });
  }

  // onPickup() -> return true if the player had room to take it
  // onExplode(position)
  update(dt, playerPos, obstacleBoxes, onPickup, onExplode) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.mesh.rotation.y += dt * 2.2;
      p.mesh.position.y = 0.5 + Math.sin(p.t * 3) * 0.12;
      const dx = p.mesh.position.x - playerPos.x;
      const dz = p.mesh.position.z - playerPos.z;
      if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS && playerPos.y < 4) {
        if (onPickup()) {
          this.scene.remove(p.mesh);
          this.pickups.splice(i, 1);
        }
      }
    }

    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      g.mesh.rotation.x += dt * 8;

      let boom = g.fuse <= 0 || g.mesh.position.y <= 0.12;
      if (!boom) {
        for (const b of obstacleBoxes) {
          if (b.containsPoint(g.mesh.position)) {
            boom = true;
            break;
          }
        }
      }
      if (boom) {
        g.mesh.position.y = Math.max(0.3, g.mesh.position.y);
        onExplode(g.mesh.position.clone());
        this.scene.remove(g.mesh);
        this.live.splice(i, 1);
      }
    }
  }
}
