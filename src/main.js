import * as THREE from 'three';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { BotManager, BOT_TYPES } from './bots.js';
import { Effects } from './effects.js';
import { Sounds } from './sounds.js';
import { UPGRADES, TIERS, createStats, rollOffer, tierWeights } from './upgrades.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { GrenadeManager } from './grenades.js';
import { DroneManager, DRONE_MAX } from './drone.js';
import { ABILITIES, AbilityManager } from './abilities.js';
import { MECH, MECH_ABILITIES, MechManager } from './mech.js';

const BASE_FOV = 75;
const LONGSHOT_DIST = 25;
const GRENADE_DROP_CHANCE = 0.08;
const SCRAP_DROP_CHANCE = 0.45;
const GRENADE_MAX = 5;
const GRENADE_RADIUS = 6;
const BOSS_WAVES = [5, 10, 15, 20, 25];
const COST_REROLL = 75;
const COST_GRENADE = 30;
const COST_DRONE = 125;
const COST_JETPACK = 300;
const COST_JET_UP = 150;
const JET_UP_MAX = 3;
const COST_ARMOR = 25;
const ARMOR_PER_BAR = 25;
const ARMOR_MAX = ARMOR_PER_BAR * 4;
const COST_DRONE_RATE = 150;
const DRONE_RATE_MAX = 3;
const COST_DRONE_TWIN = 250;
const COST_COLLECTOR = 300;
const COST_COLLECTOR_SPEED = 150;
const COLLECTOR_SPEED_MAX = 3;

// --- maps & unlocks ---
function fnv(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
const unlockSig = () => fnv('mfps-unlock-foundry|q7k2z');
function foundryUnlocked() {
  try {
    return localStorage.getItem('minifps-unlock2') === unlockSig();
  } catch {
    return false;
  }
}
const MAP_ID = (() => {
  try {
    const m = localStorage.getItem('minifps-map');
    return m === 'foundry' && foundryUnlocked() ? 'foundry' : 'arena';
  } catch {
    return 'arena';
  }
})();

function mix(g, r, s, t, w = 0, sc = 0, sl = 0) {
  return [
    ...Array(g).fill('grunt'),
    ...Array(r).fill('rusher'),
    ...Array(s).fill('sniper'),
    ...Array(t).fill('tank'),
    ...Array(w).fill('wasp'),
    ...Array(sc).fill('scorcher'),
    ...Array(sl).fill('slag'),
  ];
}
const WAVES_ARENA = [
  mix(4, 0, 0, 0),
  mix(5, 2, 0, 0),
  mix(4, 3, 2, 0),
  mix(4, 3, 2, 2),
  ['warden', 'rusher', 'rusher'],
  mix(6, 4, 2, 2, 2),
  mix(5, 4, 3, 3, 2),
  mix(4, 6, 4, 3, 3),
  mix(6, 5, 4, 4, 3),
  ['titan', 'grunt', 'grunt', 'sniper', 'sniper'],
  mix(6, 5, 3, 3, 2),
  mix(6, 6, 4, 3, 3),
  mix(7, 6, 4, 4, 3),
  mix(6, 8, 5, 4, 4),
  ['butcher', 'rusher', 'rusher', 'tank', 'wasp', 'wasp'],
  mix(8, 7, 5, 4, 4),
  mix(8, 8, 5, 5, 4),
  mix(8, 9, 6, 5, 5),
  mix(9, 10, 6, 6, 5),
  ['overlord', 'sniper', 'sniper', 'tank', 'tank'],
  mix(8, 8, 5, 5, 4),
  mix(9, 9, 6, 5, 5),
  mix(9, 10, 6, 6, 5),
  mix(10, 10, 7, 6, 6),
  ['phantom', 'sniper', 'sniper', 'rusher', 'rusher', 'wasp', 'wasp'],
  mix(10, 11, 7, 6, 5),
  mix(10, 12, 7, 7, 6),
  mix(11, 12, 8, 7, 6),
  mix(12, 13, 8, 8, 7),
  ['apex', 'tank', 'tank', 'sniper', 'sniper', 'rusher', 'rusher', 'wasp', 'wasp'],
];

const WAVES_FOUNDRY = [
  mix(5, 2, 0, 0, 0, 1, 0),
  mix(5, 3, 1, 0, 0, 2, 0),
  mix(5, 3, 2, 1, 1, 2, 1),
  mix(6, 4, 2, 2, 2, 2, 1),
  ['smelter', 'rusher', 'rusher', 'scorcher'],
  mix(6, 5, 3, 2, 2, 2, 2),
  mix(6, 5, 3, 3, 3, 3, 2),
  mix(7, 6, 4, 3, 3, 3, 2),
  mix(7, 6, 4, 4, 4, 3, 3),
  ['forgemaster', 'wasp', 'wasp', 'slag'],
  mix(8, 7, 4, 4, 4, 3, 3),
  mix(8, 7, 5, 4, 4, 4, 3),
  mix(9, 8, 5, 5, 5, 4, 3),
  mix(9, 8, 5, 5, 5, 4, 4),
  ['vulcan', 'sniper', 'sniper', 'scorcher', 'scorcher'],
  mix(10, 9, 5, 5, 5, 4, 4),
  mix(10, 9, 6, 6, 6, 4, 4),
  mix(10, 10, 6, 6, 6, 5, 4),
  mix(11, 10, 6, 6, 6, 5, 4),
  ['golem', 'slag', 'slag', 'tank', 'tank'],
  mix(11, 10, 6, 6, 7, 5, 4),
  mix(11, 11, 7, 6, 7, 5, 4),
  mix(11, 11, 7, 7, 7, 5, 5),
  mix(12, 11, 7, 7, 7, 5, 5),
  ['scorchtwin', 'slagtwin', 'wasp', 'wasp', 'rusher', 'rusher'],
  mix(12, 12, 7, 7, 8, 6, 5),
  mix(12, 12, 8, 8, 8, 6, 5),
  mix(13, 12, 8, 8, 8, 6, 6),
  mix(13, 13, 8, 8, 9, 6, 6),
  ['omegaforge', 'scorcher', 'scorcher', 'slag', 'slag', 'wasp', 'wasp'],
];

const MAPS = {
  arena: {
    name: 'THE ARENA', waves: WAVES_ARENA,
    eliteFrom: 16, mutatorChance: 0.25, diff: 1, bestKey: 'minifps-best',
  },
  foundry: {
    name: 'THE FOUNDRY', waves: WAVES_FOUNDRY,
    eliteFrom: 10, mutatorChance: 0.4, diff: 1.25, bestKey: 'minifps-best-foundry',
  },
};
const MAP = MAPS[MAP_ID];
const WAVES = MAP.waves;
const FINAL_WAVE = WAVES.length;

// --- difficulty: NORMAL is the real game; EASY is for the kids ---
const DIFFS = {
  normal: { label: 'NORMAL', enemyDmg: 1, enemyHp: 1, enemySpeed: 1, accuracy: 1, bestSuffix: '' },
  easy: { label: 'EASY', enemyDmg: 0.45, enemyHp: 0.7, enemySpeed: 0.85, accuracy: 0.7, bestSuffix: '-easy' },
};
let diffId = (() => {
  try {
    const d = localStorage.getItem('minifps-diff');
    return DIFFS[d] ? d : 'normal';
  } catch {
    return 'normal';
  }
})();
const DIFF = () => DIFFS[diffId];

// wave mutators: occasional non-boss waves play by different rules
const MUTATORS = {
  fog: { label: 'FOG', sub: '☁ FOG — THEY CLOSE IN UNSEEN' },
  frenzy: { label: 'FRENZY', sub: '⚡ FRENZY — FASTER ENEMIES, DOUBLE SCRAP' },
  blackout: { label: 'BLACKOUT', sub: '🌙 BLACKOUT — WATCH FOR THE VISORS' },
};

// scrap dropped per kill (when the roll hits)
const SCRAP_VALUES = { grunt: 10, rusher: 12, sniper: 15, tank: 25, wasp: 12, scorcher: 18, slag: 20 };
const SCRAP_BOSS = 150;

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

const world = createWorld(scene, MAP_ID);
// snapshot this map's lighting so mutators can restore it faithfully
const ENV = {
  bg: scene.background.getHex(),
  fogColor: scene.fog.color.getHex(),
  fogNear: scene.fog.near,
  fogFar: scene.fog.far,
  hemi: world.hemi.intensity,
  sun: world.sun.intensity,
};
const player = new Player(camera);
player.spawn = world.playerSpawn;
player.reset();
const effects = new Effects(scene);
const sounds = new Sounds();
const bots = new BotManager(scene, world, effects, sounds);
const grenades = new GrenadeManager(scene, effects, sounds);
const drones = new DroneManager(scene, world.occluders, effects, sounds);
drones.heal = (amt) => { player.health = Math.min(healCap(), player.health + amt); };
const abilities = new AbilityManager({
  scene, camera, player, bots, world, effects, sounds,
  dealDamage: (...a) => dealDamage(...a),
  heal: (amt) => { player.health = Math.min(healCap(), player.health + amt); },
  setInvuln: (t) => { invulnTimer = Math.max(invulnTimer, t); },
  addFeedLine: (t) => addFeedLine(t),
  addShake: (a) => addShake(a),
});
bots.onShieldHit = (dmg, point) => abilities.onShieldHit(dmg, point);
const mech = new MechManager({
  scene, camera, player, bots, world, effects, sounds,
  dealDamage: (...a) => dealDamage(...a),
  addShake: (a) => addShake(a),
  addFeedLine: (t) => addFeedLine(t),
  setInvuln: (t) => { invulnTimer = Math.max(invulnTimer, t); },
  onEnter: () => {
    viewmodels[currentWeaponId].visible = false;
    cockpit.classList.remove('hidden');
    aiming = false;
    reloading = false;
    if (waveState === 'upgrade') renderShop();
  },
  onExit: () => {
    viewmodels[currentWeaponId].visible = true;
    cockpit.classList.add('hidden');
    if (waveState === 'upgrade') renderShop();
  },
});

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
  } else {
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
const hudHealthLabel = el('health-label');
const hudAmmo = el('ammo');
const hudWeaponLabel = el('ammo-label');
const hudGrenades = el('grenades');
const hudScore = el('score');
const hudScrap = el('scrap');
const hudMult = el('mult');
const hudComboBar = el('combo-bar');
const hudWaveNum = el('wave-num');
const hudWaveInfo = el('wave-info');
const bossPanel = el('boss-panel');
const bossName = el('boss-name');
const bossBar = el('boss-bar');
const banner = el('banner');
const callout = el('callout');
const popup = el('popup');
const feed = el('feed');
const buildStrip = el('build');
const hitmarker = el('hitmarker');
const vignette = el('vignette');
const overlay = el('overlay');
const ovMsg = el('ov-msg');
const ovSub = el('ov-sub');
const ovStats = el('run-stats');
const ovTitle = overlay.querySelector('h1');
const ovPrompt = overlay.querySelector('.prompt');
const upgradeScreen = el('upgrade-screen');
const upgradeTitle = el('upgrade-title');
const upgradeCards = el('upgrade-cards');
const mapSelect = el('map-select');
const shopBar = el('shop');
const scopeOverlay = el('scope');
const crosshair = el('crosshair');
const abilityQ = el('ab-q');
const abilityE = el('ab-e');
const fuelWrap = el('fuel-bar-bg');
const fuelBar = el('fuel-bar');
const armorWrap = el('armor-bar-bg');
const armorBar = el('armor-bar');
const cockpit = el('cockpit');
const mechHpBar = el('mech-hp');

// --- game state ---
let state = 'menu';
let waveNum = 0;
let waveState = 'idle'; // intermission | active | upgrade
let interTimer = 0;
let score = 0;
let scrap = 0;
let kills = 0;
let comboMult = 1;
let comboTimer = 0;
let comboChain = 0; // actual kills in the current chain (uncapped)
let reloading = false;
let reloadTimer = 0;
let fireCooldown = 0;
let firing = false;
let hitmarkerTimer = 0;
let vignetteAlpha = 0;
let shake = 0;
let stepAcc = 0;
let heartbeatTimer = 0;
let aiming = false;
let adsT = 0;
let fovCurrent = BASE_FOV;

// --- roguelike run state ---
let stats = createStats();
const owned = new Map();
let secondWindUsed = false;
let adrenTimer = 0;
let surgeTimer = 0;
let invulnTimer = 0;
let shotCounter = 0;
let streakCounter = 0;
let pendingBossOffer = false;
let currentOffer = [];
let offerOpenedAt = 0; // guards against click-through when the offer appears
let jetFuelUps = 0;
let jetThrustUps = 0;
let jetSoundAcc = 0;
let armor = 0; // scrap-bought, absorbs damage first, never regenerates
let mutator = null; // active wave mutator key or null
let droneRateUps = 0;
let collectorSpeedUps = 0;
let lavaCd = 0;
let emberT = 0;

function offerLocked() {
  return performance.now() - offerOpenedAt < 700;
}

// --- weapons / grenades run state ---
let currentWeaponId = 'rifle';
const weaponAmmo = { rifle: WEAPONS.rifle.mag, marksman: WEAPONS.marksman.mag };
let grenadeCount = 1;
let grenadeCd = 0;
let grenadeChargeT = -1; // >= 0 while G is held (charging a throw)

// --- run stats (end screen) ---
let run = null;
function freshRunStats() {
  return {
    shotsFired: 0, shotsHit: 0, damageDealt: 0,
    killsBy: { rifle: 0, marksman: 0, grenade: 0, drone: 0, mech: 0, other: 0 },
    headshotKills: 0, grenadesThrown: 0, scrapEarned: 0, maxCombo: 1, bestChain: 0,
  };
}
run = freshRunStats();
const killTimes = [];

const weapon = () => WEAPONS[currentWeaponId];
const magSize = (w = weapon()) => {
  const m = w.mag + stats.magBonus;
  return stats.magCap ? Math.min(stats.magCap, m) : m;
};
const ammo = () => weaponAmmo[currentWeaponId];
const setAmmo = (v) => { weaponAmmo[currentWeaponId] = v; };
const healCap = () => player.maxHealth * (stats.overshield ? 1.3 : 1);
const berserkActive = () =>
  stats.berserker && player.health < player.maxHealth * 0.3;
const fireRateMult = () =>
  stats.fireRateMult *
  (surgeTimer > 0 ? 1.3 ** stats.adrenalSurge : 1) *
  (abilities.overclockActive() ? 1.6 : 1);
const ownedUniqueIds = () =>
  new Set(
    [...owned.keys()].filter((id) => UPGRADES.find((u) => u.id === id)?.unique)
  );

function switchWeapon(id) {
  if (!WEAPONS[id] || id === currentWeaponId) return;
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
  player.health = Math.min(player.health, healCap());
  player.jumpMult = stats.jumpMult;
  player.canDoubleJump = stats.doubleJump && !mech.active;
  player.regenDelay = stats.regenDelay;
  player.regenRate = stats.regenRate;
  for (const id of WEAPON_ORDER) {
    weaponAmmo[id] = Math.min(weaponAmmo[id], magSize(WEAPONS[id]));
  }
  // Golden Gun turns your weapons gold
  const golden = owned.has('goldengun');
  gunMat.color.setHex(golden ? 0xd4af37 : 0x2f3138);
  gunMat.metalness = golden ? 0.85 : 0.4;
  gunMat.roughness = golden ? 0.25 : 0.5;
  woodMat.color.setHex(golden ? 0xb8912a : 0x5c4326);
  woodMat.metalness = golden ? 0.7 : 0;
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

const bestKey = () => MAP.bestKey + DIFF().bestSuffix;
// best-score records are checksummed — hand-edited localStorage gets discarded
function bestSig(s, w) {
  let h = 2166136261 >>> 0;
  const str = `mfps.v2|${s}|${w}|q7k2z`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
function loadBest() {
  try {
    const b = JSON.parse(localStorage.getItem(bestKey()));
    if (!b || typeof b.score !== 'number' || b.sig !== bestSig(b.score, b.wave)) {
      return { score: 0, wave: 0 };
    }
    return b;
  } catch {
    return { score: 0, wave: 0 };
  }
}
function saveBest() {
  const best = loadBest();
  if (score > best.score) {
    localStorage.setItem(
      bestKey(),
      JSON.stringify({ score, wave: waveNum, sig: bestSig(score, waveNum) })
    );
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

function showCallout(n) {
  const labels = {
    2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUADRA KILL',
    5: 'PENTA KILL', 6: 'HEXA KILL', 7: 'RAMPAGE',
  };
  callout.textContent = labels[n] || 'GODLIKE';
  callout.className = `show tier-${Math.min(n, 8)}`;
  void callout.offsetWidth;
  callout.classList.add('pop');
  sounds.callout(Math.min(n, 8));
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

function showOverlay(title, msg, sub, prompt, statsHtml = '') {
  ovTitle.textContent = title;
  ovMsg.innerHTML = msg;
  ovSub.innerHTML = sub;
  ovStats.innerHTML = statsHtml;
  ovPrompt.textContent = prompt;
  overlay.classList.remove('hidden');
}

function startGame() {
  stats = createStats();
  owned.clear();
  secondWindUsed = false;
  adrenTimer = 0;
  surgeTimer = 0;
  invulnTimer = 0;
  shotCounter = 0;
  streakCounter = 0;
  run = freshRunStats();
  killTimes.length = 0;
  weaponAmmo.rifle = WEAPONS.rifle.mag;
  weaponAmmo.marksman = WEAPONS.marksman.mag;
  viewmodels[currentWeaponId].visible = false;
  currentWeaponId = 'rifle';
  viewmodels.rifle.visible = true;
  grenadeCount = 1;
  grenadeCd = 0;
  grenades.clear();
  drones.clear();
  if (mech.active) mech.exit(false);
  abilities.reset();
  bots.shield = null;
  bots.decoyPos = null;
  player.jetpack.owned = false;
  player.jetpack.maxFuel = 1.3;
  player.jetpack.thrust = 38;
  player.jetpack.fuel = 0;
  jetFuelUps = 0;
  jetThrustUps = 0;
  armor = 0;
  droneRateUps = 0;
  collectorSpeedUps = 0;
  player.maxHealth = 100;
  player.reset();
  syncStats();
  updateBuildStrip();
  bots.clearAll();
  score = 0;
  scrap = 0;
  kills = 0;
  comboMult = 1;
  comboTimer = 0;
  comboChain = 0;
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
  bots.mapDiff = MAP.diff;
  bots.eliteFromWave = MAP.eliteFrom;
  bots.hpFactor = DIFF().enemyHp;
  bots.accuracyMult = DIFF().accuracy;
  state = 'playing';
  startWave(1);
}

// lighting/fog defaults for restoring after mutator waves
function applyMutator(m) {
  mutator = m;
  if (m === 'fog') {
    scene.fog.near = 16;
    scene.fog.far = 50;
    scene.fog.color.setHex(0x76858f);
    scene.background.setHex(0x76858f);
  } else if (m === 'blackout') {
    world.hemi.intensity = 0.12;
    world.sun.intensity = 0.18;
    scene.fog.near = 30;
    scene.fog.far = 110;
    scene.fog.color.setHex(0x0a0e16);
    scene.background.setHex(0x0a0e16);
  }
}

function clearMutator() {
  mutator = null;
  scene.fog.near = ENV.fogNear;
  scene.fog.far = ENV.fogFar;
  scene.fog.color.setHex(ENV.fogColor);
  scene.background.setHex(ENV.bg);
  world.hemi.intensity = ENV.hemi;
  world.sun.intensity = ENV.sun;
}

function startWave(n) {
  waveNum = n;
  waveState = 'intermission';
  interTimer = 3;
  clearMutator();
  const isBoss = WAVES[n - 1].some((t) => BOT_TYPES[t].boss);
  if (!isBoss && n >= 4 && Math.random() < MAP.mutatorChance) {
    const keys = Object.keys(MUTATORS);
    applyMutator(keys[Math.floor(Math.random() * keys.length)]);
  }
  showBanner(
    `WAVE ${n}`,
    isBoss ? '⚠ BOSS INCOMING ⚠' : mutator ? MUTATORS[mutator].sub : ''
  );
  if (isBoss) sounds.bossRoar();
  else sounds.waveStart();
}

// --- upgrade offers + scrap shop ---
function rollNewOffer() {
  currentOffer = rollOffer(waveNum, ownedUniqueIds(), stats.offerSize, pendingBossOffer);
}

function renderOffer() {
  upgradeCards.innerHTML = '';
  for (const upg of currentOffer) {
    const tier = TIERS[upg.tier];
    const count = owned.get(upg.id) || 0;
    const card = document.createElement('button');
    card.className = 'upgrade-card';
    card.style.borderColor = tier.color;
    card.style.boxShadow = `0 0 24px ${tier.color}33, inset 0 0 14px ${tier.color}14`;
    card.innerHTML =
      `<div class="tier-label" style="color:${tier.color}">${tier.label}${upg.ability ? ' · ABILITY' : ''}</div>` +
      `<div class="upg-name">${upg.name}</div>` +
      `<div class="upg-desc">${upg.desc}</div>` +
      (upg.ability
        ? `<div class="upg-owned">Q: ${abilities.slots.Q ? ABILITIES[abilities.slots.Q].name : 'empty'} · E: ${abilities.slots.E ? ABILITIES[abilities.slots.E].name : 'empty'}</div>`
        : count ? `<div class="upg-owned">owned ×${count}</div>` : '');
    card.onclick = () => {
      if (offerLocked()) return;
      if (upg.ability) showSlotDialog(upg);
      else pickUpgrade(upg);
    };
    upgradeCards.appendChild(card);
  }
  renderShop();
}

// ability cards: choose which key to bind it to (or go back)
function showSlotDialog(upg) {
  upgradeCards.innerHTML = '';
  const tier = TIERS[upg.tier];
  const wrap = document.createElement('div');
  wrap.className = 'slot-dialog';
  wrap.style.borderColor = tier.color;
  const slotLabel = (s) =>
    abilities.slots[s] ? `replaces ${ABILITIES[abilities.slots[s]].name}` : 'empty';
  wrap.innerHTML =
    `<div class="tier-label" style="color:${tier.color}">${tier.label} ABILITY</div>` +
    `<div class="upg-name">${upg.name}</div>` +
    `<div class="upg-desc">${upg.desc}</div>`;
  const row = document.createElement('div');
  row.className = 'slot-row';
  for (const s of ['Q', 'E']) {
    const btn = document.createElement('button');
    btn.className = 'slot-btn';
    btn.innerHTML = `<b>${s}</b><span>${slotLabel(s)}</span>`;
    btn.onclick = () => {
      abilities.assign(s, upg.ability);
      owned.set(upg.id, 1);
      updateBuildStrip();
      addFeedLine(`${upg.name} → ${s}`);
      sounds.pickup();
      upgradeScreen.classList.add('hidden');
      canvas.requestPointerLock();
      startWave(waveNum + 1);
    };
    row.appendChild(btn);
  }
  const back = document.createElement('button');
  back.className = 'slot-btn back';
  back.innerHTML = '<b>←</b><span>back</span>';
  back.onclick = () => renderOffer();
  row.appendChild(back);
  wrap.appendChild(row);
  upgradeCards.appendChild(wrap);
}

function renderShop() {
  shopBar.innerHTML = `<span id="shop-scrap">SCRAP ${scrap}</span>`;
  const jetOwned = mech.active ? mech.backup?.jetpack.owned : player.jetpack.owned;

  const groups = [
    {
      label: 'SUPPLIES',
      items: [
        {
          label: `REROLL — ${COST_REROLL}`,
          can: scrap >= COST_REROLL,
          act: () => { scrap -= COST_REROLL; sounds.reroll(); rollNewOffer(); renderOffer(); },
        },
        {
          label: grenadeCount >= GRENADE_MAX ? 'GRENADE — MAX' : `+1 GRENADE — ${COST_GRENADE}`,
          can: scrap >= COST_GRENADE && grenadeCount < GRENADE_MAX,
          act: () => { scrap -= COST_GRENADE; grenadeCount++; sounds.pickup(); renderShop(); },
        },
        {
          label: armor >= ARMOR_MAX
            ? 'ARMOR — MAX (4/4)'
            : `+1 ARMOR BAR — ${COST_ARMOR} (${Math.floor(armor / ARMOR_PER_BAR)}/4)`,
          can: scrap >= COST_ARMOR && armor < ARMOR_MAX,
          act: () => {
            scrap -= COST_ARMOR;
            armor = Math.min(ARMOR_MAX, armor + ARMOR_PER_BAR);
            sounds.pickup();
            renderShop();
          },
        },
      ],
    },
    {
      label: 'COMBAT DRONES',
      items: [
        {
          label: drones.count() >= DRONE_MAX
            ? `DRONE — MAX (${drones.count()}/${DRONE_MAX})`
            : `HELPER DRONE — ${COST_DRONE} (${drones.count()}/${DRONE_MAX})`,
          can: scrap >= COST_DRONE && drones.count() < DRONE_MAX,
          act: () => { scrap -= COST_DRONE; drones.add(); sounds.pickup(); addFeedLine('DRONE ONLINE'); renderShop(); },
        },
        ...(drones.count() > 0
          ? [
              {
                label: droneRateUps >= DRONE_RATE_MAX
                  ? 'FIRE RATE — MAX'
                  : `FIRE RATE +10% — ${COST_DRONE_RATE} (${droneRateUps}/${DRONE_RATE_MAX})`,
                can: scrap >= COST_DRONE_RATE && droneRateUps < DRONE_RATE_MAX,
                act: () => {
                  scrap -= COST_DRONE_RATE;
                  droneRateUps++;
                  drones.fireRateMult *= 1.1;
                  sounds.pickup();
                  renderShop();
                },
              },
              {
                label: drones.twin ? 'TWIN CANNONS — OWNED' : `TWIN CANNONS — ${COST_DRONE_TWIN}`,
                can: scrap >= COST_DRONE_TWIN && !drones.twin,
                act: () => {
                  scrap -= COST_DRONE_TWIN;
                  drones.twin = true;
                  sounds.pickup();
                  addFeedLine('DRONES: TWIN CANNONS');
                  renderShop();
                },
              },
            ]
          : []),
      ],
    },
    {
      label: 'COLLECTOR',
      items: [
        {
          label: drones.collector ? 'COLLECTOR — OWNED' : `SCRAP COLLECTOR — ${COST_COLLECTOR}`,
          can: scrap >= COST_COLLECTOR && !drones.collector,
          act: () => {
            scrap -= COST_COLLECTOR;
            drones.addCollector();
            sounds.pickup();
            addFeedLine('COLLECTOR ONLINE — GATHERS SCRAP FOR YOU');
            renderShop();
          },
        },
        ...(drones.collector
          ? [
              {
                label: collectorSpeedUps >= COLLECTOR_SPEED_MAX
                  ? 'COLLECTOR SPEED — MAX'
                  : `COLLECTOR SPEED +40% — ${COST_COLLECTOR_SPEED} (${collectorSpeedUps}/${COLLECTOR_SPEED_MAX})`,
                can: scrap >= COST_COLLECTOR_SPEED && collectorSpeedUps < COLLECTOR_SPEED_MAX,
                act: () => {
                  scrap -= COST_COLLECTOR_SPEED;
                  collectorSpeedUps++;
                  drones.collectorSpeed *= 1.4;
                  sounds.pickup();
                  renderShop();
                },
              },
            ]
          : []),
      ],
    },
    {
      label: 'HEAVY GEAR',
      items: [
        ...(!jetOwned
          ? [
              {
                label: `JETPACK — ${COST_JETPACK}`,
                can: scrap >= COST_JETPACK && !mech.active,
                act: () => {
                  scrap -= COST_JETPACK;
                  player.jetpack.owned = true;
                  player.jetpack.fuel = player.jetpack.maxFuel;
                  sounds.overclockUp();
                  addFeedLine('JETPACK EQUIPPED — HOLD SPACE IN AIR');
                  renderShop();
                },
              },
            ]
          : [
              {
                label: jetFuelUps >= JET_UP_MAX
                  ? 'JET FUEL — MAX'
                  : `JET FUEL +50% — ${COST_JET_UP} (${jetFuelUps}/${JET_UP_MAX})`,
                can: scrap >= COST_JET_UP && jetFuelUps < JET_UP_MAX && !mech.active,
                act: () => {
                  scrap -= COST_JET_UP;
                  jetFuelUps++;
                  player.jetpack.maxFuel += 0.65;
                  sounds.pickup();
                  renderShop();
                },
              },
              {
                label: jetThrustUps >= JET_UP_MAX
                  ? 'JET THRUST — MAX'
                  : `JET THRUST +20% — ${COST_JET_UP} (${jetThrustUps}/${JET_UP_MAX})`,
                can: scrap >= COST_JET_UP && jetThrustUps < JET_UP_MAX && !mech.active,
                act: () => {
                  scrap -= COST_JET_UP;
                  jetThrustUps++;
                  player.jetpack.thrust += 7.5;
                  sounds.pickup();
                  renderShop();
                },
              },
            ]),
        {
          label: mech.active ? 'MECH — ACTIVE' : `MECH — ${MECH.cost}`,
          can: scrap >= MECH.cost && !mech.active,
          act: () => {
            scrap -= MECH.cost;
            mech.enter();
            renderShop();
          },
        },
      ],
    },
  ];

  for (const group of groups) {
    if (!group.items.length) continue;
    const row = document.createElement('div');
    row.className = 'shop-group';
    const lab = document.createElement('span');
    lab.className = 'shop-group-label';
    lab.textContent = group.label;
    row.appendChild(lab);
    for (const item of group.items) {
      const btn = document.createElement('button');
      btn.className = 'shop-btn' + (item.can ? '' : ' disabled');
      btn.textContent = item.label;
      if (item.can) {
        btn.onclick = () => {
          if (!offerLocked()) item.act();
        };
      }
      row.appendChild(btn);
    }
    shopBar.appendChild(row);
  }
}

function showUpgradeOffer(bossReward) {
  waveState = 'upgrade';
  firing = false;
  pendingBossOffer = !!bossReward;
  offerOpenedAt = performance.now();
  upgradeTitle.textContent = bossReward ? 'BOSS DOWN — CLAIM YOUR REWARD' : 'CHOOSE AN UPGRADE';
  rollNewOffer();
  renderOffer();
  upgradeScreen.classList.remove('hidden');
  upgradeScreen.classList.add('locked');
  setTimeout(() => upgradeScreen.classList.remove('locked'), 700);
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
  clearMutator();
  const bonus = waveNum * 250;
  score += bonus;
  sounds.waveClear();
  player.health = player.maxHealth;
  if (waveNum >= FINAL_WAVE) {
    endGame(true);
    return;
  }
  showPopup(`WAVE CLEARED +${bonus}`);
  showUpgradeOffer(BOSS_WAVES.includes(waveNum));
}

function runStatsHtml() {
  const acc = run.shotsFired ? Math.round((run.shotsHit / run.shotsFired) * 100) : 0;
  const kb = run.killsBy;
  return `
    <div class="stat-row"><span>ACCURACY</span><span>${acc}%</span></div>
    <div class="stat-row"><span>DAMAGE DEALT</span><span>${Math.round(run.damageDealt).toLocaleString()}</span></div>
    <div class="stat-row"><span>KILLS</span><span>rifle ${kb.rifle} · marksman ${kb.marksman} · grenade ${kb.grenade} · drone ${kb.drone}${kb.mech ? ` · mech ${kb.mech}` : ''}${kb.other ? ` · other ${kb.other}` : ''}</span></div>
    <div class="stat-row"><span>HEADSHOT KILLS</span><span>${run.headshotKills}</span></div>
    <div class="stat-row"><span>BEST KILL CHAIN</span><span>${run.bestChain} kills (×${run.maxCombo} max mult)</span></div>
    <div class="stat-row"><span>SCRAP EARNED</span><span>${run.scrapEarned}</span></div>
    <div class="stat-row"><span>GRENADES THROWN</span><span>${run.grenadesThrown}</span></div>`;
}

function endGame(won) {
  state = 'over';
  firing = false;
  aiming = false;
  clearMutator();
  adsT = 0;
  fovCurrent = BASE_FOV;
  scopeOverlay.style.opacity = '0';
  crosshair.style.opacity = '1';
  viewmodels[currentWeaponId].visible = true;
  saveBest();
  const best = loadBest();
  document.exitPointerLock();
  const buildSummary = [...owned.keys()].length
    ? [...owned.entries()].map(([id, n]) => {
        const u = UPGRADES.find((x) => x.id === id);
        return n > 1 ? `${u.name} ×${n}` : u.name;
      }).join(' · ')
    : 'no upgrades';
  let msg = won
    ? `ALL ${FINAL_WAVE} WAVES CLEARED · SCORE ${score.toLocaleString()}`
    : `WAVE ${waveNum} · SCORE ${score.toLocaleString()}`;
  if (won && MAP_ID === 'arena') {
    try {
      localStorage.setItem('minifps-unlock2', unlockSig());
    } catch {}
    msg += '<br />🔓 THE FOUNDRY IS UNLOCKED';
  } else if (won && MAP_ID === 'foundry') {
    msg += '<br />MAP 3 — COMING SOON…';
  }
  if (won) sounds.victory();
  showOverlay(
    won ? 'VICTORY' : 'YOU DIED',
    msg,
    `${kills} kills · best score ${Math.max(best.score, score).toLocaleString()}<br />${buildSummary}`,
    won ? 'CLICK TO PLAY AGAIN' : 'CLICK TO RETRY',
    runStatsHtml()
  );
  initMapCards();
  mapSelect.classList.remove('hidden');
  el('diff-select').classList.remove('hidden');
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
    mapSelect.classList.add('hidden');
    el('diff-select').classList.add('hidden');
    showOverlay(
      'PAUSED',
      `WAVE ${waveNum} · SCORE ${score.toLocaleString()} · SCRAP ${scrap}`,
      'WASD move &middot; SHIFT sprint &middot; SPACE jump/jetpack &middot; G grenade<br />RIGHT-CLICK aim &middot; SCROLL or 1-2 weapons &middot; Q / E abilities &middot; R reload',
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
  if (e.code === 'Escape') el('codex').classList.add('hidden');
  player.keys[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) player.wantJump = true;
  }
  if (state !== 'playing') return;
  if (e.code === 'KeyR' && !mech.active) startReload();
  if (e.code === 'KeyG' && !e.repeat) startGrenadeCharge();
  if (e.code === 'KeyQ' && waveState !== 'upgrade') {
    if (mech.active) mech.cast('Q');
    else abilities.activate('Q');
  }
  if (e.code === 'KeyE' && waveState !== 'upgrade') {
    if (mech.active) mech.cast('E');
    else abilities.activate('E');
  }
  if (/^Digit[1-2]$/.test(e.code) && !mech.active) {
    switchWeapon(WEAPON_ORDER[Number(e.code.slice(5)) - 1]);
  }
});
document.addEventListener('keyup', (e) => {
  player.keys[e.code] = false;
  if (e.code === 'KeyG') releaseGrenade();
});
document.addEventListener('wheel', (e) => {
  if (state === 'playing' && !mech.active && document.pointerLockElement === canvas && Math.abs(e.deltaY) > 1) {
    switchWeapon(currentWeaponId === 'rifle' ? 'marksman' : 'rifle');
  }
}, { passive: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- score / kills ---
function addKill(bot, part) {
  kills++;
  let pts = bot.cfg.points;
  const tags = [];
  if (bot.elite) {
    pts *= 2;
    tags.push('ELITE');
  }
  if (part === 'head') {
    pts *= 1.5;
    tags.push('HEADSHOT');
    run.headshotKills++;
  }
  if (!player.onGround) {
    pts *= 2;
    tags.push('AIRBORNE');
  }
  comboChain = comboTimer > 0 ? comboChain + 1 : 1;
  comboMult = comboTimer > 0 ? Math.min(stats.comboMax, comboMult + 1) : 1;
  comboTimer = 4;
  run.maxCombo = Math.max(run.maxCombo, comboMult);
  run.bestChain = Math.max(run.bestChain, comboChain);
  const total = Math.round((pts * comboMult) / 10) * 10;
  score += total;
  showPopup(`+${total}${tags.length ? ' ' + tags.join(' ') : ''}${comboMult > 1 ? ` ×${comboMult}` : ''}`);
  addFeedLine(`${bot.type.toUpperCase()} +${total}`);
  sounds.kill();

  // multi-kill callouts (1.8s chain window, up to GODLIKE at 8+)
  const now = performance.now();
  killTimes.push(now);
  while (killTimes.length && now - killTimes[0] > 1800) killTimes.shift();
  if (killTimes.length >= 2) showCallout(killTimes.length);

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
  if (stats.instantReload || abilities.overclockActive()) {
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
  if (dist > LONGSHOT_DIST) dmg *= stats.longshotMult;
  if (bot && bot.health < bot.maxHealth * 0.3) dmg *= stats.executionerMult;
  if (bot && bot.cfg.boss) dmg *= stats.bossSlayer;
  if (berserkActive()) dmg *= 1.5;
  if (player.position.y - 1.7 > 0.9) dmg *= stats.highGround;
  return Math.round(dmg);
}

// central damage funnel — pierce/splash/grenade/drone/chain kills all flow here
function dealDamage(bot, dmg, part, opts = {}) {
  const { source = currentWeaponId, depth = 0 } = opts;
  const wasBoss = bot.cfg.boss;
  const pos = bot.group.position.clone();
  run.damageDealt += dmg;
  const died = bots.damage(bot, dmg);
  if (died) {
    const bucket = run.killsBy[source] !== undefined ? source : 'other';
    run.killsBy[bucket]++;
    addKill(bot, part);
    if (stats.killHeal) {
      player.health = Math.min(healCap(), player.health + stats.killHeal);
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
    // drops: bosses pay out big, everyone else rolls the dice
    if (wasBoss) {
      grenades.spawnPickup(pos, 'grenade');
      grenades.spawnPickup(pos, 'grenade');
      grenades.spawnPickup(pos, 'scrap', SCRAP_BOSS);
    } else {
      if (Math.random() < GRENADE_DROP_CHANCE * stats.grenadeDropMult) {
        grenades.spawnPickup(pos, 'grenade');
      }
      if (bot.elite) {
        // elites always pay out, triple
        grenades.spawnPickup(pos, 'scrap', (SCRAP_VALUES[bot.type] || 10) * 3);
      } else if (
        Math.random() <
        Math.min(0.95, SCRAP_DROP_CHANCE * stats.scrapDropMult * (mutator === 'frenzy' ? 2 : 1))
      ) {
        grenades.spawnPickup(pos, 'scrap', SCRAP_VALUES[bot.type] || 10);
      }
    }
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
        dealDamage(best, 40, 'body', { source: 'other', depth: 1 });
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
  fireCooldown = w.interval / fireRateMult();
  shotCounter++;
  const freeShot = stats.doubleTap && shotCounter % 4 === 0;
  if (!freeShot) setAmmo(ammo() - 1);
  gunKick = 1;
  sounds[w.sound]();
  run.shotsFired++;

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
    if (w.spread) {
      _pelletDir.x += (Math.random() - 0.5) * 2 * w.spread;
      _pelletDir.y += (Math.random() - 0.5) * 2 * w.spread;
      _pelletDir.z += (Math.random() - 0.5) * 2 * w.spread;
      _pelletDir.normalize();
    }
    const { struck, end } = fireRay(_pelletDir, seenAll);
    if (!firstEnd) firstEnd = end;
    if (struck.length) {
      anyHit = true;
      for (const s of struck) {
        effects.spark(s.point, 0xff5555);
        const dmg = shotDamage(s.part, s.dist, s.bot);
        dealDamage(s.bot, dmg, s.part);
        // ricochet: bounce a fraction to the nearest other enemy
        if (stats.ricochet) {
          let best = null;
          let bestD = 10;
          for (const b of bots.bots) {
            if (!b.alive || seenAll.has(b)) continue;
            const d = b.group.position.distanceTo(s.bot.group.position);
            if (d < bestD) {
              bestD = d;
              best = b;
            }
          }
          if (best) {
            _botCenter.copy(best.group.position);
            _botCenter.y += 0.9 * best.cfg.scale;
            effects.tracer(s.point, _botCenter, 0xffe08a);
            dealDamage(best, Math.round(dmg * 0.6), 'body', { source: 'other', depth: 1 });
          }
        }
      }
    } else {
      effects.spark(end, 0xccc9a8);
    }
    effects.tracer(_muzzle, end);
  }
  if (anyHit) {
    hitmarkerTimer = 0.12;
    sounds.hit();
    run.shotsHit++;
  }

  if (stats.explosive && firstEnd) {
    effects.explosion(firstEnd, 0xff8833, 0.6);
    addShake(0.12);
    const splash = Math.round(w.body * 0.5 * stats.damageMult);
    for (const b of bots.bots) {
      if (!b.alive || seenAll.has(b)) continue;
      _botCenter.copy(b.group.position);
      _botCenter.y += 0.9 * b.cfg.scale;
      if (_botCenter.distanceTo(firstEnd) < 3) {
        dealDamage(b, splash, 'body', { source: 'other', depth: 1 });
      }
    }
  }

  effects.flash(_muzzle);
  if (ammo() === 0) startReload();
}

// --- grenades: hold G to charge, release to throw farther ---
const GRENADE_MIN_SPEED = 13;
const GRENADE_MAX_SPEED = 30;
const GRENADE_CHARGE_TIME = 1.1;

function startGrenadeCharge() {
  if (grenadeCount <= 0 || grenadeCd > 0 || waveState === 'upgrade' || grenadeChargeT >= 0) return;
  grenadeChargeT = 0;
}

function releaseGrenade() {
  if (grenadeChargeT < 0) return;
  const power = Math.min(1, grenadeChargeT / GRENADE_CHARGE_TIME);
  grenadeChargeT = -1;
  if (grenadeCount <= 0 || waveState === 'upgrade' || state !== 'playing') return;
  grenadeCount--;
  grenadeCd = 0.5;
  run.grenadesThrown++;
  grenades.throwFrom(camera, GRENADE_MIN_SPEED + (GRENADE_MAX_SPEED - GRENADE_MIN_SPEED) * power);
  sounds.empty();
}

function explodeGrenade(pos, isCluster) {
  const radius = isCluster ? 4 : GRENADE_RADIUS;
  const baseDmg = (isCluster ? 60 : 120) * stats.grenadeDmgMult;
  effects.explosion(pos, 0xffaa22, isCluster ? 1 : 1.8);
  effects.shockwave(pos, radius, 0xffaa44);
  addShake(isCluster ? 0.4 : 0.9);
  sounds.explosionBig();
  for (const b of bots.bots) {
    if (!b.alive) continue;
    _botCenter.copy(b.group.position);
    _botCenter.y += 0.9 * b.cfg.scale;
    const d = _botCenter.distanceTo(pos);
    if (d < radius) {
      const dmg = Math.round(baseDmg * (1 - (0.6 * d) / radius));
      dealDamage(b, dmg, 'body', { source: 'grenade' });
    }
  }
  if (!isCluster && stats.clusterBombs) grenades.spawnCluster(pos);
}

// --- bot damage callbacks ---
bots.onBossEnraged = (bot) => {
  showBanner(`${bot.cfg.name} ENRAGED`, 'RUN.');
  addShake(1);
};

bots.onPlayerHit = (dmg, kind, sourceBot) => {
  if (invulnTimer > 0) return;
  dmg = Math.max(1, Math.round(dmg * DIFF().enemyDmg));
  // piloting: the mech soaks everything, raw — no player mitigations
  if (mech.active) {
    vignetteAlpha = Math.max(vignetteAlpha, 0.4);
    addShake(kind === 'shock' || kind === 'blast' ? 0.9 : 0.25);
    sounds.hit();
    mech.damage(dmg);
    return;
  }
  if (kind === 'shock' && stats.shockImmune) {
    addFeedLine('SLAM BLOCKED');
    return;
  }
  if (kind === 'melee' && stats.thorns && sourceBot) {
    const tdmg = Math.max(50, Math.round(sourceBot.maxHealth * 0.25)) * stats.thorns;
    dealDamage(sourceBot, tdmg, 'body', { source: 'other', depth: 1 });
  }
  let final = Math.max(1, Math.round(dmg * (1 - stats.damageReduction)));
  // armor soaks damage first and stays broken until rebought
  if (armor > 0) {
    const absorbed = Math.min(armor, final);
    armor -= absorbed;
    final -= absorbed;
    sounds.hit();
    if (armor === 0) addFeedLine('ARMOR DESTROYED');
  }
  vignetteAlpha = final > 0 ? 0.85 : Math.max(vignetteAlpha, 0.35);
  addShake(
    kind === 'shock' || kind === 'blast' ? 1.3 : kind === 'melee' ? 0.7 : 0.35 + final / 60
  );
  if (final > 0) {
    if (kind === 'burn') sounds.sizzle();
    else sounds.hurt();
  }
  if (stats.adrenalSurge) surgeTimer = 3;
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
  if (mech.active) {
    adsT += (0 - adsT) * Math.min(1, dt * 12);
    scopeOverlay.style.opacity = '0';
    crosshair.style.opacity = '1';
    fovCurrent += (82 - fovCurrent) * Math.min(1, dt * 8); // wider mech view
    player.lookScale = 1;
    return;
  }
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

  const scoped = w.scope && adsT > 0.5;
  gun.visible = !scoped;
  scopeOverlay.style.opacity = w.scope ? `${Math.max(0, (adsT - 0.5) * 2)}` : '0';
  crosshair.style.opacity = scoped ? '0' : '1';

  const targetFov = BASE_FOV + ((w.zoomFov ?? BASE_FOV) - BASE_FOV) * adsT;
  fovCurrent += (targetFov - fovCurrent) * Math.min(1, dt * 14);
  player.lookScale = Math.max(0.2, fovCurrent / BASE_FOV);
}

// --- HUD ---
function updateHUD(dt) {
  // while piloting, the main health bar IS the mech's integrity
  const hpFrac = mech.active
    ? mech.hp / mech.maxHp
    : player.health / player.maxHealth;
  hudHealthLabel.textContent = mech.active ? 'MECH INTEGRITY' : 'HEALTH';
  hudHealth.style.width = `${Math.min(100, Math.max(0, hpFrac * 100))}%`;
  hudHealth.style.background =
    !mech.active && hpFrac > 1.001
      ? 'linear-gradient(90deg, #38bdf8, #7fe7ff)'
      : hpFrac > 0.4
        ? 'linear-gradient(90deg, #37d67a, #7ce7a5)'
        : 'linear-gradient(90deg, #d63737, #e77c7c)';
  hudAmmo.textContent = mech.active ? '∞' : reloading ? '···' : `${ammo()}`;
  hudWeaponLabel.textContent = mech.active ? 'MECH CANNONS' : `${weapon().name} · R RELOAD`;
  hudGrenades.textContent =
    grenadeChargeT >= 0
      ? `THROW POWER ${Math.round(Math.min(1, grenadeChargeT / GRENADE_CHARGE_TIME) * 100)}%`
      : `GRENADES ×${grenadeCount} · HOLD G`;
  hudScore.textContent = score.toLocaleString();
  hudScrap.textContent = `SCRAP ${scrap}`;
  hudMult.textContent = `×${comboMult}`;
  hudMult.className = comboMult > 1 ? `hot hot-${Math.min(comboMult, 5)}` : '';
  hudComboBar.style.width = `${(comboTimer / 4) * 100}%`;

  hudWaveNum.textContent = `WAVE ${waveNum}${diffId === 'easy' ? ' · EASY' : ''}`;
  if (waveState === 'intermission') {
    hudWaveInfo.textContent = `INCOMING ${Math.ceil(interTimer)}`;
  } else if (waveState === 'upgrade') {
    hudWaveInfo.textContent = 'CHOOSE';
  } else {
    hudWaveInfo.textContent = `ENEMIES ${bots.aliveCount()}${mutator ? ' · ' + MUTATORS[mutator].label : ''}`;
  }

  if (bots.boss && bots.boss.alive) {
    bossPanel.classList.remove('hidden');
    bossName.textContent = bots.boss.cfg.name;
    bossBar.style.width = `${(bots.boss.health / bots.boss.maxHealth) * 100}%`;
  } else {
    bossPanel.classList.add('hidden');
  }

  // ability slots (mech overrides with its own loadout while piloting)
  for (const [slot, elBox] of [['Q', abilityQ], ['E', abilityE]]) {
    const nameEl = elBox.querySelector('.ab-name');
    const cdEl = elBox.querySelector('.ab-cd');
    if (mech.active) {
      elBox.classList.remove('empty');
      nameEl.textContent = MECH_ABILITIES[slot].name;
      const cd = mech.cds[slot];
      cdEl.textContent = cd > 0 ? Math.ceil(cd) : '';
      elBox.classList.toggle('cooling', cd > 0);
      continue;
    }
    const id = abilities.slots[slot];
    if (!id) {
      nameEl.textContent = '—';
      cdEl.textContent = '';
      elBox.classList.add('empty');
    } else {
      elBox.classList.remove('empty');
      nameEl.textContent = ABILITIES[id].name.toUpperCase();
      const cd = abilities.cds[slot];
      cdEl.textContent = cd > 0 ? Math.ceil(cd) : '';
      elBox.classList.toggle('cooling', cd > 0);
    }
  }

  // mech integrity
  if (mech.active) {
    mechHpBar.style.width = `${(mech.hp / mech.maxHp) * 100}%`;
  }

  // armor
  if (armor > 0) {
    armorWrap.classList.remove('hidden');
    armorBar.style.width = `${(armor / ARMOR_MAX) * 100}%`;
  } else {
    armorWrap.classList.add('hidden');
  }

  // jetpack fuel
  if (player.jetpack.owned) {
    fuelWrap.classList.remove('hidden');
    fuelBar.style.width = `${(player.jetpack.fuel / player.jetpack.maxFuel) * 100}%`;
  } else {
    fuelWrap.classList.add('hidden');
  }

  hitmarkerTimer = Math.max(0, hitmarkerTimer - dt);
  hitmarker.style.opacity = hitmarkerTimer > 0 ? '1' : '0';

  vignetteAlpha = Math.max(0, vignetteAlpha - dt * 1.6);
  let v = vignetteAlpha;
  if (state === 'playing' && hpFrac < 0.35) {
    v = Math.max(v, 0.3 + Math.sin(performance.now() / 160) * 0.12);
  }
  vignette.style.opacity = `${v}`;
}

// debug/testing handle — LOCAL DEV ONLY. On the hosted site nothing is
// exposed on window, so all game state stays sealed in minified closures.
const IS_DEV_HOST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (IS_DEV_HOST) window.__game = {
  player, bots, camera, grenades, drones,
  get stats_() { return stats; },
  owned,
  stats: () => ({
    state, waveState, wave: waveNum, score, scrap, mult: comboMult, kills,
    ammo: ammo(), mag: magSize(), weapon: currentWeaponId,
    grenades: grenadeCount, droneCount: drones.count(),
    health: player.health, maxHealth: player.maxHealth,
    enemies: bots.aliveCount(),
  }),
  run: () => ({ ...run }),
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
    scrap(n) { scrap = n; },
    grenades(n) { grenadeCount = n; },
    armor(n) { armor = n; },
    getArmor: () => armor,
    mech() { if (!mech.active) mech.enter(); },
    mutate(m) { clearMutator(); if (m) applyMutator(m); },
    getMutator: () => mutator,
    mapId: MAP_ID,
    unlockFoundry() { localStorage.setItem('minifps-unlock2', unlockSig()); },
    setMap(m) { localStorage.setItem('minifps-map', m); },
    mechState: () => (mech.active ? { hp: mech.hp, maxHp: mech.maxHp, cds: { ...mech.cds } } : null),
    mechDamage(n) { mech.damage(n); },
    addDrone() { return drones.add(); },
    giveAbility(id, slot = 'Q') {
      if (!ABILITIES[id]) return false;
      abilities.assign(slot, id);
      return true;
    },
    cast(slot) { return abilities.activate(slot); },
    jetpack() {
      player.jetpack.owned = true;
      player.jetpack.fuel = player.jetpack.maxFuel;
    },
    abilities,
    roll: (w, boss) =>
      rollOffer(w ?? waveNum, ownedUniqueIds(), stats.offerSize, !!boss)
        .map((u) => ({ id: u.id, tier: u.tier })),
  },
};

// --- main loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    const frozen = waveState === 'upgrade';
    if (!frozen) {
    adrenTimer = Math.max(0, adrenTimer - dt);
    surgeTimer = Math.max(0, surgeTimer - dt);
    invulnTimer = Math.max(0, invulnTimer - dt);
    grenadeCd = Math.max(0, grenadeCd - dt);
    if (grenadeChargeT >= 0) grenadeChargeT += dt;
    player.dynamicSpeedMult =
      stats.speedMult *
      (adrenTimer > 0 ? 1 + 0.25 * stats.adrenaline : 1) *
      (berserkActive() ? 1.25 : 1) *
      (abilities.overclockActive() ? 1.2 : 1) *
      (1 - adsT * 0.4);

    abilities.update(dt);
    bots.shield = abilities.shieldInfo();
    bots.decoyPos = abilities.decoyPos();

    player.update(dt, world.obstacleBoxes);

    // jetpack exhaust
    if (player.jetting) {
      jetSoundAcc -= dt;
      if (jetSoundAcc <= 0) {
        jetSoundAcc = 0.12;
        sounds.jet();
        effects.burst(
          new THREE.Vector3(player.position.x, player.position.y - 1.5, player.position.z),
          0xffb050, 4, 2.5, 0.25
        );
      }
    }

    // FRENZY scales everyone; Time Dilation slows only non-bosses
    bots.speedScale = (mutator === 'frenzy' ? 1.3 : 1) * DIFF().enemySpeed;
    bots.slowMult = stats.enemySlow;

    // magnet bosses drag you toward them — fight it or fly
    if (bots.playerPull) {
      player.velocity.x = bots.playerPull.x * bots.playerPull.force;
      player.velocity.z = bots.playerPull.z * bots.playerPull.force;
    }

    // molten channels burn anyone standing in them
    if (world.hazards.length) {
      lavaCd = Math.max(0, lavaCd - dt);
      const feet = player.position.y - player.eye;
      if (feet < 0.35 && lavaCd <= 0) {
        for (const h of world.hazards) {
          if (
            player.position.x > h.minX && player.position.x < h.maxX &&
            player.position.z > h.minZ && player.position.z < h.maxZ
          ) {
            lavaCd = 0.3;
            bots.onPlayerHit(9, 'burn', null);
            break;
          }
        }
      }
      // ambient embers
      emberT -= dt;
      if (emberT <= 0) {
        emberT = 0.35;
        const h = world.hazards[Math.floor(Math.random() * world.hazards.length)];
        effects.burst(
          new THREE.Vector3(
            h.minX + Math.random() * (h.maxX - h.minX), 0.4,
            h.minZ + Math.random() * (h.maxZ - h.minZ)
          ),
          0xff7a1a, 3, 2.2, 0.5
        );
      }
    }

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
      player.eye,
      world.obstacleBoxes,
      (type, value) => {
        if (type === 'scrap') {
          scrap += value;
          run.scrapEarned += value;
          sounds.scrap();
          return true;
        }
        if (grenadeCount >= GRENADE_MAX) return false;
        grenadeCount++;
        addFeedLine('GRENADE +1');
        sounds.pickup();
        return true;
      },
      explodeGrenade
    );

    drones.update(dt, player, bots.bots, dealDamage);
    drones.updateCollector(dt, player, grenades.pickups, (p) => {
      scrap += p.value;
      run.scrapEarned += p.value;
      sounds.scrap();
      grenades.removePickup(p);
    });

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
    mech.update(dt);
    if (firing && waveState !== 'upgrade') {
      if (mech.active) mech.tryShoot();
      else tryShoot();
    }
    updateGun(dt);

    if (player.onGround && player.horizontalSpeed() > 1.5) {
      stepAcc += dt * player.horizontalSpeed();
      if (stepAcc > 3.2) {
        stepAcc = 0;
        sounds.footstep();
      }
    }

    if (!mech.active && player.health < player.maxHealth * 0.35 && player.health > 0) {
      heartbeatTimer -= dt;
      if (heartbeatTimer <= 0) {
        heartbeatTimer = 0.95;
        sounds.heartbeat();
      }
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

viewmodels.rifle.visible = true;

// --- map selection cards ---
function initMapCards() {
  for (const card of mapSelect.querySelectorAll('.map-card')) {
    const m = card.dataset.map;
    card.classList.toggle('selected', m === MAP_ID);
    if (m === 'foundry') {
      const unlocked = foundryUnlocked();
      card.classList.toggle('locked', !unlocked);
      el('foundry-sub').textContent = unlocked ? '30 WAVES · HARDER' : '🔒 BEAT THE ARENA';
    }
  }
}
// --- upgrade codex: generated from the registries, always current ---
const codexEl = el('codex');
const codexBody = el('codex-body');
function tierPct(wave, tier) {
  const w = tierWeights(wave);
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  return `${((w[tier] / total) * 100).toFixed(0)}%`;
}
function buildCodex() {
  codexBody.innerHTML = '';
  for (const tier of ['common', 'uncommon', 'rare', 'legendary']) {
    const entries = UPGRADES.filter((u) => u.tier === tier).sort(
      (a, b) => (a.ability ? 1 : 0) - (b.ability ? 1 : 0)
    );
    if (!entries.length) continue;
    const head = document.createElement('div');
    head.className = 'codex-tier-head';
    head.style.color = TIERS[tier].color;
    head.innerHTML =
      `${TIERS[tier].label} (${entries.length})` +
      `<span class="codex-odds">card odds ${tierPct(1, tier)} at wave 1 → ${tierPct(19, tier)} at wave 19</span>`;
    codexBody.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'codex-grid';
    for (const u of entries) {
      const item = document.createElement('div');
      item.className = 'codex-item';
      item.style.borderLeftColor = TIERS[tier].color;
      const tags = [];
      if (u.ability) tags.push(`ABILITY · Q/E · ${ABILITIES[u.ability].cd}s CD`);
      else if (u.unique) tags.push('UNIQUE');
      else tags.push('STACKS');
      item.innerHTML =
        `<b>${u.name}</b><span>${u.desc}</span>` +
        `<div class="codex-tags">${tags.map((t) => `<span class="codex-tag">${t}</span>`).join('')}</div>`;
      grid.appendChild(item);
    }
    codexBody.appendChild(grid);
  }
}
el('codex-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  buildCodex();
  codexEl.classList.remove('hidden');
});
el('codex-close').addEventListener('click', () => codexEl.classList.add('hidden'));
codexEl.addEventListener('click', (e) => {
  e.stopPropagation();
  if (e.target === codexEl) codexEl.classList.add('hidden');
});

// difficulty toggle (applies at the next run — no reload needed)
const diffSelect = el('diff-select');
function initDiffButtons() {
  for (const btn of diffSelect.querySelectorAll('.diff-btn')) {
    btn.classList.toggle('selected', btn.dataset.diff === diffId);
  }
}
function refreshMenuMsg() {
  const best = loadBest();
  ovMsg.innerHTML =
    `${MAP.name} — ${FINAL_WAVE} waves · ${DIFF().label}. They shoot back.` +
    (best.score > 0 ? `<br />BEST: ${best.score.toLocaleString()} (wave ${best.wave})` : '');
}
diffSelect.addEventListener('click', (e) => {
  const btn = e.target.closest('.diff-btn');
  if (!btn) return;
  e.stopPropagation();
  diffId = DIFFS[btn.dataset.diff] ? btn.dataset.diff : 'normal';
  try {
    localStorage.setItem('minifps-diff', diffId);
  } catch {}
  initDiffButtons();
  refreshMenuMsg();
});
initDiffButtons();

mapSelect.addEventListener('click', (e) => {
  const card = e.target.closest('.map-card');
  if (!card) return;
  e.stopPropagation(); // don't trigger the overlay's start-game click
  const m = card.dataset.map;
  if (!m || card.classList.contains('locked') || card.classList.contains('soon')) return;
  if (m !== MAP_ID) {
    try {
      localStorage.setItem('minifps-map', m);
    } catch {}
    location.reload();
  }
});
initMapCards();

refreshMenuMsg();
