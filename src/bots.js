import * as THREE from 'three';
import { collideXZ, clampToArena } from './world.js';

const BOT_COUNT = 5;
const BOT_RADIUS = 0.45;
const SHOOT_RANGE = 45;
const PLAYER_HIT_RADIUS = 0.5;

const _toPlayer = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _end = new THREE.Vector3();

class Bot {
  constructor(scene) {
    this.group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a4160, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 6, 12), bodyMat);
    body.position.y = 0.85;
    body.castShadow = true;

    const headMat = bodyMat.clone();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), headMat);
    head.position.y = 1.62;
    head.castShadow = true;

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.09, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff2b2b })
    );
    visor.position.set(0, 1.64, 0.24);

    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.14, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.5 })
    );
    gun.position.set(0.32, 1.05, 0.35);

    body.userData = { bot: this, part: 'body' };
    head.userData = { bot: this, part: 'head' };

    this.group.add(body, head, visor, gun);
    scene.add(this.group);

    this.body = body;
    this.flashMats = [bodyMat, headMat];
    this.targets = [body, head];

    this.alive = true;
    this.health = 100;
    this.respawnTimer = 0;
    this.shootTimer = 1.5;
    this.strafeDir = 0;
    this.strafeTimer = 0;
    this.hitFlash = 0;
    this.time = Math.random() * 10;
  }
}

export class BotManager {
  constructor(scene, world, effects, sounds) {
    this.effects = effects;
    this.sounds = sounds;
    this.occluders = world.occluders;
    this.boxes = world.obstacleBoxes;
    this.spawnPoints = world.spawnPoints;
    this.raycaster = new THREE.Raycaster();
    this.onPlayerHit = null; // set by main: (damage) => {}
    this.bots = [];
    for (let i = 0; i < BOT_COUNT; i++) {
      this.bots.push(new Bot(scene));
    }
  }

  reset(playerPos) {
    for (const bot of this.bots) this.spawn(bot, playerPos);
  }

  spawn(bot, playerPos) {
    const candidates = this.spawnPoints.filter((p) => p.distanceTo(playerPos) > 18);
    const pool = candidates.length ? candidates : this.spawnPoints;
    const point = pool[Math.floor(Math.random() * pool.length)];
    bot.group.position.set(
      point.x + (Math.random() - 0.5) * 3,
      0,
      point.z + (Math.random() - 0.5) * 3
    );
    bot.health = 100;
    bot.alive = true;
    bot.group.visible = true;
    bot.shootTimer = 1.2 + Math.random();
    bot.hitFlash = 0;
    this.setFlash(bot, 0);
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
      bot.alive = false;
      bot.group.visible = false;
      bot.respawnTimer = 3;
      const center = bot.group.position.clone();
      center.y += 1;
      this.effects.explosion(center);
      return true;
    }
    return false;
  }

  update(dt, player, difficulty) {
    const playerPos = player.position;
    const speed = Math.min(5.5, 3.6 * difficulty);

    for (const bot of this.bots) {
      if (!bot.alive) {
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) this.spawn(bot, playerPos);
        continue;
      }

      bot.time += dt;
      if (bot.hitFlash > 0) {
        bot.hitFlash -= dt;
        if (bot.hitFlash <= 0) this.setFlash(bot, 0);
      }

      const pos = bot.group.position;
      _toPlayer.set(playerPos.x - pos.x, 0, playerPos.z - pos.z);
      const dist = _toPlayer.length();
      if (dist > 0.01) _toPlayer.divideScalar(dist);

      bot.group.rotation.y = Math.atan2(_toPlayer.x, _toPlayer.z);
      bot.body.position.y = 0.85 + Math.sin(bot.time * 7) * 0.03;

      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeDir = [-1, 0, 1][Math.floor(Math.random() * 3)];
        bot.strafeTimer = 1 + Math.random() * 2;
      }

      let moveX = 0;
      let moveZ = 0;
      if (dist > 15) {
        moveX += _toPlayer.x;
        moveZ += _toPlayer.z;
      } else if (dist < 6) {
        moveX -= _toPlayer.x;
        moveZ -= _toPlayer.z;
      }
      moveX += -_toPlayer.z * bot.strafeDir;
      moveZ += _toPlayer.x * bot.strafeDir;
      const len = Math.hypot(moveX, moveZ);
      if (len > 0.01) {
        pos.x += (moveX / len) * speed * dt;
        pos.z += (moveZ / len) * speed * dt;
      }

      clampToArena(pos, BOT_RADIUS);
      collideXZ(pos, BOT_RADIUS, pos.y + 0.05, pos.y + 1.8, this.boxes);

      bot.shootTimer -= dt;
      if (bot.shootTimer <= 0 && dist < SHOOT_RANGE) {
        this.fire(bot, player, dist, difficulty);
        bot.shootTimer = (1.1 + Math.random() * 1.4) / difficulty;
      }
    }
  }

  fire(bot, player, dist, difficulty) {
    _muzzle.set(0.32, 1.05, 0.75);
    bot.group.localToWorld(_muzzle);

    // aim at the player's chest with distance-based spread
    _aim.copy(player.position);
    _aim.y -= 0.35;
    _aim.sub(_muzzle).normalize();
    const spread = (0.02 + dist * 0.0022 + player.horizontalSpeed() * 0.004) / difficulty;
    _aim.x += (Math.random() - 0.5) * 2 * spread;
    _aim.y += (Math.random() - 0.5) * 2 * spread;
    _aim.z += (Math.random() - 0.5) * 2 * spread;
    _aim.normalize();

    this.raycaster.set(_muzzle, _aim);
    this.raycaster.far = 80;
    const occ = this.raycaster.intersectObjects(this.occluders, false);
    const occDist = occ.length ? occ[0].distance : Infinity;

    // ray-vs-sphere test against the player
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
      if (this.onPlayerHit) this.onPlayerHit(8 + Math.floor(Math.random() * 7));
    } else if (occDist < Infinity) {
      _end.copy(occ[0].point);
      this.effects.spark(_end, 0xffaa66);
    } else {
      _end.copy(_muzzle).addScaledVector(_aim, 60);
    }

    this.effects.tracer(_muzzle, _end, 0xff7a5c);
    this.effects.flash(_muzzle, 0xff8855);
    this.sounds.botShoot();
  }
}
