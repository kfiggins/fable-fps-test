import * as THREE from 'three';
import { deepFreeze } from './util.js';

// Active abilities: acquired through upgrade cards, bound to Q / E.
// Each entry: cooldown + tier; behavior lives in AbilityManager.
export const ABILITIES = {
  healfield: {
    id: 'healfield', name: 'Healing Field', tier: 'uncommon', cd: 20,
    desc: 'Drop a green zone that heals 12/s while you stand in it (8s).',
  },
  grapple: {
    id: 'grapple', name: 'Grapple Claw', tier: 'rare', cd: 3,
    desc: 'Fire a claw where you aim — a fast pull that flings you up over the mark.',
  },
  bubble: {
    id: 'bubble', name: 'Bubble Shield', tier: 'rare', cd: 26,
    desc: 'Deploy a dome that blocks enemy fire until it breaks (200hp, max 8s). You shoot out freely.',
  },
  homing: {
    id: 'homing', name: 'Homing Missile', tier: 'rare', cd: 12,
    desc: 'Launch a missile that dives onto the enemy nearest your crosshair.',
  },
  nova: {
    id: 'nova', name: 'Stasis Nova', tier: 'rare', cd: 30,
    desc: 'Freeze every enemy in place for 8s (bosses 2s).',
  },
  sweeplaser: {
    id: 'sweeplaser', name: 'Sweep Laser', tier: 'legendary', cd: 25,
    desc: 'A laser sweeps your field of view — 130 damage to every enemy in sight.',
  },
  overclock: {
    id: 'overclock', name: 'Overclock', tier: 'legendary', cd: 30,
    desc: '5s: +60% fire rate, instant reloads, +20% move speed.',
  },
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class AbilityManager {
  // ctx: { scene, camera, player, bots, world, effects, sounds,
  //        dealDamage(bot,dmg,part,opts), heal(amount), setInvuln(t), addFeedLine, addShake }
  constructor(ctx) {
    this.ctx = ctx;
    this.slots = { Q: null, E: null };
    this.cds = { Q: 0, E: 0 };
    this.raycaster = new THREE.Raycaster();
    this.grapple = null;
    this.healZone = null;
    this.shield = null;
    this.missiles = [];
    this.laser = null;
    this.decoy = null;
    this.overclock = 0;
  }

  reset() {
    this.slots = { Q: null, E: null };
    this.cds = { Q: 0, E: 0 };
    this.endGrapple();
    this.removeZone('healZone');
    this.removeZone('shield');
    for (const m of this.missiles) this.ctx.scene.remove(m.mesh);
    this.missiles = [];
    if (this.laser?.line) this.ctx.scene.remove(this.laser.line);
    this.laser = null;
    this.removeZone('decoy');
    this.overclock = 0;
  }

  removeZone(key) {
    const z = this[key];
    if (z?.mesh) {
      this.ctx.scene.remove(z.mesh);
      z.mesh.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      if (z.mesh.geometry) z.mesh.geometry.dispose();
      if (z.mesh.material) z.mesh.material.dispose();
    }
    this[key] = null;
  }

  assign(slot, id) {
    this.slots[slot] = id;
    this.cds[slot] = 0;
  }

  hasAbility(id) {
    return this.slots.Q === id || this.slots.E === id;
  }

  overclockActive() {
    return this.overclock > 0;
  }

  shieldInfo() {
    return this.shield
      ? { center: this.shield.center, radius: this.shield.radius }
      : null;
  }

  decoyPos() {
    return this.decoy ? this.decoy.pos : null;
  }

  onShieldHit(dmg, point) {
    if (!this.shield) return;
    this.shield.hp -= dmg;
    this.ctx.effects.spark(point, 0x7fd8ff);
    this.shield.mesh.material.opacity = 0.45;
    // shield reddens as it takes damage so you can see it failing
    const frac = Math.max(0, this.shield.hp / this.shield.maxHp);
    this.shield.mesh.material.color.setRGB(
      0.5 + (1 - frac) * 0.5,
      0.85 * frac + 0.3 * (1 - frac),
      1 * frac + 0.3 * (1 - frac)
    );
    if (this.shield.hp <= 0) {
      this.ctx.effects.explosion(this.shield.center, 0x7fd8ff, 1.2);
      this.ctx.sounds.empty();
      this.removeZone('shield');
      this.ctx.addFeedLine('SHIELD DOWN');
    }
  }

  activate(slot) {
    const id = this.slots[slot];
    if (!id || this.cds[slot] > 0) return false;
    const ok = this[`cast_${id}`]();
    if (ok !== false) this.cds[slot] = ABILITIES[id].cd;
    return ok !== false;
  }

  // ---- casts ----
  cast_healfield() {
    this.removeZone('healZone');
    const { scene, player, sounds } = this.ctx;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 0.6, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x3dd68c, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
      })
    );
    const y = player.position.y - 1.7;
    mesh.position.set(player.position.x, y + 0.3, player.position.z);
    scene.add(mesh);
    this.healZone = { mesh, pos: mesh.position.clone(), baseY: y, t: 8 };
    sounds.heal();
  }

  cast_grapple() {
    const { camera, world } = this.ctx;
    camera.getWorldPosition(_v1);
    camera.getWorldDirection(_v2);
    this.raycaster.set(_v1, _v2);
    this.raycaster.far = 50;
    const hits = this.raycaster.intersectObjects(world.solids, false);
    if (!hits.length) {
      this.ctx.sounds.empty();
      return false; // no anchor — no cooldown
    }
    const anchor = hits[0].point.clone();
    // aim above AND past the mark, so anchoring a wall edge carries you onto the roof
    const past = new THREE.Vector3(anchor.x - _v1.x, 0, anchor.z - _v1.z);
    if (past.lengthSq() > 0.01) past.normalize().multiplyScalar(2.6);
    this.grapple = {
      anchor,
      target: anchor.clone().add(past).add(new THREE.Vector3(0, 2.8, 0)),
      t: 1.8,
      lastD: Infinity,
    };
    this.ctx.sounds.grapple();
  }

  endGrapple() {
    this.grapple = null;
  }

  cast_bubble() {
    this.removeZone('shield');
    const { scene, player, sounds } = this.ctx;
    const center = player.position.clone();
    center.y = player.position.y - 1.7 + 1.6;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(4, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0x7fd8ff, transparent: true, opacity: 0.22,
        emissive: 0x2b5a78, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    mesh.position.copy(center);
    scene.add(mesh);
    this.shield = { mesh, center, radius: 4, hp: 200, maxHp: 200, t: 8 };
    sounds.bubble();
  }

  cast_homing() {
    const { camera, bots, scene, sounds } = this.ctx;
    camera.getWorldPosition(_v1);
    camera.getWorldDirection(_v2);
    let best = null;
    let bestScore = 0.25; // must be roughly in front of you
    for (const b of bots.bots) {
      if (!b.alive) continue;
      const to = b.group.position.clone().sub(_v1);
      const d = to.length();
      if (d > 70) continue;
      const score = to.normalize().dot(_v2) + (b.cfg.boss ? 0.1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (!best) {
      sounds.empty();
      return false;
    }
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.6, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8dde5, emissive: 0xff5533, emissiveIntensity: 0.4 })
    );
    mesh.position.copy(_v1);
    scene.add(mesh);
    this.missiles.push({
      mesh, target: best,
      vel: new THREE.Vector3(0, 16, 0),
      phase: 0.45, life: 6, trail: 0,
    });
    sounds.missileLaunch();
  }

  cast_nova() {
    const { player, bots, effects, sounds, addShake, addFeedLine } = this.ctx;
    const origin = player.position.clone();
    origin.y -= 1.2;
    effects.shockwave(origin, 40, 0x7fd8ff);
    effects.explosion(player.position.clone(), 0x7fd8ff, 1.2);
    addShake(0.6);
    sounds.bubble();
    sounds.shockwave();
    bots.freezeAll(8, 2);
    addFeedLine('STASIS — ENEMIES FROZEN');
  }

  cast_sweeplaser() {
    const { camera, sounds } = this.ctx;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.95 })
    );
    this.ctx.scene.add(line);
    this.laser = {
      t: 0, dur: 1.1, arc: Math.PI * 0.62,
      baseYaw: camera.rotation.y, hit: new Set(), line,
    };
    sounds.laserSweep();
  }

  cast_overclock() {
    this.overclock = 5;
    this.ctx.sounds.overclockUp();
    this.ctx.addFeedLine('OVERCLOCKED');
  }

  // ---- per-frame ----
  update(dt) {
    const { player, camera, bots, effects, heal, dealDamage, sounds, world } = this.ctx;
    this.cds.Q = Math.max(0, this.cds.Q - dt);
    this.cds.E = Math.max(0, this.cds.E - dt);
    this.overclock = Math.max(0, this.overclock - dt);

    if (this.grapple) {
      const g = this.grapple;
      g.t -= dt;
      _v1.copy(g.target).sub(player.position);
      const d = _v1.length();
      // "passed" = we stopped closing on the target (arrived, or geometry stalled us)
      const passed = d > g.lastD + 0.02;
      g.lastD = Math.min(g.lastD, d);
      if (g.t <= 0 || d < 1.6 || passed) {
        // fling past and above the mark so you can steer onto rooftops
        if (d > 0.01) _v1.divideScalar(d);
        player.velocity.set(_v1.x * 14, Math.max(player.velocity.y * 0.25, 0) + 7, _v1.z * 14);
        this.endGrapple();
      } else {
        _v1.divideScalar(d);
        player.velocity.set(_v1.x * 36, _v1.y * 36 + 2.5, _v1.z * 36);
        effects.tracer(player.position.clone().add(new THREE.Vector3(0, -0.3, 0)), g.anchor, 0xd8dde5);
      }
    }

    if (this.healZone) {
      const z = this.healZone;
      z.t -= dt;
      z.mesh.material.opacity = 0.22 + Math.sin(z.t * 6) * 0.08;
      z.mesh.rotation.y += dt * 0.8;
      const dx = player.position.x - z.pos.x;
      const dz = player.position.z - z.pos.z;
      if (dx * dx + dz * dz < 16 && Math.abs(player.position.y - 1.7 - z.baseY) < 2) {
        heal(12 * dt);
      }
      if (z.t <= 0) this.removeZone('healZone');
    }

    if (this.shield) {
      const s = this.shield;
      s.t -= dt;
      s.mesh.material.opacity = Math.max(0.16, s.mesh.material.opacity - dt * 0.8);
      if (s.t <= 0) this.removeZone('shield');
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      m.phase -= dt;
      if (m.phase <= 0 && m.target.alive) {
        _v1.copy(m.target.group.position);
        _v1.y += 0.9 * m.target.cfg.scale;
        _v2.copy(_v1).sub(m.mesh.position).normalize().multiplyScalar(30);
        m.vel.lerp(_v2, Math.min(1, dt * 3.5));
      }
      m.mesh.position.addScaledVector(m.vel, dt);
      m.mesh.lookAt(m.mesh.position.clone().add(m.vel));
      m.mesh.rotateX(Math.PI / 2);
      m.trail -= dt;
      if (m.trail <= 0) {
        m.trail = 0.06;
        effects.spark(m.mesh.position, 0xffaa66);
      }
      let boom = m.life <= 0 || m.mesh.position.y < 0.1;
      if (!boom && m.target.alive) {
        _v1.copy(m.target.group.position);
        _v1.y += 0.9 * m.target.cfg.scale;
        if (m.mesh.position.distanceTo(_v1) < 1.2) boom = true;
      }
      if (!boom) {
        for (const b of world.obstacleBoxes) {
          if (b.containsPoint(m.mesh.position)) {
            boom = true;
            break;
          }
        }
      }
      if (boom) {
        effects.explosion(m.mesh.position, 0xff8833, 1.2);
        sounds.explosionBig();
        for (const b of bots.bots) {
          if (!b.alive) continue;
          _v1.copy(b.group.position);
          _v1.y += 0.9 * b.cfg.scale;
          const d = _v1.distanceTo(m.mesh.position);
          if (d < 3.5) {
            dealDamage(b, d < 1.5 ? 160 : 60, 'body', { source: 'other', depth: 1 });
          }
        }
        this.ctx.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }

    if (this.laser) {
      const L = this.laser;
      L.t += dt;
      const progress = Math.min(1, L.t / L.dur);
      const yaw = L.baseYaw + L.arc / 2 - L.arc * progress;
      camera.getWorldPosition(_v1);
      _v2.set(-Math.sin(yaw), camera.getWorldDirection(new THREE.Vector3()).y * 0.4, -Math.cos(yaw)).normalize();
      this.raycaster.set(_v1, _v2);
      this.raycaster.far = 70;
      const wall = this.raycaster.intersectObjects(world.occluders, false);
      const endD = wall.length ? wall[0].distance : 70;
      const arr = L.line.geometry.attributes.position.array;
      arr[0] = _v1.x; arr[1] = _v1.y - 0.2; arr[2] = _v1.z;
      arr[3] = _v1.x + _v2.x * endD; arr[4] = _v1.y + _v2.y * endD; arr[5] = _v1.z + _v2.z * endD;
      L.line.geometry.attributes.position.needsUpdate = true;

      // damage every enemy the sweep line has passed over (with LOS)
      for (const b of bots.bots) {
        if (!b.alive || L.hit.has(b.id)) continue;
        const relX = b.group.position.x - _v1.x;
        const relZ = b.group.position.z - _v1.z;
        const botYaw = Math.atan2(-relX, -relZ);
        let delta = L.baseYaw + L.arc / 2 - botYaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        if (delta < 0 || delta > L.arc * progress) continue;
        if (Math.hypot(relX, relZ) > 70) continue;
        // line of sight
        _v2.copy(b.group.position);
        _v2.y += 0.9 * b.cfg.scale;
        const dir = _v2.clone().sub(_v1);
        const len = dir.length();
        dir.divideScalar(len);
        this.raycaster.set(_v1, dir);
        this.raycaster.far = len;
        if (this.raycaster.intersectObjects(world.occluders, false).length) continue;
        L.hit.add(b.id);
        effects.spark(_v2, 0xff3355);
        effects.tracer(_v1, _v2, 0xff3355);
        dealDamage(b, 130, 'body', { source: 'other', depth: 1 });
      }
      if (progress >= 1) {
        this.ctx.scene.remove(L.line);
        L.line.geometry.dispose();
        L.line.material.dispose();
        this.laser = null;
      }
    }
  }
}

deepFreeze(ABILITIES);
