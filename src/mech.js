import * as THREE from 'three';
import { deepFreeze } from './util.js';

// The 1000-scrap mech. You pilot it in first person: towering eye height,
// dual cannons with no reload, boost jets, and its own Q/E abilities.
// Its health never regenerates — when it dies you're ejected and it's gone.
export const MECH = {
  cost: 1000,
  hp: 1000,
  eye: 4.2, radius: 1.3, step: 1.2, speed: 8.5, jump: 12,
  gun: { dmg: 70, splash: 25, splashR: 2, interval: 0.09 },
  rockets: { n: 6, dmg: 120, radius: 4.5, cd: 18 },
  stomp: { dmg: 180, radius: 14, cd: 9 },
};

export const MECH_ABILITIES = {
  Q: { name: 'ROCKET BARRAGE', cd: MECH.rockets.cd },
  E: { name: 'TITAN STOMP', cd: MECH.stomp.cd },
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class MechManager {
  // ctx: { scene, camera, player, bots, world, effects, sounds,
  //        dealDamage, addShake, addFeedLine, setInvuln, onEnter(), onExit(died) }
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.hp = 0;
    this.maxHp = MECH.hp;
    this.cds = { Q: 0, E: 0 };
    this.rockets = [];
    this.backup = null;
    this.fireCd = 0;
    this.side = 1;
    this.kick = { left: 0, right: 0 };
    this.stepAcc = 0;
    this.raycaster = new THREE.Raycaster();
    this.cannons = this.buildCannons();
  }

  buildCannons() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x39404d, roughness: 0.45, metalness: 0.55 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x1c2027, roughness: 0.5, metalness: 0.4 });
    const make = (x) => {
      const g = new THREE.Group();
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.8), mat);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.9, 12), accent);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.7);
      g.add(housing, barrel);
      g.position.set(x, -0.52, -1.05);
      g.visible = false;
      this.ctx.camera.add(g);
      return g;
    };
    return { left: make(-0.62), right: make(0.62) };
  }

  enter() {
    const { player, bots, sounds, effects, addShake } = this.ctx;
    this.backup = {
      jetpack: { ...player.jetpack },
      canDoubleJump: player.canDoubleJump,
    };
    player.eye = MECH.eye;
    player.radius = MECH.radius;
    player.stepH = MECH.step;
    player.baseSpeed = MECH.speed;
    player.jumpSpeed = MECH.jump;
    player.canSprint = false;
    player.canDoubleJump = false;
    player.position.y += MECH.eye - 1.7;
    player.jetpack = { owned: true, fuel: 0.9, maxFuel: 0.9, thrust: 55 };
    bots.playerEye = MECH.eye;
    bots.playerBodyOffset = 2.0;
    bots.playerHitRadius = 1.9;
    this.hp = this.maxHp;
    this.cds = { Q: 0, E: 0 };
    this.active = true;
    this.cannons.left.visible = true;
    this.cannons.right.visible = true;
    effects.shockwave(new THREE.Vector3(player.position.x, player.position.y - MECH.eye, player.position.z), 6, 0x7fd8ff);
    addShake(1.2);
    sounds.mechUp();
    this.ctx.addFeedLine('MECH ONLINE');
    if (this.ctx.onEnter) this.ctx.onEnter();
  }

  exit(died) {
    const { player, bots, effects, sounds, addShake, setInvuln } = this.ctx;
    player.eye = 1.7;
    player.radius = 0.45;
    player.stepH = 0.55;
    player.baseSpeed = 7;
    player.jumpSpeed = 9;
    player.canSprint = true;
    player.canDoubleJump = this.backup.canDoubleJump;
    player.jetpack = this.backup.jetpack;
    player.position.y -= MECH.eye - 1.7;
    bots.playerEye = 1.7;
    bots.playerBodyOffset = 0.35;
    bots.playerHitRadius = 0.5;
    this.active = false;
    this.cannons.left.visible = false;
    this.cannons.right.visible = false;
    for (const r of this.rockets) this.ctx.scene.remove(r.mesh);
    this.rockets = [];
    if (died) {
      const at = player.position.clone();
      at.y += 1;
      effects.explosion(at, 0xff8833, 2.5);
      effects.debris(at, 0x39404d, 16, 2);
      effects.shockwave(new THREE.Vector3(at.x, player.position.y - 1.7, at.z), 8, 0xff5522);
      sounds.explosionBig();
      addShake(1.6);
      setInvuln(1.5);
      this.ctx.addFeedLine('MECH DESTROYED — EJECTED');
    }
    if (this.ctx.onExit) this.ctx.onExit(died);
  }

  // enemy damage routes here while piloting; true means the mech died
  damage(dmg) {
    if (!this.active) return false;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.exit(true);
      return true;
    }
    return false;
  }

  muzzleWorld(side) {
    _v1.set(0, 0.02, -1.15);
    return this.cannons[side].localToWorld(_v1.clone());
  }

  tryShoot() {
    if (this.fireCd > 0) return;
    const { camera, bots, world, effects, sounds, dealDamage } = this.ctx;
    this.fireCd = MECH.gun.interval;
    const side = this.side > 0 ? 'right' : 'left';
    this.side *= -1;
    this.kick[side] = 1;
    sounds.mechShot();

    camera.updateMatrixWorld(true);
    camera.getWorldPosition(_v1);
    camera.getWorldDirection(_v2);
    this.raycaster.set(_v1, _v2);
    this.raycaster.far = 200;
    const hits = this.raycaster.intersectObjects([...bots.getTargets(), ...world.solids], false);
    const end = _v1.clone().addScaledVector(_v2, 150);
    let struckBot = null;
    let part = 'body';
    if (hits.length) {
      end.copy(hits[0].point);
      const ud = hits[0].object.userData;
      if (ud && ud.bot) {
        struckBot = ud.bot;
        part = ud.part;
      }
    }
    if (struckBot) {
      effects.spark(end, 0xffcc66);
      dealDamage(struckBot, MECH.gun.dmg, part, { source: 'mech' });
    } else if (hits.length) {
      effects.spark(end, 0xccc9a8);
    }
    // small splash so crowds melt
    for (const b of bots.bots) {
      if (!b.alive || b === struckBot) continue;
      _v1.copy(b.group.position);
      _v1.y += 0.9 * b.cfg.scale;
      if (_v1.distanceTo(end) < MECH.gun.splashR) {
        dealDamage(b, MECH.gun.splash, 'body', { source: 'mech', depth: 1 });
      }
    }
    effects.tracer(this.muzzleWorld(side), end, 0xffcc66);
    effects.flash(this.muzzleWorld(side));
  }

  cast(slot) {
    if (!this.active || this.cds[slot] > 0) return false;
    const ok = slot === 'Q' ? this.castRockets() : this.castStomp();
    if (ok === false) return false;
    this.cds[slot] = MECH_ABILITIES[slot].cd;
    return true;
  }

  // homing barrage: each rocket locks a DIFFERENT enemy
  castRockets() {
    const { camera, player, bots, sounds } = this.ctx;
    camera.getWorldPosition(_v1);
    const targets = bots.bots
      .filter((b) => b.alive && b.group.position.distanceTo(player.position) < 80)
      .sort(
        (a, b) =>
          a.group.position.distanceTo(player.position) -
          b.group.position.distanceTo(player.position)
      )
      .slice(0, MECH.rockets.n);
    if (!targets.length) {
      sounds.empty();
      return false; // nothing to lock — no cooldown
    }
    for (let i = 0; i < MECH.rockets.n; i++) {
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.65, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8dde5, emissive: 0xff5533, emissiveIntensity: 0.5 })
      );
      mesh.position.copy(_v1);
      mesh.position.y += 0.8;
      mesh.position.x += (Math.random() - 0.5) * 1.6;
      mesh.position.z += (Math.random() - 0.5) * 1.6;
      this.ctx.scene.add(mesh);
      this.rockets.push({
        mesh,
        targetBot: targets[i % targets.length], // round-robin across enemies
        vel: new THREE.Vector3((Math.random() - 0.5) * 8, 12 + Math.random() * 3, (Math.random() - 0.5) * 8),
        phase: 0.35 + i * 0.08,
        life: 7,
        trail: 0,
      });
    }
    sounds.missileLaunch();
  }

  castStomp() {
    const { player, bots, effects, sounds, dealDamage, addShake } = this.ctx;
    const feet = new THREE.Vector3(player.position.x, player.position.y - MECH.eye, player.position.z);
    effects.shockwave(feet, MECH.stomp.radius, 0xffaa44);
    effects.explosion(new THREE.Vector3(feet.x, feet.y + 0.5, feet.z), 0xffaa44, 1.6);
    addShake(1.4);
    sounds.shockwave();
    sounds.explosionBig();
    for (const b of [...bots.bots]) {
      if (!b.alive) continue;
      _v1.copy(b.group.position).sub(feet);
      const vert = Math.abs(_v1.y);
      _v1.y = 0;
      const d = _v1.length();
      if (d > MECH.stomp.radius || vert > 3) continue;
      const died = dealDamage(b, MECH.stomp.dmg, 'body', { source: 'mech', depth: 1 });
      if (!died) {
        _v1.normalize();
        b.group.position.addScaledVector(_v1, 6);
        b.stunTimer = 1.2;
      }
    }
  }

  update(dt) {
    if (!this.active) {
      this.cds.Q = 0;
      this.cds.E = 0;
      return;
    }
    const { player, bots, world, effects, sounds, dealDamage, addShake } = this.ctx;
    this.fireCd -= dt;
    this.cds.Q = Math.max(0, this.cds.Q - dt);
    this.cds.E = Math.max(0, this.cds.E - dt);

    // heavy footsteps
    if (player.onGround && player.horizontalSpeed() > 1) {
      this.stepAcc += dt * player.horizontalSpeed();
      if (this.stepAcc > 5.5) {
        this.stepAcc = 0;
        sounds.mechStep();
        addShake(0.08);
      }
    }

    // cannon recoil + walk sway
    for (const side of ['left', 'right']) {
      this.kick[side] = Math.max(0, this.kick[side] - dt * 10);
      const g = this.cannons[side];
      const sway = Math.sin(performance.now() / 260 + (side === 'left' ? 0 : Math.PI)) *
        0.015 * Math.min(1, player.horizontalSpeed() / 6);
      g.position.y = -0.52 + sway;
      g.position.z = -1.05 + this.kick[side] * 0.12;
    }

    // homing rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      r.phase -= dt;
      const t = r.targetBot;
      if (r.phase <= 0 && t.alive) {
        _v1.copy(t.group.position);
        _v1.y += 0.9 * t.cfg.scale;
        _v1.sub(r.mesh.position).normalize().multiplyScalar(32);
        r.vel.lerp(_v1, Math.min(1, dt * 4.5));
      }
      r.mesh.position.addScaledVector(r.vel, dt);
      r.mesh.lookAt(r.mesh.position.clone().add(r.vel));
      r.mesh.rotateX(Math.PI / 2);
      r.trail -= dt;
      if (r.trail <= 0) {
        r.trail = 0.07;
        effects.spark(r.mesh.position, 0xffaa66);
      }
      let boom = r.life <= 0 || r.mesh.position.y < 0.12;
      if (!boom && t.alive) {
        _v1.copy(t.group.position);
        _v1.y += 0.9 * t.cfg.scale;
        if (r.mesh.position.distanceTo(_v1) < 1.3) boom = true;
      }
      if (!boom && r.phase <= 0) {
        for (const b of world.obstacleBoxes) {
          if (b.containsPoint(r.mesh.position)) {
            boom = true;
            break;
          }
        }
      }
      if (boom) {
        effects.explosion(r.mesh.position, 0xff8833, 1.4);
        sounds.cannon();
        for (const b of bots.bots) {
          if (!b.alive) continue;
          _v1.copy(b.group.position);
          _v1.y += 0.9 * b.cfg.scale;
          const d = _v1.distanceTo(r.mesh.position);
          if (d < MECH.rockets.radius) {
            const dmg = Math.round(MECH.rockets.dmg * (1 - (0.5 * d) / MECH.rockets.radius));
            dealDamage(b, dmg, 'body', { source: 'mech', depth: 1 });
          }
        }
        this.ctx.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.rockets.splice(i, 1);
      }
    }
  }
}

deepFreeze(MECH);
deepFreeze(MECH_ABILITIES);
