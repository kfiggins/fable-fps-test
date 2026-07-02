import * as THREE from 'three';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { BotManager, BOT_TYPES } from './bots.js';
import { Effects } from './effects.js';
import { Sounds } from './sounds.js';
import { UPGRADES, TIERS, createStats, rollOffer } from './upgrades.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { GrenadeManager } from './grenades.js';

const BASE_FOV = 75;
const LONGSHOT_DIST = 25;
const GRENADE_DROP_CHANCE = 0.08;
const GRENADE_MAX = 5;
const GRENADE_RADIUS = 6;
const BOSS_WAVES = [5, 10, 15];

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
const grenades = new GrenadeManager(scene, effects, sounds);

// --- weapon viewmodels ---
const gunMat = new THREE.MeshStandardMaterial({ color: 0x2f3138, roughness: 0.5, metalness: 0.4 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4326, roughness: 0.7 });

function buildViewmodel(id) {
  const g = new THREE.Group();
  if (id === 'rifle') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.5), gunMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 10), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.38);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), gunMat);
    grip.position.set(0, -0.13, 0.14);
    grip.rotation.x = 0.25;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), gunMat);
    sight.position.set(0, 0.1, -0.18);
    g.add(body, barrel, grip, sight);
  } else if (id === 'shotgun') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.42), woodMat);
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 10), gunMat);
    b1.rotation.x = Math.PI / 2;
    b1.position.set(-0.033, 0.05, -0.36);
    const b2 = b1.clone();
    b2.position.x = 0.033;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.11), woodMat);
    grip.position.set(0, -0.13, 0.15);
    grip.rotation.x = 0.3;
    g.add(body, b1, b2, grip);
  } else if (id === 'marksman') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.62), gunMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 10), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.52);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), gunMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.11, -0.1);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), woodMat);
    grip.position.set(0, -0.13, 0.16);
    grip.rotation.x = 0.25;
    g.add(body, barrel, scope, grip);
  } else {
    // smg
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.3), gunMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 10), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.22);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.09), gunMat);
    mag.position.set(0, -0.15, 0.0);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.09), gunMat);
    grip.position.set(0, -0.11, 0.12);
    grip.rotation.x = 0.25;
    g.add(body, barrel, mag, grip);
  }
  g.position.set(0.24, -0.22, -0.5);
  g.visible = false;
  camera.add(g);
  return g;
}
const viewmodels = Object.fromEntries(WEAPON_ORDER.map((id) => [id, buildViewmodel(id)]));
const GUN_BASE = new THREE.Vector3(0.24, -0.22, -0.5);
let gunKick = 0;
let bobTime = 0;

// --- HUD elements ---
const el = (id) => document.getElementById(id);
const hudHealth = el('health-bar');
const hudAmmo = el('ammo');
const hudWeaponLabel = el('ammo-label');
const hudGrenades = el('grenades');
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
const upgradeTitle = el('upgrade-title');
const upgradeCards = el('upgrade-cards');
const scopeOverlay = el('scope');
const crosshair = el('crosshair');

// --- game state ---
let state = 'menu'; // menu | playing | paused | over
let waveNum = 0;
let waveState = 'idle'; // intermission | active | upgrade
let interTimer = 0;
let score = 0;
let kills = 0;
let comboMult = 1;
let comboTimer = 0;
let reloading = false;
let reloadTimer = 0;
let fireCooldown = 0;
let firing = false;
let hitmarkerTimer = 0;
let vignetteAlpha = 0;
let shake = 0;
let stepAcc = 0;
let heartbeatTimer = 0;
let aiming = false; // right mouse held
let adsT = 0; // 0 = hip, 1 = fully aimed (smoothed)
let fovCurrent = BASE_FOV;

// --- roguelike run state ---
let stats = createStats();
const owned = new Map(); // upgrade id -> stacks
let secondWindUsed = false;
let adrenTimer = 0;
let invulnTimer = 0;
let shotCounter = 0; // double tap
let streakCounter = 0; // kill streak

// --- weapons / grenades run state ---
let ownedWeapons = ['rifle'];
let currentWeaponId = 'rifle';
const weaponAmmo = { rifle: WEAPONS.rifle.mag };
let grenadeCount = 1;
let grenadeCd = 0;

const weapon = () => WEAPONS[currentWeaponId];
const magSize = (w = weapon()) => {
  const m = w.mag + stats.magBonus;
  return stats.magCap ? Math.min(stats.magCap, m) : m;
};
const ammo = () => weaponAmmo[currentWeaponId];
const setAmmo = (v) => { weaponAmmo[currentWeaponId] = v; };
const berserkActive = () =>
  stats.berserker && player.health < player.maxHealth * 0.3;
const ownedUniqueIds = () =>
  new Set(
    [...owned.keys()].filter((id) => UPGRADES.find((u) => u.id === id)?.unique)
  );

function switchWeapon(id) {
  if (!ownedWeapons.includes(id) || id === currentWeaponId) return;
  viewmodels[currentWeaponId].visible = false;
  currentWeaponId = id;
  viewmodels[id].visible = true;
  reloading = false;
  fireCooldown = Math.max(fireCooldown, 0.25);
  sounds.reload();
}

function syncStats() {
  const newMax = 100 + stats.maxHealthBonus;
  if (newMax > player.maxHealth) player.health += newMax - player.maxHealth;
  player.maxHealth = newMax;
  player.health = Math.min(player.health, newMax);
  player.jumpMult = stats.jumpMult;
  player.canDoubleJump = stats.doubleJump;
  player.regenDelay = stats.regenDelay;
  player.regenRate = stats.regenRate;
  for (const id of ownedWeapons) {
    weaponAmmo[id] = Math.min(weaponAmmo[id], magSize(WEAPONS[id]));
  }
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
  shotCounter = 0;
  streakCounter = 0;
  ownedWeapons = ['rifle'];
  for (const id of Object.keys(weaponAmmo)) delete weaponAmmo[id];
  weaponAmmo.rifle = WEAPONS.rifle.mag;
  viewmodels[currentWeaponId].visible = false;
  currentWeaponId = 'rifle';
  viewmodels.rifle.visible = true;
  grenadeCount = 1;
  grenadeCd = 0;
  grenades.clear();
  player.maxHealth = 100;
  player.reset();
  syncStats();
  updateBuildStrip();
  bots.clearAll();
  score = 0;
  kills = 0;
  comboMult = 1;
  comboTimer = 0;
  reloading = false;
  fireCooldown = 0;
  firing = false;
  aiming = false;
  adsT = 0;
  fovCurrent = BASE_FOV;
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

// --- upgrade / weapon offers ---
function makeCard({ label, color, name, desc, footer, onPick }) {
  const card = document.createElement('button');
  card.className = 'upgrade-card';
  card.style.borderColor = color;
  card.style.boxShadow = `0 0 24px ${color}33, inset 0 0 14px ${color}14`;
  card.innerHTML =
    `<div class="tier-label" style="color:${color}">${label}</div>` +
    `<div class="upg-name">${name}</div>` +
    `<div class="upg-desc">${desc}</div>` +
    (footer ? `<div class="upg-owned">${footer}</div>` : '');
  card.onclick = onPick;
  upgradeCards.appendChild(card);
}

function showUpgradeOffer() {
  waveState = 'upgrade';
  firing = false;
  upgradeTitle.textContent = 'CHOOSE AN UPGRADE';
  const offer = rollOffer(waveNum, ownedUniqueIds(), stats.offerSize);
  upgradeCards.innerHTML = '';
  for (const upg of offer) {
    const tier = TIERS[upg.tier];
    const count = owned.get(upg.id) || 0;
    makeCard({
      label: tier.label,
      color: tier.color,
      name: upg.name,
      desc: upg.desc,
      footer: count ? `owned ×${count}` : '',
      onPick: () => pickUpgrade(upg),
    });
  }
  upgradeScreen.classList.remove('hidden');
  document.exitPointerLock();
}

function showWeaponOffer() {
  waveState = 'upgrade';
  firing = false;
  upgradeTitle.textContent = 'BOSS DOWN — CLAIM A WEAPON';
  upgradeCards.innerHTML = '';
  for (const id of WEAPON_ORDER) {
    if (ownedWeapons.includes(id)) continue;
    const w = WEAPONS[id];
    makeCard({
      label: 'WEAPON',
      color: '#ff6b6b',
      name: w.name,
      desc: w.desc,
      footer: `${w.mag} rounds · press ${WEAPON_ORDER.indexOf(id) + 1} or Q`,
      onPick: () => pickWeapon(id),
    });
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

function pickWeapon(id) {
  ownedWeapons.push(id);
  weaponAmmo[id] = magSize(WEAPONS[id]);
  switchWeapon(id);
  addFeedLine(`WEAPON: ${WEAPONS[id].name}`);
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
    return;
  }
  showPopup(`WAVE CLEARED +${bonus}`);
  const weaponsLeft = WEAPON_ORDER.some((id) => !ownedWeapons.includes(id));
  if (BOSS_WAVES.includes(waveNum) && weaponsLeft) showWeaponOffer();
  else showUpgradeOffer();
}

function endGame(won) {
  state = 'over';
  firing = false;
  aiming = false;
  adsT = 0;
  fovCurrent = BASE_FOV;
  scopeOverlay.style.opacity = '0';
  crosshair.style.opacity = '1';
  viewmodels[currentWeaponId].visible = true;
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
      'WASD move &middot; SHIFT sprint &middot; SPACE jump &middot; G grenade<br />Q / 1-4 switch weapon &middot; R reload &middot; jump to dodge boss slams',
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
  if (state === 'playing' && document.pointerLockElement === canvas) {
    if (e.button === 0) firing = true;
    if (e.button === 2) aiming = true;
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) aiming = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  player.keys[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) player.wantJump = true;
  }
  if (state !== 'playing') return;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'KeyQ') {
    const idx = ownedWeapons.indexOf(currentWeaponId);
    switchWeapon(ownedWeapons[(idx + 1) % ownedWeapons.length]);
  }
  if (/^Digit[1-4]$/.test(e.code)) {
    const id = WEAPON_ORDER[Number(e.code.slice(5)) - 1];
    if (id) switchWeapon(id);
  }
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
  const total = Math.round((pts * comboMult * stats.scoreMult) / 10) * 10;
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
const _pelletDir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _botCenter = new THREE.Vector3();

function startReload() {
  if (reloading || ammo() === magSize()) return;
  if (stats.instantReload) {
    setAmmo(magSize());
    sounds.reload();
    return;
  }
  reloading = true;
  reloadTimer = weapon().reload / stats.reloadMult;
  sounds.reload();
}

function shotDamage(part, dist, bot) {
  const w = weapon();
  let dmg = part === 'head' ? w.head * stats.headshotMult : w.body;
  dmg *= stats.damageMult;
  if (w.falloffStart && dist > w.falloffStart) {
    const t = (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart);
    dmg *= Math.max(w.falloffMin, 1 - t * (1 - w.falloffMin));
  }
  if (dist > LONGSHOT_DIST) dmg *= stats.longshotMult;
  if (bot && bot.health < bot.maxHealth * 0.3) dmg *= stats.executionerMult;
  if (bot && bot.cfg.boss) dmg *= stats.bossSlayer;
  if (berserkActive()) dmg *= 1.5;
  if (player.position.y - 1.7 > 0.9) dmg *= stats.highGround; // elevated
  return Math.round(dmg);
}

// central damage funnel so pierce/splash/grenade/chain kills all behave the same
function dealDamage(bot, dmg, part, depth = 0) {
  const wasBoss = bot.cfg.boss;
  const pos = bot.group.position.clone();
  const died = bots.damage(bot, dmg);
  if (died) {
    addKill(bot, part);
    if (stats.killHeal) {
      player.health = Math.min(player.maxHealth, player.health + stats.killHeal);
    }
    if (stats.killAmmo) setAmmo(Math.min(magSize(), ammo() + stats.killAmmo));
    if (stats.adrenaline) adrenTimer = 3;
    if (stats.killStreak) {
      streakCounter++;
      if (streakCounter >= 5) {
        streakCounter = 0;
        setAmmo(magSize());
        addFeedLine('KILL STREAK — MAG REFILLED');
        sounds.reload();
      }
    }
    // grenade drops: bosses always drop 2, everyone else rolls the dice
    if (wasBoss) {
      grenades.spawnPickup(pos);
      grenades.spawnPickup({ x: pos.x + 1.5, z: pos.z + 1.5 });
    } else if (Math.random() < GRENADE_DROP_CHANCE) {
      grenades.spawnPickup(pos);
    }
    // chain lightning arcs once per original kill
    if (stats.chainLightning && depth === 0) {
      let best = null;
      let bestD = 8;
      for (const b of bots.bots) {
        if (!b.alive || b === bot) continue;
        const d = b.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) {
        const from = pos.clone();
        from.y += 1;
        const to = best.group.position.clone();
        to.y += 1 * best.cfg.scale;
        effects.tracer(from, to, 0x66ddff);
        effects.spark(to, 0x66ddff);
        dealDamage(best, 40, 'body', 1);
      }
    }
  }
  return died;
}

function fireRay(dir, seenAll) {
  raycaster.set(_origin, dir);
  raycaster.far = 200;
  const hits = raycaster.intersectObjects([...bots.getTargets(), ...world.solids], false);
  const end = _origin.clone().addScaledVector(dir, 150);
  const struck = [];
  const seen = new Set();
  for (const h of hits) {
    const ud = h.object.userData;
    if (ud && ud.bot) {
      if (!seen.has(ud.bot)) {
        seen.add(ud.bot);
        seenAll.add(ud.bot);
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
  return { struck, end };
}

function tryShoot() {
  if (fireCooldown > 0 || reloading) return;
  const w = weapon();
  if (ammo() <= 0) {
    sounds.empty();
    startReload();
    return;
  }
  fireCooldown = w.interval / stats.fireRateMult;
  shotCounter++;
  const freeShot = stats.doubleTap && shotCounter % 4 === 0;
  if (!freeShot) setAmmo(ammo() - 1);
  gunKick = 1;
  sounds[w.sound]();

  camera.updateMatrixWorld(true);
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);

  _muzzle.set(0, 0.03, -0.55);
  viewmodels[currentWeaponId].localToWorld(_muzzle);

  const seenAll = new Set();
  let anyHit = false;
  let firstEnd = null;
  for (let p = 0; p < w.pellets; p++) {
    _pelletDir.copy(_dir);
    const spread = w.spread;
    if (spread) {
      _pelletDir.x += (Math.random() - 0.5) * 2 * spread;
      _pelletDir.y += (Math.random() - 0.5) * 2 * spread;
      _pelletDir.z += (Math.random() - 0.5) * 2 * spread;
      _pelletDir.normalize();
    }
    const { struck, end } = fireRay(_pelletDir, seenAll);
    if (!firstEnd) firstEnd = end;
    if (struck.length) {
      anyHit = true;
      for (const s of struck) {
        effects.spark(s.point, 0xff5555);
        dealDamage(s.bot, shotDamage(s.part, s.dist, s.bot), s.part);
      }
    } else {
      effects.spark(end, 0xccc9a8);
    }
    effects.tracer(_muzzle, end);
  }
  if (anyHit) {
    hitmarkerTimer = 0.12;
    sounds.hit();
  }

  // explosive rounds: one splash per trigger pull, at the first pellet's impact
  if (stats.explosive && firstEnd) {
    effects.explosion(firstEnd, 0xff8833, 0.6);
    addShake(0.12);
    const splash = Math.round(w.body * 0.5 * stats.damageMult);
    for (const b of bots.bots) {
      if (!b.alive || seenAll.has(b)) continue;
      _botCenter.copy(b.group.position);
      _botCenter.y += 0.9 * b.cfg.scale;
      if (_botCenter.distanceTo(firstEnd) < 3) dealDamage(b, splash, 'body');
    }
  }

  effects.flash(_muzzle);
  if (ammo() === 0) startReload();
}

// --- grenades ---
function throwGrenade() {
  if (grenadeCount <= 0 || grenadeCd > 0 || waveState === 'upgrade') return;
  grenadeCount--;
  grenadeCd = 0.5;
  grenades.throwFrom(camera);
  sounds.empty();
}

function explodeGrenade(pos) {
  effects.explosion(pos, 0xffaa22, 1.8);
  effects.shockwave(pos, GRENADE_RADIUS, 0xffaa44);
  addShake(0.9);
  sounds.explosionBig();
  for (const b of bots.bots) {
    if (!b.alive) continue;
    _botCenter.copy(b.group.position);
    _botCenter.y += 0.9 * b.cfg.scale;
    const d = _botCenter.distanceTo(pos);
    if (d < GRENADE_RADIUS) {
      const dmg = Math.round(120 * (1 - (0.6 * d) / GRENADE_RADIUS));
      dealDamage(b, dmg, 'body');
    }
  }
}

// --- bot damage callbacks ---
bots.onBossEnraged = (bot) => {
  showBanner(`${bot.cfg.name} ENRAGED`, 'RUN.');
  addShake(1);
};

bots.onPlayerHit = (dmg, kind, sourceBot) => {
  if (invulnTimer > 0) return;
  if (kind === 'shock' && stats.shockImmune) {
    addFeedLine('SLAM BLOCKED');
    return;
  }
  if (kind === 'melee' && stats.thorns && sourceBot) {
    dealDamage(sourceBot, stats.thorns, 'body');
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

// --- gun animation + aim-down-sights ---
function updateGun(dt) {
  const w = weapon();
  const wantAds = aiming && !!w.zoomFov && state === 'playing' && waveState !== 'upgrade';
  adsT += ((wantAds ? 1 : 0) - adsT) * Math.min(1, dt * 12);

  gunKick = Math.max(0, gunKick - dt * 9);
  bobTime += dt * Math.min(1, player.horizontalSpeed() / 5);
  const bobScale = 1 - adsT * 0.8;
  const bob = Math.sin(bobTime * 9) * 0.008 * bobScale;
  const gun = viewmodels[currentWeaponId];

  const hipX = GUN_BASE.x + Math.cos(bobTime * 4.5) * 0.004 * bobScale;
  const hipY = GUN_BASE.y + bob;
  const hipZ = GUN_BASE.z + gunKick * 0.07;
  if (w.adsPos && adsT > 0.01) {
    gun.position.set(
      hipX + (w.adsPos[0] - hipX) * adsT,
      hipY + (w.adsPos[1] - hipY) * adsT,
      hipZ + (w.adsPos[2] + gunKick * 0.05 - hipZ) * adsT
    );
  } else {
    gun.position.set(hipX, hipY, hipZ);
  }
  gun.rotation.x = gunKick * 0.14;

  // scoped weapons hide the viewmodel and show the scope overlay instead
  const scoped = w.scope && adsT > 0.5;
  gun.visible = !scoped;
  scopeOverlay.style.opacity = w.scope ? `${Math.max(0, (adsT - 0.5) * 2)}` : '0';
  crosshair.style.opacity = scoped ? '0' : '1';

  // zoom: lerp FOV toward the weapon's ADS FOV, scale mouse sensitivity with it
  const targetFov = BASE_FOV + ((w.zoomFov ?? BASE_FOV) - BASE_FOV) * adsT;
  fovCurrent += (targetFov - fovCurrent) * Math.min(1, dt * 14);
  player.lookScale = Math.max(0.2, fovCurrent / BASE_FOV);
}

// --- HUD ---
function updateHUD(dt) {
  hudHealth.style.width = `${(player.health / player.maxHealth) * 100}%`;
  hudHealth.style.background =
    player.health > player.maxHealth * 0.4
      ? 'linear-gradient(90deg, #37d67a, #7ce7a5)'
      : 'linear-gradient(90deg, #d63737, #e77c7c)';
  hudAmmo.textContent = reloading ? '···' : `${ammo()}`;
  hudWeaponLabel.textContent = `${weapon().name} · R RELOAD`;
  hudGrenades.textContent = `GRENADES ×${grenadeCount} · G THROW`;
  hudScore.textContent = score.toLocaleString();
  hudMult.textContent = `×${comboMult}`;
  hudMult.className = comboMult > 1 ? `hot hot-${Math.min(comboMult, 5)}` : '';
  hudComboBar.style.width = `${(comboTimer / 4) * 100}%`;

  hudWaveNum.textContent = `WAVE ${waveNum}`;
  if (waveState === 'intermission') {
    hudWaveInfo.textContent = `INCOMING ${Math.ceil(interTimer)}`;
  } else if (waveState === 'upgrade') {
    hudWaveInfo.textContent = 'CHOOSE';
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
  player, bots, camera, grenades,
  get stats_() { return stats; },
  owned,
  stats: () => ({
    state, waveState, wave: waveNum, score, mult: comboMult, kills,
    ammo: ammo(), mag: magSize(), weapon: currentWeaponId,
    weapons: [...ownedWeapons], grenades: grenadeCount,
    health: player.health, maxHealth: player.maxHealth,
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
    giveWeapon(id) {
      if (!WEAPONS[id] || ownedWeapons.includes(id)) return false;
      ownedWeapons.push(id);
      weaponAmmo[id] = magSize(WEAPONS[id]);
      return true;
    },
    grenades(n) { grenadeCount = n; },
    roll: (w) => rollOffer(w ?? waveNum, ownedUniqueIds(), stats.offerSize).map((u) => ({ id: u.id, tier: u.tier })),
  },
};

// --- main loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    adrenTimer = Math.max(0, adrenTimer - dt);
    invulnTimer = Math.max(0, invulnTimer - dt);
    grenadeCd = Math.max(0, grenadeCd - dt);
    player.dynamicSpeedMult =
      stats.speedMult *
      (adrenTimer > 0 ? 1 + 0.25 * stats.adrenaline : 1) *
      (berserkActive() ? 1.25 : 1) *
      (1 - adsT * 0.4); // aiming slows you down

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

    grenades.update(
      dt,
      player.position,
      world.obstacleBoxes,
      () => {
        if (grenadeCount >= GRENADE_MAX) return false;
        grenadeCount++;
        addFeedLine('GRENADE +1');
        sounds.pickup();
        return true;
      },
      explodeGrenade
    );

    fireCooldown -= dt;
    comboTimer = Math.max(0, comboTimer - dt);
    if (comboTimer === 0 && comboMult > 1) comboMult = 1;
    if (reloading) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) {
        reloading = false;
        setAmmo(magSize());
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

  // screen shake (rotation-only) + ADS zoom share the FOV
  shake = Math.max(0, shake - dt * 2.4);
  camera.rotation.z = shake > 0.01 ? (Math.random() - 0.5) * 0.045 * shake : 0;
  const finalFov = fovCurrent + shake * 3;
  if (Math.abs(camera.fov - finalFov) > 0.01) {
    camera.fov = finalFov;
    camera.updateProjectionMatrix();
  }

  effects.update(dt);
  updateHUD(dt);
  renderer.render(scene, camera);
});

// initial weapon visible + menu shows your best run
viewmodels.rifle.visible = true;
{
  const best = loadBest();
  if (best.score > 0) {
    ovMsg.innerHTML = `${FINAL_WAVE} waves. Four bosses. They shoot back.<br />BEST: ${best.score.toLocaleString()} (wave ${best.wave})`;
  }
}
