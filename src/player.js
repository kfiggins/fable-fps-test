import * as THREE from 'three';
import { collideXZ, groundHeight, clampToArena } from './world.js';

export const EYE_HEIGHT = 1.7;
const RADIUS = 0.45;
const WALK_SPEED = 7;
const SPRINT_MULT = 1.5;
const GRAVITY = 26;
const JUMP_SPEED = 9;
const STEP_HEIGHT = 0.55; // tall enough to walk up 0.5m stair risers
const LOOK_SENSITIVITY = 0.0021;

const _wish = new THREE.Vector3();

export class Player {
  constructor(camera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.velocity = new THREE.Vector3();
    this.keys = {};
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.onGround = true;
    this.timeSinceHit = 999;

    this.lookScale = 1; // reduced while aiming down sights
    // body profile — the mech swaps these while piloting
    this.eye = EYE_HEIGHT;
    this.radius = RADIUS;
    this.stepH = STEP_HEIGHT;
    this.baseSpeed = WALK_SPEED;
    this.jumpSpeed = JUMP_SPEED;
    this.canSprint = true;
    // scrap-bought jetpack: hold Space in the air to thrust
    this.jetpack = { owned: false, fuel: 0, maxFuel: 1.3, thrust: 38 };
    this.jetting = false;
    // modded by upgrades (main syncs these from the run's stats)
    this.dynamicSpeedMult = 1;
    this.jumpMult = 1;
    this.regenRate = 8;
    this.regenDelay = 5;
    this.canDoubleJump = false;
    this.airJumpUsed = false;
    this.wantJump = false; // edge-triggered midair jump request
    this.onAirJump = null; // callback for effects/sound

    this.reset();
  }

  reset() {
    this.camera.position.set(16, this.eye, 16);
    this.camera.rotation.set(0, -Math.PI / 4, 0);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.onGround = true;
    this.timeSinceHit = 999;
    this.airJumpUsed = false;
    this.wantJump = false;
  }

  get position() {
    return this.camera.position;
  }

  look(dx, dy) {
    const sens = LOOK_SENSITIVITY * this.lookScale;
    this.camera.rotation.y -= dx * sens;
    this.camera.rotation.x = Math.max(
      -1.55,
      Math.min(1.55, this.camera.rotation.x - dy * sens)
    );
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.timeSinceHit = 0;
    return this.health <= 0;
  }

  horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  jumpVelocity() {
    // jump height scales with v², so +10% height = ×√1.1 velocity
    return this.jumpSpeed * Math.sqrt(this.jumpMult);
  }

  update(dt, obstacleBoxes) {
    const k = this.keys;
    const yaw = this.camera.rotation.y;
    const iz = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
    const ix = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);

    _wish.set(
      -Math.sin(yaw) * iz + Math.cos(yaw) * ix,
      0,
      -Math.cos(yaw) * iz - Math.sin(yaw) * ix
    );
    if (_wish.lengthSq() > 1) _wish.normalize();

    const speed =
      this.baseSpeed *
      (this.canSprint && (k['ShiftLeft'] || k['ShiftRight']) ? SPRINT_MULT : 1) *
      this.dynamicSpeedMult;
    const blend = Math.min(1, dt * 12);
    this.velocity.x += (_wish.x * speed - this.velocity.x) * blend;
    this.velocity.z += (_wish.z * speed - this.velocity.z) * blend;

    const pos = this.camera.position;

    // horizontal move + collision (boxes within step height don't block)
    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;
    clampToArena(pos, this.radius);
    collideXZ(pos, this.radius, pos.y - this.eye, pos.y + 0.2, obstacleBoxes, this.stepH);

    // vertical move
    if (k['Space'] && this.onGround) {
      this.velocity.y = this.jumpVelocity();
      this.onGround = false;
    }
    if (this.wantJump) {
      this.wantJump = false;
      if (!this.onGround && this.canDoubleJump && !this.airJumpUsed) {
        this.velocity.y = this.jumpVelocity() * 0.95;
        this.airJumpUsed = true;
        if (this.onAirJump) this.onAirJump();
      }
    }
    // jetpack: hold Space while airborne
    const jp = this.jetpack;
    this.jetting = false;
    if (jp.owned && k['Space'] && !this.onGround && jp.fuel > 0) {
      this.velocity.y = Math.min(this.velocity.y + jp.thrust * dt, 10);
      jp.fuel = Math.max(0, jp.fuel - dt);
      this.jetting = true;
    }
    if (jp.owned && this.onGround && jp.fuel < jp.maxFuel) {
      jp.fuel = Math.min(jp.maxFuel, jp.fuel + (jp.maxFuel / 2.5) * dt);
    }
    this.velocity.y -= GRAVITY * dt;
    pos.y += this.velocity.y * dt;

    // ceiling bonk: rising into the underside of a floating box (building slab)
    if (this.velocity.y > 0) {
      for (const b of obstacleBoxes) {
        if (b.min.y < 0.5) continue; // grounded boxes are walls, not ceilings
        if (pos.y >= b.min.y + 0.3 || pos.y + 0.45 <= b.min.y) continue;
        if (
          pos.x < b.min.x - this.radius * 0.5 || pos.x > b.max.x + this.radius * 0.5 ||
          pos.z < b.min.z - this.radius * 0.5 || pos.z > b.max.z + this.radius * 0.5
        ) continue;
        pos.y = Math.min(pos.y, b.min.y - 0.25);
        this.velocity.y = 0;
        break;
      }
    }

    const feet = pos.y - this.eye;
    const support = groundHeight(pos, this.radius * 0.6, feet, obstacleBoxes, this.stepH);
    if (feet < support - 0.001 && this.velocity.y <= 0.01) {
      // stepped into higher ground (stairs) — climb up smoothly
      pos.y = Math.min(support + this.eye, pos.y + 14 * dt);
      this.velocity.y = 0;
      this.onGround = true;
    } else if (this.velocity.y <= 0 && feet <= support + 0.05) {
      pos.y = support + this.eye;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    if (this.onGround) this.airJumpUsed = false;

    // health regen after regenDelay seconds without taking a hit
    this.timeSinceHit += dt;
    if (
      this.timeSinceHit > this.regenDelay &&
      this.health > 0 &&
      this.health < this.maxHealth
    ) {
      this.health = Math.min(this.maxHealth, this.health + this.regenRate * dt);
    }
  }
}
