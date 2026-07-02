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
    this.reset();
  }

  reset() {
    this.camera.position.set(0, EYE_HEIGHT, 12);
    this.camera.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.onGround = true;
    this.timeSinceHit = 999;
  }

  get position() {
    return this.camera.position;
  }

  look(dx, dy) {
    this.camera.rotation.y -= dx * LOOK_SENSITIVITY;
    this.camera.rotation.x = Math.max(
      -1.55,
      Math.min(1.55, this.camera.rotation.x - dy * LOOK_SENSITIVITY)
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

    const speed = WALK_SPEED * (k['ShiftLeft'] || k['ShiftRight'] ? SPRINT_MULT : 1);
    const blend = Math.min(1, dt * 12);
    this.velocity.x += (_wish.x * speed - this.velocity.x) * blend;
    this.velocity.z += (_wish.z * speed - this.velocity.z) * blend;

    const pos = this.camera.position;

    // horizontal move + collision (boxes within step height don't block)
    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;
    clampToArena(pos, RADIUS);
    collideXZ(pos, RADIUS, pos.y - EYE_HEIGHT, pos.y + 0.2, obstacleBoxes, STEP_HEIGHT);

    // vertical move
    if (k['Space'] && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }
    this.velocity.y -= GRAVITY * dt;
    pos.y += this.velocity.y * dt;

    const feet = pos.y - EYE_HEIGHT;
    const support = groundHeight(pos, RADIUS * 0.6, feet, obstacleBoxes, STEP_HEIGHT);
    if (feet < support - 0.001 && this.velocity.y <= 0.01) {
      // stepped into higher ground (stairs) — climb up smoothly
      pos.y = Math.min(support + EYE_HEIGHT, pos.y + 14 * dt);
      this.velocity.y = 0;
      this.onGround = true;
    } else if (this.velocity.y <= 0 && feet <= support + 0.05) {
      pos.y = support + EYE_HEIGHT;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // slow health regen after 5s without taking a hit
    this.timeSinceHit += dt;
    if (this.timeSinceHit > 5 && this.health > 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 8 * dt);
    }
  }
}
