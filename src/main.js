import * as THREE from 'three';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { BotManager, BOT_TYPES } from './bots.js';
import { Effects } from './effects.js';
import { Sounds } from './sounds.js';
import { UPGRADES, TIERS, createStats, rollOffer } from './upgrades.js';

const MAG_SIZE = 10;
const FIRE_INTERVAL = 0.14;
const RELOAD_TIME = 1.1;
const BODY_DAMAGE = 34;
const HEAD_DAMAGE = 100;
const BASE_FOV = 75;
const LONGSHOT_DIST = 25;

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
const buildStrip = el('build');
const hitmarker = el('hitmarker');
const vignette = el('vignette');
const overlay = el('overlay');
const ovMsg = el('ov-msg');
const ovSub = el('ov-sub');
const ovTitle = overlay.querySelector('h1');
const ovPrompt = overlay.querySelector('.prompt');
const upgradeScreen = el('upgrade-screen');
const upgradeCards = el('upgrade-cards');

// --- game state ---
let state = 'menu'; // menu | playing | paused | over
let waveNum = 0;
let waveState = 'idle'; // intermission | active | upgrade
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

// --- roguelike run state ---
let stats = createStats();
const owned = new Map(); // upgrade id -> stacks
let secondWindUsed = false;
let adrenTimer = 0;
let invulnTimer = 0;

const magSize = () => {
  const m = MAG_SIZE + stats.magBonus;
  return stats.magCap ? Math.min(stats.magCap, m) : m;
};
const berserkActive = () =>
  stats.berserker && player.health < player.maxHealth * 0.3;
const ownedUniqueIds = () =>
  new Set(
    [...owned.keys()].filter((id) => UPGRADES.find((u) => u.id === id)?.unique)
  );

function syncStats() {
  const newMax = 100 + stats.maxHealthBonus;
  if (newMax > player.maxHealth) player.health += newMax - player.maxHealth;
  player.maxHealth = newMax;
  player.health = Math.min(player.health, newMax);
  player.jumpMult = stats.jumpMult;
  player.canDoubleJump = stats.doubleJump;
  player.regenDelay = stats.regenDelay;
  player.regenRate = stats.regenRate;
  ammo = Math.min(ammo, magSize());
}

function updateBuildStrip() {
  buildStrip.innerHTML = '';
  for (const [id, count] of owned) {
    const upg = UPGRADES.find((u) => u.id === id);
    if (!upg) continue;
    const span = document.createElement('span');
    span.className = 'build-item';
    span.style.borderColor = TIERS[upg.tier].color;
    span.style.color = TIERS[upg.tier].color;
    span.textContent = count > 1 ? `${upg.name} ×${count}` : upg.name;
    buildStrip.appendChild(span);
  }
}

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
  stats = createStats();
  owned.clear();
  secondWindUsed = false;
  adrenTimer = 0;
  invulnTimer = 0;
  player.maxHealth = 100;
  player.reset();
  syncStats();
  updateBuildStrip();
  bots.clearAll();
  score = 0;
  kills = 0;
  comboMult = 1;
  comboTimer = 0;
  ammo = magSize();
  reloading = false;
  fireCooldown = 0;
  firing = false;
  vignetteAlpha = 0;
  shake = 0;
  feed.innerHTML = '';
  upgradeScreen.classList.add('hidden');
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

// --- upgrade offers ---
function showUpgradeOffer() {
  waveState = 'upgrade';
  firing = false;
  const offer = rollOffer(waveNum, ownedUniqueIds());
  upgradeCards.innerHTML = '';
  for (const upg of offer) {
    const tier = TIERS[upg.tier];
    const count = owned.get(upg.id) || 0;
    const card = document.createElement('button');
    card.className = 'upgrade-card';
    card.style.borderColor = tier.color;
    card.style.boxShadow = `0 0 24px ${tier.color}33, inset 0 0 14px ${tier.color}14`;
    card.innerHTML =
      `<div class="tier-label" style="color:${tier.color}">${tier.label}</div>` +
      `<div class="upg-name">${upg.name}</div>` +
      `<div class="upg-desc">${upg.desc}</div>` +
      (count ? `<div class="upg-owned">owned ×${count}</div>` : '');
    card.onclick = () => pickUpgrade(upg);
    upgradeCards.appendChild(card);
  }
  upgradeScreen.classList.remove('hidden');
  document.exitPointerLock();
}

function pickUpgrade(upg) {
  upg.apply(stats);
  owned.set(upg.id, (owned.get(upg.id) || 0) + 1);
  syncStats();
  updateBuildStrip();
  addFeedLine(`${TIERS[upg.tier].label}: ${upg.name}`);
  sounds.pickup();
  upgradeScreen.classList.add('hidden');
  canvas.requestPointerLock();
  startWave(waveNum + 1);
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
    showUpgradeOffer();
  }
}

function endGame(won) {
  state = 'over';
  firing = false;
  saveBest();
  const best = loadBest();
  document.exitPointerLock();
  const buildSummary = [...owned.keys()].length
    ? `build: ${[...owned.entries()].map(([id, n]) => {
        const u = UPGRADES.find((x) => x.id === id);
        return n > 1 ? `${u.name} ×${n}` : u.name;
      }).join(' · ')}`
    : '';
  if (won) {
    sounds.victory();
    showOverlay(
      'VICTORY',
      `ALL ${FINAL_WAVE} WAVES CLEARED · SCORE ${score.toLocaleString()}`,
      `${kills} kills · best score ${Math.max(best.score, score).toLocaleString()}<br />${buildSummary}`,
      'CLICK TO PLAY AGAIN'
    );
  } else {
    showOverlay(
      'YOU DIED',
      `WAVE ${waveNum} · SCORE ${score.toLocaleString()}`,
      `${kills} kills · best score ${Math.max(best.score, score).toLocaleString()}<br />${buildSummary}`,
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
  if (!locked && state === 'playing' && waveState !== 'upgrade') {
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
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) player.wantJump = true;
  }
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
  comboMult = comboTimer > 0 ? Math.min(stats.comboMax, comboMult + 1) : 1;
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
const _botCenter = new THREE.Vector3();

function startReload() {
  if (reloading || ammo === magSize()) return;
  reloading = true;
  reloadTimer = RELOAD_TIME / stats.reloadMult;
  sounds.reload();
}

function shotDamage(part, dist, bot) {
  let dmg = part === 'head' ? HEAD_DAMAGE * stats.headshotMult : BODY_DAMAGE;
  dmg *= stats.damageMult;
  if (dist > LONGSHOT_DIST) dmg *= stats.longshotMult;
  if (bot && bot.health < bot.maxHealth * 0.3) dmg *= stats.executionerMult;
  if (berserkActive()) dmg *= 1.5;
  return Math.round(dmg);
}

// central damage funnel so pierce/splash kills trigger the same effects
function dealDamage(bot, dmg, part) {
  const died = bots.damage(bot, dmg);
  if (died) {
    addKill(bot, part);
    if (stats.killHeal) {
      player.health = Math.min(player.maxHealth, player.health + stats.killHeal);
    }
    if (stats.killAmmo) ammo = Math.min(magSize(), ammo + stats.killAmmo);
    if (stats.adrenaline) adrenTimer = 3;
  }
  return died;
}

function tryShoot() {
  if (fireCooldown > 0 || reloading) return;
  if (ammo <= 0) {
    sounds.empty();
    startReload();
    return;
  }
  fireCooldown = FIRE_INTERVAL / stats.fireRateMult;
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
  const struck = []; // {bot, part, point, dist} — one entry per bot
  const seen = new Set();
  for (const h of hits) {
    const ud = h.object.userData;
    if (ud && ud.bot) {
      if (!seen.has(ud.bot)) {
        seen.add(ud.bot);
        struck.push({ bot: ud.bot, part: ud.part, point: h.point, dist: h.distance });
      }
      if (!stats.pierce) {
        end.copy(h.point);
        break;
      }
    } else {
      end.copy(h.point);
      break;
    }
  }

  if (struck.length) {
    hitmarkerTimer = 0.12;
    sounds.hit();
    for (const s of struck) {
      effects.spark(s.point, 0xff5555);
      dealDamage(s.bot, shotDamage(s.part, s.dist, s.bot), s.part);
    }
  } else if (hits.length) {
    effects.spark(end, 0xccc9a8);
  }

  // explosive rounds: splash at the impact point
  if (stats.explosive) {
    effects.explosion(end, 0xff8833, 0.6);
    addShake(0.12);
    const splash = Math.round(BODY_DAMAGE * 0.5 * stats.damageMult);
    for (const b of bots.bots) {
      if (!b.alive || seen.has(b)) continue;
      _botCenter.copy(b.group.position);
      _botCenter.y += 0.9 * b.cfg.scale;
      if (_botCenter.distanceTo(end) < 3) dealDamage(b, splash, 'body');
    }
  }

  _muzzle.set(0, 0.03, -0.55);
  gun.localToWorld(_muzzle);
  effects.tracer(_muzzle, end);
  effects.flash(_muzzle);

  if (ammo === 0) startReload();
}

// --- bot damage callbacks ---
bots.onBossEnraged = (bot) => {
  showBanner(`${bot.cfg.name} ENRAGED`, 'RUN.');
  addShake(1);
};

bots.onPlayerHit = (dmg, kind) => {
  if (invulnTimer > 0) return;
  if (kind === 'shock' && stats.shockImmune) {
    addFeedLine('SLAM BLOCKED');
    return;
  }
  const final = Math.max(1, Math.round(dmg * (1 - stats.damageReduction)));
  vignetteAlpha = 0.85;
  addShake(kind === 'shock' ? 1.3 : kind === 'melee' ? 0.7 : 0.35 + final / 60);
  sounds.hurt();
  const dead = player.takeDamage(final);
  if (dead) {
    if (stats.secondWind && !secondWindUsed) {
      secondWindUsed = true;
      player.health = Math.round(player.maxHealth * 0.5);
      invulnTimer = 1.5;
      showBanner('SECOND WIND', 'DEATH REFUSED');
      effects.explosion(player.position.clone(), 0xffd36b, 1.5);
      sounds.bossRoar();
      return;
    }
    endGame(false);
  }
};

player.onAirJump = () => {
  effects.burst(
    new THREE.Vector3(player.position.x, player.position.y - 1.5, player.position.z),
    0x9fd8ff, 10, 3, 0.3
  );
  sounds.waveStart();
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
    player.health > player.maxHealth * 0.4
      ? 'linear-gradient(90deg, #37d67a, #7ce7a5)'
      : 'linear-gradient(90deg, #d63737, #e77c7c)';
  hudAmmo.textContent = reloading ? '···' : `${ammo}`;
  hudScore.textContent = score.toLocaleString();
  hudMult.textContent = `×${comboMult}`;
  hudMult.className = comboMult > 1 ? `hot hot-${Math.min(comboMult, 5)}` : '';
  hudComboBar.style.width = `${(comboTimer / 4) * 100}%`;

  hudWaveNum.textContent = `WAVE ${waveNum}`;
  if (waveState === 'intermission') {
    hudWaveInfo.textContent = `INCOMING ${Math.ceil(interTimer)}`;
  } else if (waveState === 'upgrade') {
    hudWaveInfo.textContent = 'CHOOSE UPGRADE';
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
  if (state === 'playing' && player.health < player.maxHealth * 0.35) {
    v = Math.max(v, 0.3 + Math.sin(performance.now() / 160) * 0.12);
  }
  vignette.style.opacity = `${v}`;
}

// debug/testing handle
window.__game = {
  player, bots, camera,
  get stats_() { return stats; },
  owned,
  stats: () => ({
    state, waveState, wave: waveNum, score, mult: comboMult, kills,
    ammo, mag: magSize(), health: player.health, maxHealth: player.maxHealth,
    enemies: bots.aliveCount(),
  }),
  debug: {
    winWave() {
      bots.spawnQueue = [];
      for (const b of bots.bots) if (b.alive) bots.destroy(b);
    },
    give(id) {
      const upg = UPGRADES.find((u) => u.id === id);
      if (!upg) return false;
      upg.apply(stats);
      owned.set(id, (owned.get(id) || 0) + 1);
      syncStats();
      updateBuildStrip();
      return true;
    },
    roll: (w) => rollOffer(w ?? waveNum, ownedUniqueIds()).map((u) => ({ id: u.id, tier: u.tier })),
  },
};

// --- main loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    adrenTimer = Math.max(0, adrenTimer - dt);
    invulnTimer = Math.max(0, invulnTimer - dt);
    player.dynamicSpeedMult =
      stats.speedMult *
      (adrenTimer > 0 ? 1 + 0.25 * stats.adrenaline : 1) *
      (berserkActive() ? 1.25 : 1);

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
        ammo = magSize();
      }
    }
    if (firing && waveState !== 'upgrade') tryShoot();
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
    if (player.health < player.maxHealth * 0.35 && player.health > 0) {
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
