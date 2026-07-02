import * as THREE from 'three';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { BotManager, BOT_TYPES } from './bots.js';
import { Effects } from './effects.js';
import { Sounds } from './sounds.js';

const MAG_SIZE = 10;
const FIRE_INTERVAL = 0.14;
const RELOAD_TIME = 1.1;
const BODY_DAMAGE = 34;
const HEAD_DAMAGE = 100;
const BASE_FOV = 75;

// wave composition: [grunts, rushers, snipers, tanks] or a boss wave
function mix(g, r, s, t) {
  return [
    ...Array(g).fill('grunt'),
    ...Array(r).fill('rusher'),
    ...Array(s).fill('sniper'),
    ...Array(t).fill('tank'),
  ];
}
const WAVES = [
  mix(4, 0, 0, 0),
  mix(5, 2, 0, 0),
  mix(4, 3, 2, 0),
  mix(4, 3, 2, 2),
  ['warden', 'rusher', 'rusher'],
  mix(6, 4, 2, 2),
  mix(5, 4, 3, 3),
  mix(4, 6, 4, 3),
  mix(6, 5, 4, 4),
  ['titan', 'grunt', 'grunt', 'sniper', 'sniper'],
  mix(6, 5, 3, 3),
  mix(6, 6, 4, 3),
  mix(7, 6, 4, 4),
  mix(6, 8, 5, 4),
  ['butcher', 'rusher', 'rusher', 'tank'],
  mix(8, 7, 5, 4),
  mix(8, 8, 5, 5),
  mix(8, 9, 6, 5),
  mix(9, 10, 6, 6),
  ['overlord', 'sniper', 'sniper', 'tank', 'tank'],
];
const FINAL_WAVE = WAVES.length;

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  BASE_FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  300
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
const hudScore = el('score');
const hudMult = el('mult');
const hudComboBar = el('combo-bar');
const hudWaveNum = el('wave-num');
const hudWaveInfo = el('wave-info');
const bossPanel = el('boss-panel');
const bossName = el('boss-name');
const bossBar = el('boss-bar');
const banner = el('banner');
const popup = el('popup');
const feed = el('feed');
const hitmarker = el('hitmarker');
const vignette = el('vignette');
const overlay = el('overlay');
const ovMsg = el('ov-msg');
const ovSub = el('ov-sub');
const ovTitle = overlay.querySelector('h1');
const ovPrompt = overlay.querySelector('.prompt');

// --- game state ---
let state = 'menu'; // menu | playing | paused | over
let waveNum = 0;
let waveState = 'idle'; // intermission | active
let interTimer = 0;
let score = 0;
let kills = 0;
let comboMult = 1;
let comboTimer = 0;
let ammo = MAG_SIZE;
let reloading = false;
let reloadTimer = 0;
let fireCooldown = 0;
let firing = false;
let hitmarkerTimer = 0;
let vignetteAlpha = 0;
let shake = 0;
let stepAcc = 0;
let heartbeatTimer = 0;

const BEST_KEY = 'minifps-best';
function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) || { score: 0, wave: 0 };
  } catch {
    return { score: 0, wave: 0 };
  }
}
function saveBest() {
  const best = loadBest();
  if (score > best.score) {
    localStorage.setItem(BEST_KEY, JSON.stringify({ score, wave: waveNum }));
  }
}

function addShake(amount) {
  shake = Math.min(1.6, shake + amount);
}

function showBanner(text, sub = '') {
  banner.innerHTML = `${text}${sub ? `<span>${sub}</span>` : ''}`;
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
}

function showPopup(text) {
  popup.textContent = text;
  popup.classList.remove('pop');
  void popup.offsetWidth;
  popup.classList.add('pop');
}

function addFeedLine(text) {
  const line = document.createElement('div');
  line.className = 'feed-line';
  line.textContent = text;
  feed.prepend(line);
  while (feed.children.length > 6) feed.lastChild.remove();
  setTimeout(() => line.remove(), 4000);
}

function showOverlay(title, msg, sub, prompt) {
  ovTitle.textContent = title;
  ovMsg.innerHTML = msg;
  ovSub.innerHTML = sub;
  ovPrompt.textContent = prompt;
  overlay.classList.remove('hidden');
}

function startGame() {
  player.reset();
  bots.clearAll();
  score = 0;
  kills = 0;
  comboMult = 1;
  comboTimer = 0;
  ammo = MAG_SIZE;
  reloading = false;
  fireCooldown = 0;
  firing = false;
  vignetteAlpha = 0;
  shake = 0;
  feed.innerHTML = '';
  state = 'playing';
  startWave(1);
}

function startWave(n) {
  waveNum = n;
  waveState = 'intermission';
  interTimer = 3;
  const isBoss = WAVES[n - 1].some((t) => BOT_TYPES[t].boss);
  showBanner(`WAVE ${n}`, isBoss ? '⚠ BOSS INCOMING ⚠' : '');
  if (isBoss) sounds.bossRoar();
  else sounds.waveStart();
}

function onWaveCleared() {
  const bonus = waveNum * 250;
  score += bonus;
  sounds.waveClear();
  player.health = player.maxHealth;
  if (waveNum >= FINAL_WAVE) {
    endGame(true);
  } else {
    showPopup(`WAVE CLEARED +${bonus}`);
    startWave(waveNum + 1);
  }
}

function endGame(won) {
  state = 'over';
  firing = false;
  saveBest();
  const best = loadBest();
  document.exitPointerLock();
  if (won) {
    sounds.victory();
    showOverlay(
      'VICTORY',
      `ALL ${FINAL_WAVE} WAVES CLEARED · SCORE ${score.toLocaleString()}`,
      `${kills} kills · best score ${Math.max(best.score, score).toLocaleString()}`,
      'CLICK TO PLAY AGAIN'
    );
  } else {
    showOverlay(
      'YOU DIED',
      `WAVE ${waveNum} · SCORE ${score.toLocaleString()}`,
      `${kills} kills · best score ${Math.max(best.score, score).toLocaleString()}`,
      'CLICK TO RETRY'
    );
  }
}

// --- pointer lock ---
const canvas = renderer.domElement;

overlay.addEventListener('click', () => {
  sounds.init();
  if (state === 'menu' || state === 'over') startGame();
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
      `WAVE ${waveNum} · SCORE ${score.toLocaleString()}`,
      'WASD move &middot; SHIFT sprint &middot; SPACE jump<br />CLICK shoot &middot; R reload &middot; jump to dodge boss slams',
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

// --- score ---
function addKill(bot, part) {
  kills++;
  let pts = bot.cfg.points;
  const tags = [];
  if (part === 'head') {
    pts *= 1.5;
    tags.push('HEADSHOT');
  }
  if (!player.onGround) {
    pts *= 2;
    tags.push('AIRBORNE');
  }
  comboMult = comboTimer > 0 ? Math.min(5, comboMult + 1) : 1;
  comboTimer = 4;
  const total = Math.round((pts * comboMult) / 10) * 10;
  score += total;
  showPopup(`+${total}${tags.length ? ' ' + tags.join(' ') : ''}${comboMult > 1 ? ` ×${comboMult}` : ''}`);
  addFeedLine(`${bot.type.toUpperCase()} +${total}`);
  sounds.kill();
  if (bot.cfg.boss) {
    addShake(1.5);
    showBanner(`${bot.cfg.name} DOWN`);
  }
}

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
  raycaster.far = 200;

  const hits = raycaster.intersectObjects([...bots.getTargets(), ...world.solids], false);
  const end = _origin.clone().addScaledVector(_dir, 150);
  if (hits.length) {
    end.copy(hits[0].point);
    const target = hits[0].object.userData;
    if (target && target.bot) {
      const dmg = target.part === 'head' ? HEAD_DAMAGE : BODY_DAMAGE;
      const died = bots.damage(target.bot, dmg);
      effects.spark(end, 0xff5555);
      hitmarkerTimer = 0.12;
      sounds.hit();
      if (died) addKill(target.bot, target.part);
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
bots.onBossEnraged = (bot) => {
  showBanner(`${bot.cfg.name} ENRAGED`, 'RUN.');
  addShake(1);
};

bots.onPlayerHit = (dmg, kind) => {
  vignetteAlpha = 0.85;
  addShake(kind === 'shock' ? 1.3 : kind === 'melee' ? 0.7 : 0.35 + dmg / 60);
  sounds.hurt();
  const dead = player.takeDamage(dmg);
  if (dead) endGame(false);
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
  hudScore.textContent = score.toLocaleString();
  hudMult.textContent = `×${comboMult}`;
  hudMult.className = comboMult > 1 ? `hot hot-${comboMult}` : '';
  hudComboBar.style.width = `${(comboTimer / 4) * 100}%`;

  hudWaveNum.textContent = `WAVE ${waveNum}`;
  if (waveState === 'intermission') {
    hudWaveInfo.textContent = `INCOMING ${Math.ceil(interTimer)}`;
  } else {
    hudWaveInfo.textContent = `ENEMIES ${bots.aliveCount()}`;
  }

  if (bots.boss && bots.boss.alive) {
    bossPanel.classList.remove('hidden');
    bossName.textContent = bots.boss.cfg.name;
    bossBar.style.width = `${(bots.boss.health / bots.boss.maxHealth) * 100}%`;
  } else {
    bossPanel.classList.add('hidden');
  }

  hitmarkerTimer = Math.max(0, hitmarkerTimer - dt);
  hitmarker.style.opacity = hitmarkerTimer > 0 ? '1' : '0';

  vignetteAlpha = Math.max(0, vignetteAlpha - dt * 1.6);
  let v = vignetteAlpha;
  if (state === 'playing' && player.health < 35) {
    v = Math.max(v, 0.3 + Math.sin(performance.now() / 160) * 0.12);
  }
  vignette.style.opacity = `${v}`;
}

// debug/testing handle
window.__game = {
  player, bots, camera,
  stats: () => ({
    state, waveState, wave: waveNum, score, mult: comboMult, kills,
    ammo, health: player.health, enemies: bots.aliveCount(),
  }),
  debug: {
    winWave() {
      bots.spawnQueue = [];
      for (const b of bots.bots) if (b.alive) bots.destroy(b);
    },
  },
};

// --- main loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    player.update(dt, world.obstacleBoxes);

    if (waveState === 'intermission') {
      interTimer -= dt;
      if (interTimer <= 0) {
        waveState = 'active';
        bots.startWave(WAVES[waveNum - 1], player.position);
      }
    } else if (waveState === 'active') {
      bots.update(dt, player, waveNum);
      if (bots.waveDone && state === 'playing') onWaveCleared();
    }

    fireCooldown -= dt;
    comboTimer = Math.max(0, comboTimer - dt);
    if (comboTimer === 0 && comboMult > 1) comboMult = 1;
    if (reloading) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) {
        reloading = false;
        ammo = MAG_SIZE;
      }
    }
    if (firing) tryShoot();
    updateGun(dt);

    // footsteps
    if (player.onGround && player.horizontalSpeed() > 1.5) {
      stepAcc += dt * player.horizontalSpeed();
      if (stepAcc > 3.2) {
        stepAcc = 0;
        sounds.footstep();
      }
    }

    // low-health heartbeat
    if (player.health < 35 && player.health > 0) {
      heartbeatTimer -= dt;
      if (heartbeatTimer <= 0) {
        heartbeatTimer = 0.95;
        sounds.heartbeat();
      }
    }
  }

  // screen shake — rotation-only so it can't disturb gameplay position
  if (shake > 0.01) {
    shake = Math.max(0, shake - dt * 2.4);
    camera.rotation.z = (Math.random() - 0.5) * 0.045 * shake;
    camera.fov = BASE_FOV + shake * 3;
    camera.updateProjectionMatrix();
  } else if (camera.rotation.z !== 0) {
    camera.rotation.z = 0;
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
  }

  effects.update(dt);
  updateHUD(dt);
  renderer.render(scene, camera);
});

// menu shows your best run
{
  const best = loadBest();
  if (best.score > 0) {
    ovMsg.innerHTML = `${FINAL_WAVE} waves. Four bosses. They shoot back.<br />BEST: ${best.score.toLocaleString()} (wave ${best.wave})`;
  }
}
