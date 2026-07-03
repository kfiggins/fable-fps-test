import * as THREE from 'three';

const RANGE = 40;
const DAMAGE = 15;
const FIRE_INTERVAL = 1.4;
export const DRONE_MAX = 2;

const _desired = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Friendly helper drones (scrap purchase). They hover near the player and
// plink at enemies they can see. Enemies ignore them and can't shoot them.
export class DroneManager {
  constructor(scene, occluders, effects, sounds) {
    this.scene = scene;
    this.occluders = occluders;
    this.effects = effects;
    this.sounds = sounds;
    this.raycaster = new THREE.Raycaster();
    this.drones = [];
    this.angle = 0;
  }

  count() {
    return this.drones.length;
  }

  add() {
    if (this.drones.length >= DRONE_MAX) return false;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.14, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x39424f, roughness: 0.5, metalness: 0.4 })
    );
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.05, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x7fe7ff })
    );
    eye.position.set(0, 0, 0.17);
    group.add(body, eye);
    const rotors = [];
    for (const [rx, rz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const rotor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.015, 8),
        new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 })
      );
      rotor.position.set(rx * 0.19, 0.09, rz * 0.19);
      group.add(rotor);
      rotors.push(rotor);
    }
    this.scene.add(group);
    this.drones.push({
      group, rotors,
      offset: this.drones.length * Math.PI,
      shootTimer: 0.8,
    });
    return true;
  }

  clear() {
    for (const d of this.drones) {
      this.scene.remove(d.group);
      d.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.drones = [];
  }

  update(dt, player, botsList, dealDamage) {
    this.angle += dt * 0.7;
    for (const d of this.drones) {
      const a = this.angle + d.offset;
      _desired.set(
        player.position.x + Math.cos(a) * 1.7,
        player.position.y + 0.7,
        player.position.z + Math.sin(a) * 1.7
      );
      d.group.position.lerp(_desired, Math.min(1, dt * 6));
      for (const r of d.rotors) r.rotation.y += dt * 30;

      d.shootTimer -= dt;
      if (d.shootTimer > 0) continue;

      // nearest visible enemy
      let best = null;
      let bestD = RANGE;
      for (const b of botsList) {
        if (!b.alive) continue;
        const dist = b.group.position.distanceTo(d.group.position);
        if (dist < bestD) {
          _target.copy(b.group.position);
          _target.y += 0.9 * b.cfg.scale;
          _dir.copy(_target).sub(d.group.position);
          const len = _dir.length();
          _dir.divideScalar(len);
          this.raycaster.set(d.group.position, _dir);
          this.raycaster.far = len;
          if (this.raycaster.intersectObjects(this.occluders, false).length === 0) {
            bestD = dist;
            best = b;
          }
        }
      }
      if (best) {
        d.shootTimer = FIRE_INTERVAL;
        _target.copy(best.group.position);
        _target.y += 0.9 * best.cfg.scale;
        d.group.lookAt(_target);
        this.effects.tracer(d.group.position, _target, 0x7fe7ff);
        this.effects.spark(_target, 0x7fe7ff);
        this.sounds.droneShot();
        dealDamage(best, DAMAGE, 'body', { source: 'drone' });
      } else {
        d.shootTimer = 0.3;
      }
    }
  }
}
