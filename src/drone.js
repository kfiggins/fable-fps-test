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
    // scrap-bought evolutions (reset each run via clear())
    this.fireRateMult = 1;
    this.twin = false;
    this.repair = false;
    this.heal = null; // set by main: (amount) => {}
    // scrap collector drone (untargetable, just gathers)
    this.collector = null;
    this.collectorSpeed = 4.5;
  }

  addCollector() {
    if (this.collector) return false;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.16, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x8a6410, roughness: 0.4, metalness: 0.6 })
    );
    const claw = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.28, 6),
      new THREE.MeshStandardMaterial({ color: 0xffc94d, emissive: 0x5a4008, roughness: 0.35, metalness: 0.6 })
    );
    claw.rotation.x = Math.PI;
    claw.position.y = -0.2;
    group.add(body, claw);
    const rotors = [];
    for (const [rx, rz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const rotor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.015, 8),
        new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 })
      );
      rotor.position.set(rx * 0.2, 0.1, rz * 0.2);
      group.add(rotor);
      rotors.push(rotor);
    }
    this.scene.add(group);
    this.collector = { group, rotors, t: 0 };
    return true;
  }

  // wanders to the nearest scrap pickup and hoovers it up
  updateCollector(dt, player, pickups, onCollect) {
    const c = this.collector;
    if (!c) return;
    c.t += dt;
    for (const r of c.rotors) r.rotation.y += dt * 26;

    let target = null;
    let bestD = Infinity;
    for (const p of pickups) {
      if (p.type !== 'scrap') continue;
      const d = c.group.position.distanceTo(p.mesh.position);
      if (d < bestD) {
        bestD = d;
        target = p;
      }
    }
    if (target) {
      _desired.copy(target.mesh.position);
      _desired.y += 0.55;
    } else {
      // idle: trail behind the player
      _desired.set(
        player.position.x - 2.2,
        player.position.y + 1.4 + Math.sin(c.t * 2.5) * 0.2,
        player.position.z - 2.2
      );
    }
    _dir.copy(_desired).sub(c.group.position);
    const d = _dir.length();
    if (d > 0.05) {
      c.group.position.addScaledVector(
        _dir.divideScalar(d),
        Math.min(d, this.collectorSpeed * dt)
      );
    }
    c.group.rotation.y += dt * 1.2;
    if (target && c.group.position.distanceTo(target.mesh.position) < 1.1) {
      onCollect(target);
    }
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
    this.fireRateMult = 1;
    this.twin = false;
    this.repair = false;
    if (this.collector) {
      this.scene.remove(this.collector.group);
      this.collector.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.collector = null;
    this.collectorSpeed = 4.5;
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

      // repair module: each drone slowly patches you up
      if (this.repair && this.heal && player.health < player.maxHealth) {
        this.heal(2.5 * dt);
      }

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
        d.shootTimer = FIRE_INTERVAL / this.fireRateMult;
        _target.copy(best.group.position);
        _target.y += 0.9 * best.cfg.scale;
        d.group.lookAt(_target);
        this.effects.tracer(d.group.position, _target, 0x7fe7ff);
        this.effects.spark(_target, 0x7fe7ff);
        this.sounds.droneShot();
        dealDamage(best, DAMAGE, 'body', { source: 'drone' });
        if (this.twin) {
          _desired.copy(d.group.position);
          _desired.y -= 0.25;
          this.effects.tracer(_desired, _target, 0x7fe7ff);
          dealDamage(best, DAMAGE, 'body', { source: 'drone', depth: 1 });
        }
      } else {
        d.shootTimer = 0.3;
      }
    }
  }
}
