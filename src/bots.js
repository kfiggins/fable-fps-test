import * as THREE from 'three';
import { collideXZ, groundHeight, clampToArena } from './world.js';
import { deepFreeze } from './util.js';

// Type design: big pro ↔ big con.
//  grunt  — balanced skirmisher; hunts cover when hurt
//  rusher — very fast, small target, brutal melee ↔ dies to a single body shot, no gun
//  tank   — huge HP pool, heavy hits ↔ crawls, giant hitbox, slow fire
//  sniper — long-range laser-telegraphed shots that HURT ↔ one-shot fragile, flees up close
//  warden/titan/butcher/overlord — bosses (waves 5/10/15/20)
export const BOT_TYPES = {
  grunt: {
    hp: 100, speed: 4.4, scale: 1, points: 100, color: 0x3a4160, visor: 0xff2b2b,
    ai: 'skirmish', range: [8, 20], usesCover: true, scalesHp: true,
    burst: { n: 3, gap: 0.13, dmg: [6, 10], spread: 0.035, interval: [1.6, 2.8] },
  },
  rusher: {
    hp: 30, speed: 7.8, scale: 0.7, points: 150, color: 0xd45500, visor: 0xffe14d,
    ai: 'rush', spike: true,
    melee: { dmg: 14, range: 2.4, cd: 1.0 },
  },
  tank: {
    hp: 240, speed: 2.0, scale: 1.5, points: 300, color: 0x3c5a3c, visor: 0xff9030,
    ai: 'skirmish', range: [10, 24], wide: true, scalesHp: true,
    burst: { n: 1, gap: 0, dmg: [16, 22], spread: 0.055, interval: [2.6, 3.4], heavy: true },
  },
  sniper: {
    hp: 30, speed: 3.4, scale: 1, points: 200, color: 0x6fc9d8, visor: 0x2bffe0,
    ai: 'sniper', longRifle: true,
    aimed: { dmg: 28, telegraph: 1.3, lockTime: 0.3, interval: [3.2, 4.4] },
  },
  warden: {
    hp: 2200, speed: 2.4, scale: 2.2, points: 2000, color: 0x8a1f2d, visor: 0xffd24d,
    ai: 'skirmish', range: [7, 16], wide: true, boss: true, name: 'THE WARDEN',
    burst: { n: 6, gap: 0.09, dmg: [6, 9], spread: 0.05, interval: [2.8, 3.6] },
    shock: { dmg: 30, radius: 7, trigger: 5.5, cd: 4.5 },
    summon: { types: ['rusher', 'rusher'], cd: 12, max: 4 },
    orbs: { n: 3, spread: 0.3, speed: 9, dmg: 25, interval: [5, 7] },
  },
  titan: {
    hp: 5200, speed: 2.6, scale: 3, points: 5000, color: 0x2a1136, visor: 0xff3df0,
    ai: 'skirmish', range: [8, 18], wide: true, boss: true, name: 'THE TITAN',
    burst: { n: 8, gap: 0.09, dmg: [7, 10], spread: 0.05, interval: [2.6, 3.4] },
    shock: { dmg: 40, radius: 8, trigger: 6.5, cd: 4 },
    summon: { types: ['rusher', 'rusher', 'sniper'], cd: 14, max: 5 },
    aimed: { dmg: 40, telegraph: 1.1, lockTime: 0.3, interval: [8, 10] },
    orbs: { n: 5, spread: 0.5, speed: 10, dmg: 25, interval: [4.5, 6.5] },
    missiles: { n: 2, dmg: 30, radius: 3, interval: [9, 12] },
  },
  butcher: {
    hp: 9200, speed: 4.2, scale: 2.4, points: 7000, color: 0x7a1500, visor: 0xff4444,
    ai: 'skirmish', range: [3, 9], wide: true, spike: true, boss: true, name: 'THE BUTCHER',
    burst: { n: 8, gap: 0.09, dmg: [8, 11], spread: 0.05, interval: [2.4, 3] },
    melee: { dmg: 22, range: 3.4, cd: 1.2 },
    shock: { dmg: 35, radius: 8, trigger: 6, cd: 3.5 },
    summon: { types: ['rusher', 'rusher', 'rusher'], cd: 10, max: 6 },
    artillery: { n: 3, dmg: 40, radius: 4.5, telegraph: 1.6, interval: [8, 11] },
    enrage: { below: 0.4, speed: 1.4, rate: 1.5 },
  },
  overlord: {
    hp: 17000, speed: 2.8, scale: 3.6, points: 15000, color: 0x2b2005, visor: 0xffcc00,
    ai: 'skirmish', range: [8, 18], wide: true, boss: true, name: 'THE OVERLORD',
    burst: { n: 10, gap: 0.08, dmg: [8, 12], spread: 0.05, interval: [2.2, 3] },
    shock: { dmg: 45, radius: 9, trigger: 7, cd: 3 },
    summon: { types: ['rusher', 'sniper', 'tank'], cd: 12, max: 6 },
    aimed: { dmg: 50, telegraph: 0.9, lockTime: 0.3, interval: [6, 8] },
    orbs: { n: 6, spread: 0.55, speed: 10.5, dmg: 28, interval: [4.5, 6.5] },
    missiles: { n: 2, dmg: 35, radius: 3.5, interval: [8, 11] },
    artillery: { n: 4, dmg: 45, radius: 5, telegraph: 1.6, interval: [9, 12] },
    enrage: { below: 0.35, speed: 1.5, rate: 1.6 },
  },
  phantom: {
    hp: 21000, speed: 3.6, scale: 2, points: 30000, color: 0x3d4d5c, visor: 0x9fefff,
    ai: 'skirmish', range: [10, 22], boss: true, name: 'THE PHANTOM',
    burst: { n: 5, gap: 0.09, dmg: [8, 11], spread: 0.045, interval: [2.4, 3.2] },
    aimed: { dmg: 45, telegraph: 0.8, lockTime: 0.25, interval: [5, 7] },
    orbs: { n: 7, spread: 0.55, speed: 11, dmg: 28, interval: [4, 6] },
    summon: { types: ['sniper', 'rusher', 'rusher'], cd: 12, max: 5 },
    teleport: { interval: [5, 8], range: [9, 17] },
    enrage: { below: 0.35, speed: 1.3, rate: 1.4 },
  },
  apex: {
    hp: 32000, speed: 2.4, scale: 4, points: 60000, color: 0x101418, visor: 0xff2222,
    ai: 'skirmish', range: [9, 20], wide: true, boss: true, name: 'THE APEX',
    burst: { n: 12, gap: 0.07, dmg: [9, 13], spread: 0.05, interval: [2.2, 3] },
    shock: { dmg: 50, radius: 10, trigger: 8, cd: 3 },
    summon: { types: ['tank', 'sniper', 'rusher', 'rusher'], cd: 10, max: 8 },
    aimed: { dmg: 55, telegraph: 0.85, lockTime: 0.3, interval: [6, 8] },
    orbs: { n: 8, spread: 0.55, speed: 11, dmg: 30, interval: [4, 6] },
    missiles: { n: 3, dmg: 35, radius: 3.5, interval: [7, 10] },
    artillery: { n: 5, dmg: 50, radius: 5, telegraph: 1.6, interval: [8, 11] },
    enrage: { below: 0.45, speed: 1.35, rate: 1.5 },
  },
};

const SHOOT_RANGE = 55;
const PLAYER_HIT_RADIUS = 0.5;
const GRAVITY = 26;
const STEP_HEIGHT = 0.55;

const _toPlayer = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _end = new THREE.Vector3();
const _v = new THREE.Vector3();

let botId = 0;

class Bot {
  constructor(scene, type) {
    this.id = botId++;
    this.type = type;
    this.cfg = BOT_TYPES[type];
    const cfg = this.cfg;

    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 6, 12), bodyMat);
    body.position.y = 0.85;
    body.castShadow = true;
    if (cfg.wide) body.scale.x = 1.4;

    const headMat = bodyMat.clone();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), headMat);
    head.position.y = 1.62;
    head.castShadow = true;

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.09, 0.1),
      new THREE.MeshBasicMaterial({ color: cfg.visor })
    );
    visor.position.set(0, 1.64, 0.24);
    this.group.add(body, head, visor);

    if (cfg.spike) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a3300, roughness: 0.6 })
      );
      spike.position.y = 2.05;
      this.group.add(spike);
    } else {
      const rifleLen = cfg.longRifle ? 1.4 : 0.7;
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.longRifle ? 0.09 : 0.12, 0.14, rifleLen),
        new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.5 })
      );
      gun.position.set(0.32, 1.05, 0.35);
      this.group.add(gun);
    }

    body.userData = { bot: this, part: 'body' };
    head.userData = { bot: this, part: 'head' };
    this.group.scale.setScalar(cfg.scale);
    scene.add(this.group);

    this.body = body;
    this.flashMats = [bodyMat, headMat];
    this.targets = [body, head];
    this.radius = 0.45 * cfg.scale;

    this.alive = true;
    this.health = cfg.hp;
    this.maxHealth = cfg.hp;
    this.isMinion = false;
    this.enraged = false;

    this.time = Math.random() * 10;
    this.hitFlash = 0;
    this.meleePulse = 0;
    this.vy = 0;

    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.state = 'engage';
    this.coverTarget = null;
    this.coverWait = 0;
    this.coverCooldown = 0;

    this.routeKey = null;
    this.routeProgress = 0;
    this.stuckTimer = 0;
    this.lastRouteX = null;
    this.lastRouteZ = null;

    this.hasLOS = false;
    this.losTimer = Math.random() * 0.25;
    this.noLOSTime = 0;

    this.shootTimer = 1.2 + Math.random() * 1.2;
    this.burstLeft = 0;
    this.burstGap = 0;
    this.meleeTimer = 0;

    this.aimState = null;
    this.laser = null;
    this.shockTimer = 2;
    this.summonTimer = 6;
    this.orbTimer = 3;
    this.missileTimer = 6;
    this.artilleryTimer = 5;
    this.teleTimer = 4;
    this.stunTimer = 0;
  }
}

export class BotManager {
  constructor(scene, world, effects, sounds) {
    this.scene = scene;
    this.effects = effects;
    this.sounds = sounds;
    this.occluders = world.occluders;
    this.boxes = world.obstacleBoxes;
    this.spawnPoints = world.spawnPoints;
    this.coverSpots = world.coverSpots;
    this.routeFor = world.routeFor;
    this.raycaster = new THREE.Raycaster();
    this.onPlayerHit = null; // (damage, kind, sourceBot) => {}
    this.onBossEnraged = null;
    this.bots = [];
    this.spawnQueue = [];
    this.spawnDelay = 0;
    this.boss = null;
    this.waveNum = 1;
    this.speedScale = 1; // Time Dilation upgrade
    this.projectiles = []; // boss orbs + missiles
    this.strikes = []; // artillery telegraphs
    this.shield = null; // player Bubble Shield: { center, radius }
    this.decoyPos = null; // player Decoy: bots aim here instead
    this.onShieldHit = null; // (dmg, point) => {}
    // player target profile — grows while piloting the mech
    this.playerEye = 1.7;
    this.playerBodyOffset = 0.35;
    this.playerHitRadius = 0.5;
  }

  hpMult() {
    return 1 + (this.waveNum - 1) * 0.04;
  }

  dmgMult() {
    return 1 + (this.waveNum - 1) * 0.03;
  }

  get waveDone() {
    return this.spawnQueue.length === 0 && this.bots.every((b) => !b.alive);
  }

  aliveCount() {
    return this.bots.filter((b) => b.alive).length + this.spawnQueue.length;
  }

  minionCount() {
    return this.bots.filter((b) => b.alive && b.isMinion).length;
  }

  clearAll() {
    for (const bot of this.bots) this.removeBot(bot);
    this.bots = [];
    this.spawnQueue = [];
    this.boss = null;
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    for (const s of this.strikes) this.scene.remove(s.ring);
    this.strikes = [];
  }

  startWave(spec, playerPos) {
    this.clearAll();
    this.spawnQueue = [...spec];
    this.spawnDelay = 0;
  }

  removeBot(bot) {
    this.scene.remove(bot.group);
    bot.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.clearLaser(bot);
  }

  clearLaser(bot) {
    if (bot.laser) {
      this.scene.remove(bot.laser);
      bot.laser.geometry.dispose();
      bot.laser.material.dispose();
      bot.laser = null;
    }
  }

  spawnBot(type, atPos, playerPos, isMinion = false) {
    const bot = new Bot(this.scene, type);
    bot.isMinion = isMinion;
    if (bot.cfg.scalesHp) {
      bot.maxHealth = Math.round(bot.cfg.hp * this.hpMult());
      bot.health = bot.maxHealth;
    }
    if (atPos) {
      bot.group.position.set(
        atPos.x + (Math.random() - 0.5) * 3,
        0,
        atPos.z + (Math.random() - 0.5) * 3
      );
      clampToArena(bot.group.position, bot.radius);
    } else {
      const far = this.spawnPoints.filter((p) => p.distanceTo(playerPos) > 22);
      const pool = far.length ? far : this.spawnPoints;
      const point = pool[Math.floor(Math.random() * pool.length)];
      bot.group.position.set(
        point.x + (Math.random() - 0.5) * 3,
        0,
        point.z + (Math.random() - 0.5) * 3
      );
    }
    this.bots.push(bot);
    this.effects.beam(bot.group.position, bot.cfg.visor);
    if (bot.cfg.boss) {
      this.boss = bot;
      this.sounds.bossRoar();
    } else if (isMinion) {
      this.sounds.summon();
    }
    return bot;
  }

  getTargets() {
    const out = [];
    for (const bot of this.bots) {
      if (bot.alive) out.push(...bot.targets);
    }
    return out;
  }

  setFlash(bot, amount) {
    for (const m of bot.flashMats) {
      if (amount === 0 && bot.stunTimer > 0.2) m.emissive.setRGB(0.12, 0.38, 0.65); // frozen
      else if (amount === 0 && bot.enraged) m.emissive.setRGB(0.45, 0.04, 0.04);
      else m.emissive.setRGB(amount, amount, amount);
    }
  }

  // Stasis Nova: freeze everything (bosses shrug most of it off)
  freezeAll(duration, bossDuration) {
    for (const b of this.bots) {
      if (!b.alive) continue;
      b.stunTimer = Math.max(b.stunTimer, b.cfg.boss ? bossDuration : duration);
      this.setFlash(b, 0);
    }
  }

  // Returns true if this shot killed the bot.
  damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.hitFlash = 0.12;
    this.setFlash(bot, 0.7);
    if (bot.health <= 0) {
      const wasBoss = bot.cfg.boss;
      this.destroy(bot);
      if (wasBoss) {
        for (const b of this.bots) {
          if (b.alive) this.destroy(b);
        }
      }
      return true;
    }
    return false;
  }

  destroy(bot) {
    if (!bot.alive) return;
    bot.alive = false;
    const center = bot.group.position.clone();
    center.y += 1 * bot.cfg.scale;
    this.effects.explosion(center, 0xff5533, bot.cfg.boss ? 3 : bot.cfg.scale);
    this.effects.debris(center, bot.cfg.color, bot.cfg.boss ? 14 : 6, bot.cfg.scale);
    if (bot === this.boss) this.boss = null;
    this.removeBot(bot);
  }

  update(dt, player, waveNum) {
    this.waveNum = waveNum;
    this.spawnDelay -= dt;
    while (this.spawnQueue.length && this.spawnDelay <= 0) {
      this.spawnBot(this.spawnQueue.shift(), null, player.position);
      this.spawnDelay = 0.35;
    }
    const accuracy = 1 + waveNum * 0.04;
    for (const bot of this.bots) {
      if (bot.alive) this.updateBot(bot, dt, player, accuracy);
    }
    this.updateProjectiles(dt, player);
    this.updateStrikes(dt, player);
  }

  // --- boss projectiles: slow orbs (strafe them) and missiles (break LOS) ---
  spawnOrb(from, dir, cfg) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0xff5533, emissive: 0xff3311, emissiveIntensity: 1.2,
      })
    );
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh, type: 'orb', dmg: cfg.dmg,
      vel: dir.clone().multiplyScalar(cfg.speed), life: 8,
    });
  }

  spawnMissile(bot, cfg) {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a3f4a, emissive: 0xff5533, emissiveIntensity: 0.5 })
    );
    _muzzle.set((Math.random() - 0.5) * 1.5, 2 * bot.cfg.scale, 0);
    bot.group.localToWorld(_muzzle);
    mesh.position.copy(_muzzle);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh, type: 'missile', dmg: cfg.dmg, radius: cfg.radius,
      vel: new THREE.Vector3((Math.random() - 0.5) * 6, 15, (Math.random() - 0.5) * 6),
      phase: 0.6, life: 9, trail: 0,
    });
    this.sounds.missileLaunch();
  }

  updateProjectiles(dt, player) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.type === 'missile') {
        p.phase -= dt;
        if (p.phase <= 0) {
          _v.copy(player.position).sub(p.mesh.position).normalize().multiplyScalar(13);
          p.vel.lerp(_v, Math.min(1, dt * 1.6));
        }
        p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
        p.mesh.rotateX(Math.PI / 2);
        p.trail -= dt;
        if (p.trail <= 0) {
          p.trail = 0.09;
          this.effects.spark(p.mesh.position, 0xffaa66);
        }
      }
      p.mesh.position.addScaledVector(p.vel, dt);

      let remove = p.life <= 0;
      let detonate = false;

      // player Bubble Shield absorbs projectiles
      if (!remove && this.shield &&
          p.mesh.position.distanceTo(this.shield.center) < this.shield.radius) {
        if (this.onShieldHit) this.onShieldHit(p.dmg, p.mesh.position.clone());
        detonate = true;
      }
      // direct hit on the player
      if (!remove && !detonate) {
        _v.copy(player.position);
        _v.y -= this.playerBodyOffset;
        if (p.mesh.position.distanceTo(_v) < this.playerHitRadius + 0.35) {
          if (this.onPlayerHit) this.onPlayerHit(p.dmg, 'blast', null);
          detonate = true;
        }
      }
      // world contact
      if (!remove && !detonate) {
        if (p.mesh.position.y < 0.12) detonate = true;
        else {
          for (const b of this.boxes) {
            if (b.containsPoint(p.mesh.position)) {
              detonate = true;
              break;
            }
          }
        }
      }

      if (detonate) {
        if (p.type === 'missile') {
          this.effects.explosion(p.mesh.position, 0xff8833, 1.2);
          this.sounds.cannon();
          _v.copy(player.position);
          _v.y -= this.playerBodyOffset;
          const d = p.mesh.position.distanceTo(_v);
          if (d < p.radius && d >= this.playerHitRadius + 0.35 && this.onPlayerHit) {
            this.onPlayerHit(Math.round(p.dmg * 0.7), 'blast', null);
          }
        } else {
          this.effects.spark(p.mesh.position, 0xff5533);
        }
        remove = true;
      }
      if (remove) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  // --- artillery: red ring shrinks onto the impact point, then it hits ---
  surfaceHeightAt(x, z) {
    _v.set(x, 0, z);
    return groundHeight(_v, 0.4, 30, this.boxes, 0.1);
  }

  callArtillery(bot, player, cfg) {
    for (let i = 0; i < cfg.n; i++) {
      const x = player.position.x + (i === 0 ? 0 : (Math.random() - 0.5) * 11);
      const z = player.position.z + (i === 0 ? 0 : (Math.random() - 0.5) * 11);
      const y = this.surfaceHeightAt(x, z);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.88, 1, 48),
        new THREE.MeshBasicMaterial({
          color: 0xff2222, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y + 0.06, z);
      this.scene.add(ring);
      this.strikes.push({
        x, z, y, ring,
        t: cfg.telegraph + i * 0.25, max: cfg.telegraph,
        dmg: cfg.dmg, radius: cfg.radius,
      });
    }
    this.sounds.artilleryWarn();
  }

  updateStrikes(dt, player) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      const frac = Math.max(0, Math.min(1, s.t / s.max));
      const scale = s.radius * (0.35 + 1.8 * frac);
      s.ring.scale.set(scale, scale, 1);
      s.ring.material.opacity = 0.5 + Math.sin(performance.now() / 60) * 0.3;
      if (s.t <= 0) {
        this.scene.remove(s.ring);
        s.ring.geometry.dispose();
        s.ring.material.dispose();
        _v.set(s.x, s.y + 0.4, s.z);
        this.effects.explosion(_v.clone(), 0xff5522, 1.6);
        this.effects.shockwave(new THREE.Vector3(s.x, s.y, s.z), s.radius, 0xff4422);
        this.sounds.explosionBig();
        const dx = player.position.x - s.x;
        const dz = player.position.z - s.z;
        const feet = player.position.y - this.playerEye;
        if (Math.hypot(dx, dz) < s.radius && Math.abs(feet - s.y) < 2.5 && this.onPlayerHit) {
          this.onPlayerHit(s.dmg, 'blast', null);
        }
        this.strikes.splice(i, 1);
      }
    }
  }

  updateBot(bot, dt, player, accuracy) {
    const cfg = bot.cfg;
    const pos = bot.group.position;
    const playerPos = player.position;

    bot.time += dt;
    if (cfg.enrage && !bot.enraged && bot.health < bot.maxHealth * cfg.enrage.below) {
      bot.enraged = true;
      this.setFlash(bot, 0);
      this.sounds.bossRoar();
      if (this.onBossEnraged) this.onBossEnraged(bot);
    }
    if (bot.hitFlash > 0) {
      bot.hitFlash -= dt;
      if (bot.hitFlash <= 0) this.setFlash(bot, 0);
    }
    if (bot.meleePulse > 0) {
      bot.meleePulse -= dt;
      bot.group.scale.setScalar(cfg.scale * (1 + Math.max(0, bot.meleePulse) * 1.2));
    }
    bot.body.position.y = 0.85 + Math.sin(bot.time * 7) * 0.03;

    // Decoy redirects aim and movement; real hits still resolve vs the player
    const targetPos = this.decoyPos || playerPos;
    const stunned = bot.stunTimer > 0;
    if (stunned) {
      bot.stunTimer -= dt;
      if (bot.stunTimer <= 0) this.setFlash(bot, 0); // thaw the icy tint
    }

    _toPlayer.set(targetPos.x - pos.x, 0, targetPos.z - pos.z);
    const dist = _toPlayer.length();
    if (dist > 0.01) _toPlayer.divideScalar(dist);
    bot.group.rotation.y = Math.atan2(_toPlayer.x, _toPlayer.z);
    const realDistSq =
      (playerPos.x - pos.x) ** 2 + (playerPos.z - pos.z) ** 2;
    const realDist = Math.sqrt(realDistSq);

    bot.losTimer -= dt;
    if (bot.losTimer <= 0) {
      bot.losTimer = 0.25;
      bot.hasLOS = this.checkLOS(bot, targetPos);
      bot.noLOSTime = bot.hasLOS ? 0 : bot.noLOSTime + 0.25;
    }

    bot.strafeTimer -= dt;
    if (bot.strafeTimer <= 0) {
      bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
      bot.strafeTimer = cfg.ai === 'rush' ? 0.4 + Math.random() * 0.5 : 1.5 + Math.random() * 2.5;
    }

    // --- movement ---
    let moveX = 0;
    let moveZ = 0;
    let speedMult = 1;
    let routing = false;

    // structure routing: ground chasers follow waypoints up stairs.
    // A waypoint only counts as reached when the bot matches its HEIGHT too —
    // otherwise bots cut corners beside staircases and pin against step sides.
    const atWaypoint = (w, r) =>
      Math.hypot(pos.x - w.x, pos.z - w.z) < r && Math.abs(pos.y - w.y) < 0.7;
    const canRoute = ((cfg.ai === 'skirmish' && !cfg.boss) || cfg.ai === 'rush') && !stunned;
    if (canRoute && bot.state !== 'cover') {
      const route = this.routeFor(pos, targetPos);
      if (route) {
        if (bot.routeKey !== route.key) {
          bot.routeKey = route.key;
          bot.routeProgress = 0;
          bot.stuckTimer = 0;
          for (let i = route.points.length - 1; i >= 0; i--) {
            if (atWaypoint(route.points[i], 1.2)) {
              bot.routeProgress = i + 1;
              break;
            }
          }
        }
        const pts = route.points;
        if (bot.routeProgress < pts.length && atWaypoint(pts[bot.routeProgress], 0.9)) {
          bot.routeProgress++;
          bot.stuckTimer = 0;
        }
        if (bot.routeProgress < pts.length) {
          const w = pts[bot.routeProgress];
          const dx = w.x - pos.x;
          const dz = w.z - pos.z;
          const l = Math.hypot(dx, dz) || 1;
          moveX = dx / l;
          moveZ = dz / l;
          speedMult = 1.15;
          routing = true;
          // pinned against geometry? restart the route from its first waypoint
          const movedSq =
            (pos.x - (bot.lastRouteX ?? pos.x)) ** 2 + (pos.z - (bot.lastRouteZ ?? pos.z)) ** 2;
          if (movedSq < (0.5 * cfg.speed * dt) ** 2) bot.stuckTimer += dt;
          else bot.stuckTimer = 0;
          bot.lastRouteX = pos.x;
          bot.lastRouteZ = pos.z;
          if (bot.stuckTimer > 1.5) {
            bot.routeProgress = 0;
            bot.stuckTimer = 0;
          }
        }
      } else {
        bot.routeKey = null;
      }
    }

    if (!routing) {
      if (bot.state === 'cover') {
        const ct = bot.coverTarget;
        const cdx = ct.x - pos.x;
        const cdz = ct.z - pos.z;
        const cdist = Math.hypot(cdx, cdz);
        if (cdist > 1) {
          moveX = cdx / cdist;
          moveZ = cdz / cdist;
          speedMult = 1.3;
        } else {
          bot.coverWait -= dt;
          bot.health = Math.min(bot.maxHealth, bot.health + 10 * dt);
        }
        if (bot.coverWait <= 0 || dist < 7) {
          bot.state = 'engage';
          bot.coverCooldown = 9;
        }
      } else if (cfg.ai === 'rush') {
        moveX = _toPlayer.x;
        moveZ = _toPlayer.z;
        moveX += -_toPlayer.z * bot.strafeDir * 0.8;
        moveZ += _toPlayer.x * bot.strafeDir * 0.8;
        if (dist < 6) speedMult = 1.35;
      } else if (cfg.ai === 'sniper') {
        if (dist < 14) {
          moveX = -_toPlayer.x;
          moveZ = -_toPlayer.z;
          speedMult = 1.6;
        } else if (dist > 45) {
          moveX = _toPlayer.x;
          moveZ = _toPlayer.z;
        } else if (!bot.aimState) {
          moveX = -_toPlayer.z * bot.strafeDir * 0.5;
          moveZ = _toPlayer.x * bot.strafeDir * 0.5;
        }
      } else {
        const [near, far] = cfg.range;
        if (!bot.hasLOS && bot.noLOSTime > 1.5) {
          moveX = _toPlayer.x;
          moveZ = _toPlayer.z;
        } else {
          if (dist > far) {
            moveX = _toPlayer.x;
            moveZ = _toPlayer.z;
          } else if (dist < near) {
            moveX = -_toPlayer.x;
            moveZ = -_toPlayer.z;
          }
          moveX += -_toPlayer.z * bot.strafeDir * 0.8;
          moveZ += _toPlayer.x * bot.strafeDir * 0.8;
        }
        if (
          cfg.usesCover && bot.state === 'engage' && bot.health < 40 &&
          bot.coverCooldown <= 0 && this.findCover(bot, playerPos)
        ) {
          bot.state = 'cover';
          bot.coverWait = 2.5;
        }
      }
    }
    bot.coverCooldown -= dt;

    if (bot.enraged) speedMult *= cfg.enrage.speed;
    if (stunned) {
      moveX = 0;
      moveZ = 0;
    }
    const len = Math.hypot(moveX, moveZ);
    if (len > 0.01) {
      const sp = cfg.speed * speedMult * this.speedScale * dt;
      pos.x += (moveX / len) * sp;
      pos.z += (moveZ / len) * sp;
    }
    clampToArena(pos, bot.radius);
    collideXZ(pos, bot.radius, pos.y, pos.y + 1.8 * cfg.scale, this.boxes, STEP_HEIGHT);

    // --- vertical physics: gravity, stairs, landing (feet = pos.y) ---
    bot.vy -= GRAVITY * dt;
    pos.y += bot.vy * dt;
    const support = groundHeight(pos, bot.radius * 0.6, pos.y, this.boxes, STEP_HEIGHT);
    if (pos.y < support - 0.001 && bot.vy <= 0.01) {
      pos.y = Math.min(support, pos.y + 10 * dt);
      bot.vy = 0;
    } else if (bot.vy <= 0 && pos.y <= support + 0.05) {
      pos.y = support;
      bot.vy = 0;
    }

    // --- attacks ---
    if (bot.state === 'cover' || stunned) return;

    if (cfg.melee) {
      bot.meleeTimer -= dt;
      const vertGap = Math.abs(playerPos.y - this.playerEye - pos.y);
      if (realDist < cfg.melee.range && vertGap < 1.2 && bot.meleeTimer <= 0) {
        bot.meleeTimer = cfg.melee.cd / (bot.enraged ? cfg.enrage.rate : 1);
        bot.meleePulse = 0.18;
        this.sounds.melee();
        const dmg = cfg.boss ? cfg.melee.dmg : Math.round(cfg.melee.dmg * this.dmgMult());
        if (this.onPlayerHit) this.onPlayerHit(dmg, 'melee', bot);
      }
    }

    if (cfg.shock) {
      bot.shockTimer -= dt;
      const vertGap = Math.abs(playerPos.y - this.playerEye - pos.y);
      if (bot.shockTimer <= 0 && realDist < cfg.shock.trigger && vertGap < 2) {
        bot.shockTimer = cfg.shock.cd;
        this.effects.shockwave(pos, cfg.shock.radius);
        this.sounds.shockwave();
        if (player.onGround && realDist < cfg.shock.radius && vertGap < 2 && this.onPlayerHit) {
          this.onPlayerHit(cfg.shock.dmg, 'shock', bot);
        }
      }
    }

    // boss ranged patterns
    const rate = bot.enraged ? cfg.enrage.rate : 1;
    if (cfg.teleport) {
      bot.teleTimer -= dt;
      if (bot.teleTimer <= 0) {
        const [a, b] = cfg.teleport.interval;
        bot.teleTimer = (a + Math.random() * (b - a)) / rate;
        const ang = Math.random() * Math.PI * 2;
        const r =
          cfg.teleport.range[0] +
          Math.random() * (cfg.teleport.range[1] - cfg.teleport.range[0]);
        this.effects.beam(pos.clone(), cfg.visor);
        pos.set(playerPos.x + Math.cos(ang) * r, 0, playerPos.z + Math.sin(ang) * r);
        clampToArena(pos, bot.radius);
        collideXZ(pos, bot.radius, pos.y, pos.y + 1.8 * cfg.scale, this.boxes);
        bot.vy = 0;
        this.effects.beam(pos.clone(), cfg.visor);
        this.sounds.summon();
      }
    }
    if (cfg.orbs) {
      bot.orbTimer -= dt;
      if (bot.orbTimer <= 0 && bot.hasLOS) {
        const [a, b] = cfg.orbs.interval;
        bot.orbTimer = (a + Math.random() * (b - a)) / rate;
        _muzzle.set(0, 1.4, 0.6);
        bot.group.localToWorld(_muzzle);
        _aim.copy(targetPos);
        _aim.y -= 0.5;
        _aim.sub(_muzzle).normalize();
        const baseYaw = Math.atan2(_aim.x, _aim.z);
        const pitch = Math.asin(Math.max(-1, Math.min(1, _aim.y)));
        for (let i = 0; i < cfg.orbs.n; i++) {
          const yaw = baseYaw + (i - (cfg.orbs.n - 1) / 2) * cfg.orbs.spread;
          _v.set(
            Math.sin(yaw) * Math.cos(pitch),
            _aim.y,
            Math.cos(yaw) * Math.cos(pitch)
          ).normalize();
          this.spawnOrb(_muzzle, _v, cfg.orbs);
        }
        this.sounds.orbVolley();
      }
    }
    if (cfg.missiles) {
      bot.missileTimer -= dt;
      if (bot.missileTimer <= 0) {
        const [a, b] = cfg.missiles.interval;
        bot.missileTimer = (a + Math.random() * (b - a)) / rate;
        for (let i = 0; i < cfg.missiles.n; i++) this.spawnMissile(bot, cfg.missiles);
      }
    }
    if (cfg.artillery) {
      bot.artilleryTimer -= dt;
      if (bot.artilleryTimer <= 0) {
        const [a, b] = cfg.artillery.interval;
        bot.artilleryTimer = (a + Math.random() * (b - a)) / rate;
        this.callArtillery(bot, player, cfg.artillery);
      }
    }

    if (cfg.summon) {
      bot.summonTimer -= dt;
      if (bot.summonTimer <= 0) {
        bot.summonTimer = cfg.summon.cd;
        if (this.minionCount() < cfg.summon.max) {
          for (const type of cfg.summon.types) {
            this.spawnBot(type, pos, playerPos, true);
          }
        }
      }
    }

    if (cfg.burst) {
      if (bot.burstLeft > 0) {
        bot.burstGap -= dt;
        if (bot.burstGap <= 0) {
          bot.burstLeft--;
          bot.burstGap = cfg.burst.gap;
          this.fireShot(bot, player, dist, accuracy, targetPos);
        }
      } else {
        bot.shootTimer -= dt;
        if (bot.shootTimer <= 0 && bot.hasLOS && dist < SHOOT_RANGE) {
          const [a, b] = cfg.burst.interval;
          bot.shootTimer = (a + Math.random() * (b - a)) / (bot.enraged ? cfg.enrage.rate : 1);
          bot.burstLeft = cfg.burst.n;
          bot.burstGap = 0;
        }
      }
    }

    if (cfg.aimed) {
      this.updateAimedShot(bot, dt, player, dist, targetPos);
    }
  }

  checkLOS(bot, playerPos) {
    _muzzle.set(0, 1.62, 0);
    bot.group.localToWorld(_muzzle);
    _v.copy(playerPos).sub(_muzzle);
    const d = _v.length();
    if (d < 0.01) return true;
    _v.divideScalar(d);
    this.raycaster.set(_muzzle, _v);
    this.raycaster.far = d;
    return this.raycaster.intersectObjects(this.occluders, false).length === 0;
  }

  findCover(bot, playerPos) {
    let best = null;
    let bestD = 30;
    for (const spot of this.coverSpots) {
      _v.copy(spot.blockCenter).sub(playerPos);
      const behind =
        (spot.point.x - spot.blockCenter.x) * _v.x + (spot.point.z - spot.blockCenter.z) * _v.z;
      if (behind <= 0) continue;
      const d = spot.point.distanceTo(bot.group.position);
      if (d < bestD) {
        bestD = d;
        best = spot;
      }
    }
    if (best) bot.coverTarget = best.point;
    return !!best;
  }

  updateAimedShot(bot, dt, player, dist, targetPos) {
    const cfg = bot.cfg.aimed;
    if (!bot.aimState) {
      bot.shootTimer -= dt;
      if (bot.shootTimer <= 0 && bot.hasLOS && dist > 6) {
        bot.aimState = { t: 0, lockedPos: null, lostTime: 0 };
        const [a, b] = cfg.interval;
        bot.shootTimer =
          (a + Math.random() * (b - a)) / (bot.enraged ? bot.cfg.enrage.rate : 1);
      }
      return;
    }

    const st = bot.aimState;
    st.t += dt;
    st.lostTime = bot.hasLOS ? 0 : st.lostTime + dt;
    if (st.lostTime > 0.4) {
      bot.aimState = null;
      this.clearLaser(bot);
      return;
    }

    _muzzle.set(0.32, 1.05, 0.9);
    bot.group.localToWorld(_muzzle);

    const lockAt = cfg.telegraph - cfg.lockTime;
    if (st.t >= lockAt && !st.lockedPos) {
      st.lockedPos = targetPos.clone();
    }
    const target = st.lockedPos || targetPos;

    if (!bot.laser) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      bot.laser = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.7 })
      );
      this.scene.add(bot.laser);
    }
    const arr = bot.laser.geometry.attributes.position.array;
    arr[0] = _muzzle.x; arr[1] = _muzzle.y; arr[2] = _muzzle.z;
    arr[3] = target.x; arr[4] = target.y; arr[5] = target.z;
    bot.laser.geometry.attributes.position.needsUpdate = true;
    bot.laser.material.color.setHex(st.lockedPos ? 0xff2222 : 0xffdd44);

    if (st.t >= cfg.telegraph) {
      const dmg = bot.cfg.boss ? cfg.dmg : Math.round(cfg.dmg * this.dmgMult());
      this.fireAimed(bot, st.lockedPos || targetPos.clone(), player, dmg);
      bot.aimState = null;
      this.clearLaser(bot);
    }
  }

  fireAimed(bot, lockedPos, player, dmg) {
    _muzzle.set(0.32, 1.05, 0.9);
    bot.group.localToWorld(_muzzle);
    _aim.copy(lockedPos).sub(_muzzle).normalize();
    this.resolveShot(bot, player, dmg, 0xff4444, true);
  }

  fireShot(bot, player, dist, accuracy, targetPos = player.position) {
    const burst = bot.cfg.burst;
    _muzzle.set(0.32, 1.05, 0.75);
    bot.group.localToWorld(_muzzle);

    _aim.copy(targetPos);
    _aim.y -= 0.35;
    _aim.sub(_muzzle).normalize();
    const spread =
      (burst.spread * 0.5 + dist * 0.0018 + player.horizontalSpeed() * 0.004) / accuracy;
    _aim.x += (Math.random() - 0.5) * 2 * spread;
    _aim.y += (Math.random() - 0.5) * 2 * spread;
    _aim.z += (Math.random() - 0.5) * 2 * spread;
    _aim.normalize();

    const [a, b] = burst.dmg;
    let dmg = a + Math.floor(Math.random() * (b - a + 1));
    if (!bot.cfg.boss) dmg = Math.round(dmg * this.dmgMult());
    this.resolveShot(bot, player, dmg, burst.heavy ? 0xffa030 : 0xff7a5c, false, burst.heavy);
  }

  resolveShot(bot, player, dmg, tracerColor, isAimed, isHeavy) {
    this.raycaster.set(_muzzle, _aim);
    this.raycaster.far = 90;
    const occ = this.raycaster.intersectObjects(this.occluders, false);
    const occDist = occ.length ? occ[0].distance : Infinity;

    // player Bubble Shield: absorb the shot if the ray enters the dome first
    if (this.shield) {
      _v.copy(this.shield.center).sub(_muzzle);
      const tca = _v.dot(_aim);
      if (tca > 0) {
        const d2 = _v.lengthSq() - tca * tca;
        const r2 = this.shield.radius * this.shield.radius;
        if (d2 < r2) {
          const t0 = tca - Math.sqrt(r2 - d2);
          if (t0 > 0 && t0 < occDist) {
            _end.copy(_muzzle).addScaledVector(_aim, t0);
            if (this.onShieldHit) this.onShieldHit(dmg, _end.clone());
            this.effects.tracer(_muzzle, _end, tracerColor);
            this.effects.flash(_muzzle, 0xff8855);
            if (isAimed) this.sounds.sniperShot();
            else if (isHeavy) this.sounds.cannon();
            else this.sounds.botShoot();
            return;
          }
        }
      }
    }

    _closest.copy(player.position);
    _closest.y -= this.playerBodyOffset;
    const t = _closest.sub(_muzzle).dot(_aim);
    let playerHit = false;
    if (t > 0 && t < occDist) {
      _closest.copy(_muzzle).addScaledVector(_aim, t);
      const radial = Math.hypot(
        _closest.x - player.position.x,
        _closest.y - (player.position.y - this.playerBodyOffset),
        _closest.z - player.position.z
      );
      playerHit = radial < this.playerHitRadius;
    }

    if (playerHit) {
      _end.copy(player.position);
      _end.y -= 0.35;
      if (this.onPlayerHit) this.onPlayerHit(dmg, isAimed ? 'sniper' : 'shot', bot);
    } else if (occDist < Infinity) {
      _end.copy(occ[0].point);
      this.effects.spark(_end, 0xffaa66);
    } else {
      _end.copy(_muzzle).addScaledVector(_aim, 70);
    }

    this.effects.tracer(_muzzle, _end, tracerColor);
    this.effects.flash(_muzzle, 0xff8855);
    if (isAimed) this.sounds.sniperShot();
    else if (isHeavy) this.sounds.cannon();
    else this.sounds.botShoot();
  }
}

deepFreeze(BOT_TYPES);
