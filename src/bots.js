import * as THREE from 'three';
import { collideXZ, clampToArena } from './world.js';

// Type design: big pro ↔ big con.
//  grunt  — balanced skirmisher; hunts cover when hurt
//  rusher — very fast, small target, brutal melee ↔ dies to a single body shot, no gun
//  tank   — huge HP pool, heavy hits ↔ crawls, giant hitbox, slow fire
//  sniper — long-range laser-telegraphed shots that HURT ↔ one-shot fragile, flees up close
//  warden — wave-5 boss: burst cannon, ground slam (jump to dodge!), summons rushers
//  titan  — wave-10 boss: everything the warden has, bigger, plus an aimed cannon shot
export const BOT_TYPES = {
  grunt: {
    hp: 100, speed: 4.4, scale: 1, points: 100, color: 0x3a4160, visor: 0xff2b2b,
    ai: 'skirmish', range: [8, 20], usesCover: true,
    burst: { n: 3, gap: 0.13, dmg: [6, 10], spread: 0.035, interval: [1.6, 2.8] },
  },
  rusher: {
    hp: 30, speed: 7.8, scale: 0.7, points: 150, color: 0xd45500, visor: 0xffe14d,
    ai: 'rush', spike: true,
    melee: { dmg: 14, range: 2.4, cd: 1.0 },
  },
  tank: {
    hp: 240, speed: 2.0, scale: 1.5, points: 300, color: 0x3c5a3c, visor: 0xff9030,
    ai: 'skirmish', range: [10, 24], wide: true,
    burst: { n: 1, gap: 0, dmg: [16, 22], spread: 0.055, interval: [2.6, 3.4], heavy: true },
  },
  sniper: {
    hp: 30, speed: 3.4, scale: 1, points: 200, color: 0x6fc9d8, visor: 0x2bffe0,
    ai: 'sniper', longRifle: true,
    aimed: { dmg: 28, telegraph: 1.3, lockTime: 0.3, interval: [3.2, 4.4] },
  },
  warden: {
    hp: 900, speed: 2.4, scale: 2.2, points: 2000, color: 0x8a1f2d, visor: 0xffd24d,
    ai: 'skirmish', range: [7, 16], wide: true, boss: true, name: 'THE WARDEN',
    burst: { n: 6, gap: 0.09, dmg: [6, 9], spread: 0.05, interval: [2.8, 3.6] },
    shock: { dmg: 30, radius: 7, trigger: 5.5, cd: 4.5 },
    summon: { types: ['rusher', 'rusher'], cd: 12, max: 4 },
  },
  titan: {
    hp: 2200, speed: 2.6, scale: 3, points: 5000, color: 0x2a1136, visor: 0xff3df0,
    ai: 'skirmish', range: [8, 18], wide: true, boss: true, name: 'THE TITAN',
    burst: { n: 8, gap: 0.09, dmg: [7, 10], spread: 0.05, interval: [2.6, 3.4] },
    shock: { dmg: 40, radius: 8, trigger: 6.5, cd: 4 },
    summon: { types: ['rusher', 'rusher', 'sniper'], cd: 14, max: 5 },
    aimed: { dmg: 40, telegraph: 1.1, lockTime: 0.3, interval: [8, 10] },
  },
};

const SHOOT_RANGE = 55;
const PLAYER_HIT_RADIUS = 0.5;

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

    this.time = Math.random() * 10;
    this.hitFlash = 0;
    this.meleePulse = 0;

    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.state = 'engage';
    this.coverTarget = null;
    this.coverWait = 0;
    this.coverCooldown = 0;

    this.hasLOS = false;
    this.losTimer = 0;
    this.noLOSTime = 0;

    this.shootTimer = 1.2 + Math.random() * 1.2;
    this.burstLeft = 0;
    this.burstGap = 0;
    this.meleeTimer = 0;

    this.aimState = null; // { t, lockedPos } — sniper/titan telegraphed shot
    this.laser = null;
    this.shockTimer = 2;
    this.summonTimer = 6;
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
    this.raycaster = new THREE.Raycaster();
    this.onPlayerHit = null; // set by main: (damage, kind) => {}
    this.bots = [];
    this.spawnQueue = [];
    this.spawnDelay = 0;
    this.boss = null;
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
      m.emissive.setRGB(amount, amount, amount);
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
        // boss down — every remaining enemy dies with it (no points)
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
    this.spawnDelay -= dt;
    while (this.spawnQueue.length && this.spawnDelay <= 0) {
      this.spawnBot(this.spawnQueue.shift(), null, player.position);
      this.spawnDelay = 0.35;
    }
    const accuracy = 1 + waveNum * 0.04;
    for (const bot of this.bots) {
      if (bot.alive) this.updateBot(bot, dt, player, accuracy);
    }
  }

  updateBot(bot, dt, player, accuracy) {
    const cfg = bot.cfg;
    const pos = bot.group.position;
    const playerPos = player.position;

    bot.time += dt;
    if (bot.hitFlash > 0) {
      bot.hitFlash -= dt;
      if (bot.hitFlash <= 0) this.setFlash(bot, 0);
    }
    if (bot.meleePulse > 0) {
      bot.meleePulse -= dt;
      bot.group.scale.setScalar(cfg.scale * (1 + Math.max(0, bot.meleePulse) * 1.2));
    }
    bot.body.position.y = 0.85 + Math.sin(bot.time * 7) * 0.03;

    _toPlayer.set(playerPos.x - pos.x, 0, playerPos.z - pos.z);
    const dist = _toPlayer.length();
    if (dist > 0.01) _toPlayer.divideScalar(dist);
    bot.group.rotation.y = Math.atan2(_toPlayer.x, _toPlayer.z);

    // periodic line-of-sight check (cheap, cached)
    bot.losTimer -= dt;
    if (bot.losTimer <= 0) {
      bot.losTimer = 0.25;
      bot.hasLOS = this.checkLOS(bot, playerPos);
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

    if (bot.state === 'cover') {
      // low-HP grunt hiding behind a block
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
        bot.health = Math.min(bot.maxHealth, bot.health + 10 * dt); // patching up
      }
      if (bot.coverWait <= 0 || dist < 7) {
        bot.state = 'engage';
        bot.coverCooldown = 9;
      }
    } else if (cfg.ai === 'rush') {
      moveX = _toPlayer.x;
      moveZ = _toPlayer.z;
      // heavy zigzag — hard to hit
      moveX += -_toPlayer.z * bot.strafeDir * 0.8;
      moveZ += _toPlayer.x * bot.strafeDir * 0.8;
      if (dist < 6) speedMult = 1.35; // closing lunge
    } else if (cfg.ai === 'sniper') {
      if (dist < 14) {
        moveX = -_toPlayer.x;
        moveZ = -_toPlayer.z;
        speedMult = 1.6; // panic backpedal
      } else if (dist > 45) {
        moveX = _toPlayer.x;
        moveZ = _toPlayer.z;
      } else if (!bot.aimState) {
        moveX = -_toPlayer.z * bot.strafeDir * 0.5;
        moveZ = _toPlayer.x * bot.strafeDir * 0.5;
      }
      // holds still while aiming
    } else {
      // skirmish (grunt, tank, bosses)
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
      // hurt grunt looks for cover
      if (
        cfg.usesCover && bot.state === 'engage' && bot.health < 40 &&
        bot.coverCooldown <= 0 && this.findCover(bot, playerPos)
      ) {
        bot.state = 'cover';
        bot.coverWait = 2.5;
      }
    }
    bot.coverCooldown -= dt;

    const len = Math.hypot(moveX, moveZ);
    if (len > 0.01) {
      pos.x += (moveX / len) * cfg.speed * speedMult * dt;
      pos.z += (moveZ / len) * cfg.speed * speedMult * dt;
    }
    clampToArena(pos, bot.radius);
    collideXZ(pos, bot.radius, pos.y + 0.05, pos.y + 1.8 * cfg.scale, this.boxes);

    // --- attacks ---
    if (bot.state === 'cover') return;

    if (cfg.melee) {
      bot.meleeTimer -= dt;
      const vertGap = Math.abs(playerPos.y - 1.7 - pos.y);
      if (dist < cfg.melee.range && vertGap < 1.2 && bot.meleeTimer <= 0) {
        bot.meleeTimer = cfg.melee.cd;
        bot.meleePulse = 0.18;
        this.sounds.melee();
        if (this.onPlayerHit) this.onPlayerHit(cfg.melee.dmg, 'melee');
      }
    }

    if (cfg.shock) {
      bot.shockTimer -= dt;
      if (bot.shockTimer <= 0 && dist < cfg.shock.trigger) {
        bot.shockTimer = cfg.shock.cd;
        this.effects.shockwave(pos, cfg.shock.radius);
        this.sounds.shockwave();
        // jump to dodge — only hits a grounded player
        if (player.onGround && dist < cfg.shock.radius && this.onPlayerHit) {
          this.onPlayerHit(cfg.shock.dmg, 'shock');
        }
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
          this.fireShot(bot, player, dist, accuracy);
        }
      } else {
        bot.shootTimer -= dt;
        if (bot.shootTimer <= 0 && bot.hasLOS && dist < SHOOT_RANGE) {
          const [a, b] = cfg.burst.interval;
          bot.shootTimer = a + Math.random() * (b - a);
          bot.burstLeft = cfg.burst.n;
          bot.burstGap = 0;
        }
      }
    }

    if (cfg.aimed) {
      this.updateAimedShot(bot, dt, player, dist);
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
      // the block must sit between the player and the spot
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

  // sniper / titan cannon: laser tracks the player, locks (turns red), fires
  updateAimedShot(bot, dt, player, dist) {
    const cfg = bot.cfg.aimed;
    if (!bot.aimState) {
      bot.shootTimer -= dt;
      if (bot.shootTimer <= 0 && bot.hasLOS && dist > 6) {
        bot.aimState = { t: 0, lockedPos: null, lostTime: 0 };
        const [a, b] = cfg.interval;
        bot.shootTimer = a + Math.random() * (b - a);
      }
      return;
    }

    const st = bot.aimState;
    st.t += dt;
    st.lostTime = bot.hasLOS ? 0 : st.lostTime + dt;
    if (st.lostTime > 0.4) {
      // target broke line of sight — abort
      bot.aimState = null;
      this.clearLaser(bot);
      return;
    }

    _muzzle.set(0.32, 1.05, 0.9);
    bot.group.localToWorld(_muzzle);

    const lockAt = cfg.telegraph - cfg.lockTime;
    if (st.t >= lockAt && !st.lockedPos) {
      st.lockedPos = player.position.clone(); // aim locked — MOVE!
    }
    const target = st.lockedPos || player.position;

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
      this.fireAimed(bot, st.lockedPos || player.position.clone(), player, cfg.dmg);
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

  fireShot(bot, player, dist, accuracy) {
    const burst = bot.cfg.burst;
    _muzzle.set(0.32, 1.05, 0.75);
    bot.group.localToWorld(_muzzle);

    _aim.copy(player.position);
    _aim.y -= 0.35;
    _aim.sub(_muzzle).normalize();
    const spread =
      (burst.spread * 0.5 + dist * 0.0018 + player.horizontalSpeed() * 0.004) / accuracy;
    _aim.x += (Math.random() - 0.5) * 2 * spread;
    _aim.y += (Math.random() - 0.5) * 2 * spread;
    _aim.z += (Math.random() - 0.5) * 2 * spread;
    _aim.normalize();

    const [a, b] = burst.dmg;
    const dmg = a + Math.floor(Math.random() * (b - a + 1));
    this.resolveShot(bot, player, dmg, burst.heavy ? 0xffa030 : 0xff7a5c, false, burst.heavy);
  }

  // shared hitscan: _muzzle and _aim must be set
  resolveShot(bot, player, dmg, tracerColor, isAimed, isHeavy) {
    this.raycaster.set(_muzzle, _aim);
    this.raycaster.far = 90;
    const occ = this.raycaster.intersectObjects(this.occluders, false);
    const occDist = occ.length ? occ[0].distance : Infinity;

    _closest.copy(player.position);
    _closest.y -= 0.35;
    const t = _closest.sub(_muzzle).dot(_aim);
    let playerHit = false;
    if (t > 0 && t < occDist) {
      _closest.copy(_muzzle).addScaledVector(_aim, t);
      const radial = Math.hypot(
        _closest.x - player.position.x,
        _closest.y - (player.position.y - 0.35),
        _closest.z - player.position.z
      );
      playerHit = radial < PLAYER_HIT_RADIUS;
    }

    if (playerHit) {
      _end.copy(player.position);
      _end.y -= 0.35;
      if (this.onPlayerHit) this.onPlayerHit(dmg, isAimed ? 'sniper' : 'shot');
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
