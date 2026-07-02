import * as THREE from 'three';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { BotManager } from './bots.js';
import { Effects } from './effects.js';
import { Sounds } from './sounds.js';

const MAG_SIZE = 10;
const FIRE_INTERVAL = 0.14;
const RELOAD_TIME = 1.1;
const BODY_DAMAGE = 34;
const HEAD_DAMAGE = 100;

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
scene.add(camera);

const world = createWorld(scene);
const player = new Player(camera);
const effects = new Effects(scene);
const sounds = new Sounds();
const bots = new BotManager(scene, world, effects, sounds);

// --- gun viewmodel ---
function buildGun() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f3138, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.5), mat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 10), mat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.38);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), mat);
  grip.position.set(0, -0.13, 0.14);
  grip.rotation.x = 0.25;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), mat);
  sight.position.set(0, 0.1, -0.18);
  g.add(body, barrel, grip, sight);
  g.position.set(0.24, -0.22, -0.5);
  return g;
}
const gun = buildGun();
camera.add(gun);
const GUN_BASE = gun.position.clone();
let gunKick = 0;
let bobTime = 0;

// --- HUD elements ---
const el = (id) => document.getElementById(id);
const hudHealth = el('health-bar');
const hudAmmo = el('ammo');
const hudKills = el('kills');
const hitmarker = el('hitmarker');
const vignette = el('vignette');
const overlay = el('overlay');
const ovMsg = el('ov-msg');
const ovSub = el('ov-sub');
const ovTitle = overlay.querySelector('h1');
const ovPrompt = overlay.querySelector('.prompt');

// --- game state ---
let state = 'menu'; // menu | playing | paused | dead
let kills = 0;
let ammo = MAG_SIZE;
let reloading = false;
let reloadTimer = 0;
let fireCooldown = 0;
let firing = false;
let hitmarkerTimer = 0;
let vignetteAlpha = 0;

const difficulty = () => 1 + Math.min(0.8, kills * 0.03);

function showOverlay(title, msg, sub, prompt) {
  ovTitle.textContent = title;
  ovMsg.textContent = msg;
  ovSub.innerHTML = sub;
  ovPrompt.textContent = prompt;
  overlay.classList.remove('hidden');
}

function startGame() {
  player.reset();
  bots.reset(player.position);
  kills = 0;
  ammo = MAG_SIZE;
  reloading = false;
  fireCooldown = 0;
  firing = false;
  vignetteAlpha = 0;
  state = 'playing';
}

// --- pointer lock ---
const canvas = renderer.domElement;

overlay.addEventListener('click', () => {
  sounds.init();
  if (state === 'menu' || state === 'dead') startGame();
  else if (state === 'paused') state = 'playing';
  overlay.classList.add('hidden');
  canvas.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && state === 'playing') {
    state = 'paused';
    firing = false;
    showOverlay(
      'PAUSED',
      `${kills} kills so far`,
      'WASD move &middot; SHIFT sprint &middot; SPACE jump<br />MOUSE aim &middot; CLICK shoot &middot; R reload',
      'CLICK TO RESUME'
    );
  }
});

document.addEventListener('mousemove', (e) => {
  if (state === 'playing' && document.pointerLockElement === canvas) {
    player.look(e.movementX, e.movementY);
  }
});

document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && state === 'playing' && document.pointerLockElement === canvas) {
    firing = true;
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
});

document.addEventListener('keydown', (e) => {
  player.keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyR' && state === 'playing') startReload();
});
document.addEventListener('keyup', (e) => {
  player.keys[e.code] = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- shooting ---
const raycaster = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function startReload() {
  if (reloading || ammo === MAG_SIZE) return;
  reloading = true;
  reloadTimer = RELOAD_TIME;
  sounds.reload();
}

function tryShoot() {
  if (fireCooldown > 0 || reloading) return;
  if (ammo <= 0) {
    sounds.empty();
    startReload();
    return;
  }
  fireCooldown = FIRE_INTERVAL;
  ammo--;
  gunKick = 1;
  sounds.shoot();

  camera.updateMatrixWorld(true);
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  raycaster.set(_origin, _dir);
  raycaster.far = 150;

  const hits = raycaster.intersectObjects([...bots.getTargets(), ...world.solids], false);
  const end = _origin.clone().addScaledVector(_dir, 120);
  if (hits.length) {
    end.copy(hits[0].point);
    const target = hits[0].object.userData;
    if (target && target.bot) {
      const dmg = target.part === 'head' ? HEAD_DAMAGE : BODY_DAMAGE;
      const died = bots.damage(target.bot, dmg);
      effects.spark(end, 0xff5555);
      hitmarkerTimer = 0.12;
      sounds.hit();
      if (died) {
        kills++;
        sounds.kill();
      }
    } else {
      effects.spark(end, 0xccc9a8);
    }
  }

  _muzzle.set(0, 0.03, -0.55);
  gun.localToWorld(_muzzle);
  effects.tracer(_muzzle, end);
  effects.flash(_muzzle);

  if (ammo === 0) startReload();
}

// --- bot damage callback ---
bots.onPlayerHit = (dmg) => {
  vignetteAlpha = 0.85;
  sounds.hurt();
  const dead = player.takeDamage(dmg);
  if (dead) {
    state = 'dead';
    firing = false;
    document.exitPointerLock();
    showOverlay(
      'YOU DIED',
      `${kills} kill${kills === 1 ? '' : 's'}`,
      'The bots got you this time.',
      'CLICK TO RESPAWN'
    );
  }
};

// --- gun animation ---
function updateGun(dt) {
  gunKick = Math.max(0, gunKick - dt * 9);
  bobTime += dt * Math.min(1, player.horizontalSpeed() / 5);
  const bob = Math.sin(bobTime * 9) * 0.008;
  gun.position.set(
    GUN_BASE.x + Math.cos(bobTime * 4.5) * 0.004,
    GUN_BASE.y + bob,
    GUN_BASE.z + gunKick * 0.07
  );
  gun.rotation.x = gunKick * 0.14;
}

// --- HUD ---
function updateHUD(dt) {
  hudHealth.style.width = `${(player.health / player.maxHealth) * 100}%`;
  hudHealth.style.background =
    player.health > 40
      ? 'linear-gradient(90deg, #37d67a, #7ce7a5)'
      : 'linear-gradient(90deg, #d63737, #e77c7c)';
  hudAmmo.textContent = reloading ? '···' : `${ammo}`;
  hudKills.textContent = `${kills}`;

  hitmarkerTimer = Math.max(0, hitmarkerTimer - dt);
  hitmarker.style.opacity = hitmarkerTimer > 0 ? '1' : '0';

  vignetteAlpha = Math.max(0, vignetteAlpha - dt * 1.6);
  vignette.style.opacity = `${vignetteAlpha}`;
}

// debug/testing handle
window.__game = { player, bots, camera, stats: () => ({ kills, ammo, health: player.health }) };

// --- main loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    player.update(dt, world.obstacleBoxes);
    bots.update(dt, player, difficulty());

    fireCooldown -= dt;
    if (reloading) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) {
        reloading = false;
        ammo = MAG_SIZE;
      }
    }
    if (firing) tryShoot();
    updateGun(dt);
  }

  effects.update(dt);
  updateHUD(dt);
  renderer.render(scene, camera);
});
