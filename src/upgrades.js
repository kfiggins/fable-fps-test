import { ABILITIES } from './abilities.js';
import { deepFreeze } from './util.js';

// Roguelike upgrade system. Every upgrade is pure data: it mutates the run's
// `stats` object, and game code reads stats instead of constants. To add a new
// upgrade, add one entry to UPGRADES — nothing else. Abilities join the pool
// as `ability` cards (assigned to Q/E instead of applying stats).

export const TIERS = {
  common: { label: 'COMMON', color: '#b0b7c0' },
  uncommon: { label: 'UNCOMMON', color: '#4ade80' },
  rare: { label: 'RARE', color: '#38bdf8' },
  legendary: { label: 'LEGENDARY', color: '#f59e0b' },
};

// Rarity odds per card. Every wave survived shifts weight from common
// toward the higher tiers.
export function tierWeights(wave) {
  const w = Math.min(wave, 25);
  return {
    common: Math.max(20, 62 - 2.2 * w),
    uncommon: 26 + 0.8 * w,
    rare: 9.5 + 0.9 * w,
    legendary: 2.5 + 0.5 * w,
  };
}

// One fresh stats object per run — everything player/gun code consults.
export function createStats() {
  return {
    damageMult: 1,
    fireRateMult: 1,
    reloadMult: 1,
    magBonus: 0,
    magCap: 0, // 0 = no cap
    maxHealthBonus: 0,
    speedMult: 1,
    jumpMult: 1,
    regenRate: 8,
    regenDelay: 5,
    headshotMult: 1,
    longshotMult: 1, // damage mult beyond 25m
    executionerMult: 1, // damage mult vs enemies under 30% HP
    damageReduction: 0,
    killHeal: 0,
    killAmmo: 0,
    adrenaline: 0, // stacks: kills grant +25%/stack speed for 3s
    comboMax: 5,
    shockImmune: false,
    pierce: false,
    explosive: false,
    doubleJump: false,
    secondWind: false,
    berserker: false,
    scrapDropMult: 1, // Greed: more frequent scrap drops
    highGround: 1, // damage mult while elevated
    killStreak: false, // every 5th kill refills the mag
    thorns: 0, // damage dealt back to melee attackers
    doubleTap: false, // every 4th shot is free
    bossSlayer: 1, // damage mult vs bosses
    chainLightning: false, // kills arc damage to a nearby enemy
    instantReload: false,
    offerSize: 3, // upgrade cards per offer
    adrenalSurge: 0, // stacks: taking damage grants +30%/stack fire rate 3s
    overshield: false, // kill heals overfill to 130% max health
    grenadeDmgMult: 1,
    grenadeDropMult: 1,
    enemySlow: 1, // Time Dilation: global enemy speed multiplier
    ricochet: false, // hits bounce 60% damage to a nearby enemy
    clusterBombs: false, // grenades split into bomblets
  };
}

export const UPGRADES = [
  // ---- common ----
  { id: 'sharp', tier: 'common', name: 'Sharpened Rounds', desc: '+10% damage',
    apply: (s) => { s.damageMult *= 1.1; } },
  { id: 'trigger', tier: 'common', name: 'Rapid Trigger', desc: '+10% fire rate',
    apply: (s) => { s.fireRateMult *= 1.1; } },
  { id: 'hands', tier: 'common', name: 'Quick Hands', desc: '+15% reload speed',
    apply: (s) => { s.reloadMult *= 1.15; } },
  { id: 'mag2', tier: 'common', name: 'Extended Mag', desc: '+2 magazine size',
    apply: (s) => { s.magBonus += 2; } },
  { id: 'vest', tier: 'common', name: 'Plated Vest', desc: '+15 max health',
    apply: (s) => { s.maxHealthBonus += 15; } },
  { id: 'feet', tier: 'common', name: 'Fleet Foot', desc: '+8% move speed',
    apply: (s) => { s.speedMult *= 1.08; } },
  { id: 'dressing', tier: 'common', name: 'Field Dressing', desc: '+25% health regen rate',
    apply: (s) => { s.regenRate *= 1.25; } },
  { id: 'greed', tier: 'common', name: 'Greed', desc: '+25% scrap drop chance',
    apply: (s) => { s.scrapDropMult *= 1.25; } },

  // ---- uncommon ----
  { id: 'hollow', tier: 'uncommon', name: 'Hollow Points', desc: '+20% damage',
    apply: (s) => { s.damageMult *= 1.2; } },
  { id: 'bigmag', tier: 'uncommon', name: 'Big Magazine', desc: '+5 magazine size',
    apply: (s) => { s.magBonus += 5; } },
  { id: 'jugger', tier: 'uncommon', name: 'Juggernaut Plating', desc: '+30 max health',
    apply: (s) => { s.maxHealthBonus += 30; } },
  { id: 'adrenaline', tier: 'uncommon', name: 'Adrenaline', desc: 'Kills grant +25% speed for 3s (stacks)',
    apply: (s) => { s.adrenaline += 1; } },
  { id: 'scavenger', tier: 'uncommon', name: 'Scavenger', desc: 'Kills refund 2 ammo',
    apply: (s) => { s.killAmmo += 2; } },
  { id: 'longshot', tier: 'uncommon', name: 'Longshot', desc: '+25% damage beyond 25m',
    apply: (s) => { s.longshotMult *= 1.25; } },
  { id: 'lightweight', tier: 'uncommon', name: 'Lightweight Frame', desc: '+15% move speed',
    apply: (s) => { s.speedMult *= 1.15; } },
  { id: 'fieldmedic', tier: 'uncommon', name: 'Combat Medic', desc: 'Regen starts 2s sooner',
    apply: (s) => { s.regenDelay = Math.max(1, s.regenDelay - 2); } },
  { id: 'highground', tier: 'uncommon', name: 'High Ground', desc: '+20% damage while elevated',
    apply: (s) => { s.highGround *= 1.2; } },

  // ---- rare ----
  { id: 'cranial', tier: 'rare', name: 'Cranial Trauma', desc: 'Headshots deal +50% damage',
    apply: (s) => { s.headshotMult *= 1.5; } },
  { id: 'vampire', tier: 'rare', name: 'Vampire Rounds', desc: '+5 health per kill',
    apply: (s) => { s.killHeal += 5; } },
  { id: 'hose', tier: 'rare', name: 'Bullet Hose', desc: '+35% fire rate, −10% damage',
    apply: (s) => { s.fireRateMult *= 1.35; s.damageMult *= 0.9; } },
  { id: 'caliber', tier: 'rare', name: 'Heavy Caliber', desc: '+50% damage, −15% fire rate',
    apply: (s) => { s.damageMult *= 1.5; s.fireRateMult *= 0.85; } },
  { id: 'kevlar', tier: 'rare', name: 'Kevlar Weave', desc: 'Take 15% less damage',
    apply: (s) => { s.damageReduction = 1 - (1 - s.damageReduction) * 0.85; } },
  { id: 'executioner', tier: 'rare', name: 'Executioner', desc: '+40% damage to enemies under 30% HP',
    apply: (s) => { s.executionerMult *= 1.4; } },
  { id: 'coldblood', tier: 'rare', name: 'Cold Blood', desc: 'Combo multiplier cap +1',
    apply: (s) => { s.comboMax += 1; } },
  { id: 'blastshield', tier: 'rare', name: 'Blast Shield', desc: 'Immune to boss ground slams', unique: true,
    apply: (s) => { s.shockImmune = true; } },
  { id: 'thorns', tier: 'rare', name: 'Thorns', desc: 'Melee attackers take 25% of their max health (min 50)',
    apply: (s) => { s.thorns += 1; } },
  { id: 'doubletap', tier: 'rare', name: 'Double Tap', desc: 'Every 4th shot is free', unique: true,
    apply: (s) => { s.doubleTap = true; } },
  { id: 'bossslayer', tier: 'rare', name: 'Boss Slayer', desc: '+20% damage to bosses',
    apply: (s) => { s.bossSlayer *= 1.2; } },
  { id: 'quartermaster', tier: 'rare', name: 'Quartermaster', desc: 'Upgrade offers show 4 choices', unique: true,
    apply: (s) => { s.offerSize = 4; } },
  { id: 'adrenalsurge', tier: 'rare', name: 'Adrenal Surge', desc: 'Taking damage grants +30% fire rate for 3s',
    apply: (s) => { s.adrenalSurge += 1; } },
  { id: 'overshield', tier: 'rare', name: 'Overshield', desc: 'Kill heals can overfill health to 130%', unique: true,
    apply: (s) => { s.overshield = true; } },
  { id: 'grenadier', tier: 'rare', name: 'Grenadier', desc: 'Grenades +50% damage, drops twice as common',
    apply: (s) => { s.grenadeDmgMult *= 1.5; s.grenadeDropMult *= 2; } },

  // ---- legendary ----
  { id: 'explosive', tier: 'legendary', name: 'Explosive Rounds', desc: 'Impacts deal area damage', unique: true,
    apply: (s) => { s.explosive = true; } },
  { id: 'secondwind', tier: 'legendary', name: 'Second Wind', desc: 'Cheat death once per run', unique: true,
    apply: (s) => { s.secondWind = true; } },
  { id: 'berserker', tier: 'legendary', name: 'Berserker', desc: 'Under 30% HP: +50% damage, +25% speed', unique: true,
    apply: (s) => { s.berserker = true; } },
  { id: 'goldengun', tier: 'legendary', name: 'Golden Gun', desc: '+50% damage — and your guns turn to gold', unique: true,
    apply: (s) => { s.damageMult *= 1.5; } },
  { id: 'chain', tier: 'legendary', name: 'Chain Lightning', desc: 'Kills arc 40 damage to a nearby enemy', unique: true,
    apply: (s) => { s.chainLightning = true; } },
  { id: 'timedilation', tier: 'legendary', name: 'Time Dilation', desc: 'Enemies move 15% slower (bosses resist)', unique: true,
    apply: (s) => { s.enemySlow = 0.85; } },
  { id: 'ricochet', tier: 'legendary', name: 'Ricochet', desc: 'Hits bounce to a nearby enemy for 60% damage', unique: true,
    apply: (s) => { s.ricochet = true; } },
  { id: 'juggernaut', tier: 'legendary', name: 'Juggernaut', desc: '+100 max health, −15% move speed', unique: true,
    apply: (s) => { s.maxHealthBonus += 100; s.speedMult *= 0.85; } },
  { id: 'clusterbombs', tier: 'legendary', name: 'Cluster Bombs', desc: 'Grenades split into 3 bomblets', unique: true,
    apply: (s) => { s.clusterBombs = true; } },

  // ---- active abilities (bind to Q or E on pick) ----
  ...Object.values(ABILITIES).map((a) => ({
    id: `ab-${a.id}`, tier: a.tier, name: a.name, desc: a.desc,
    unique: true, ability: a.id, apply: () => {},
  })),
];

const TIER_ORDER = ['common', 'uncommon', 'rare', 'legendary'];

// Each card rolls its tier independently, no duplicate upgrades in one
// offer, owned uniques never reappear. If a tier's pool is empty the
// card falls to the nearest tier that still has options. Boss rewards
// pass guaranteeLegendary to force the first card gold.
export function rollOffer(wave, ownedUniques, count = 3, guaranteeLegendary = false) {
  const weights = tierWeights(wave);
  const picks = [];
  const pickedIds = new Set();
  const available = (tier) =>
    UPGRADES.filter(
      (u) => u.tier === tier && !pickedIds.has(u.id) && !(u.unique && ownedUniques.has(u.id))
    );

  if (guaranteeLegendary) {
    const pool = available('legendary').length ? available('legendary') : available('rare');
    if (pool.length) {
      const u = pool[Math.floor(Math.random() * pool.length)];
      picks.push(u);
      pickedIds.add(u.id);
    }
  }

  for (let i = picks.length; i < count; i++) {
    const total = TIER_ORDER.reduce((sum, t) => sum + weights[t], 0);
    let r = Math.random() * total;
    let tier = 'common';
    for (const t of TIER_ORDER) {
      r -= weights[t];
      if (r <= 0) {
        tier = t;
        break;
      }
    }
    let pool = available(tier);
    if (!pool.length) {
      const idx = TIER_ORDER.indexOf(tier);
      const fallback = [...TIER_ORDER.slice(0, idx).reverse(), ...TIER_ORDER.slice(idx + 1)];
      for (const t of fallback) {
        pool = available(t);
        if (pool.length) break;
      }
    }
    if (!pool.length) break;
    picks.push(pool[Math.floor(Math.random() * pool.length)]);
    pickedIds.add(picks[picks.length - 1].id);
  }
  return picks;
}

deepFreeze(TIERS);
Object.freeze(UPGRADES);
for (const u of UPGRADES) Object.freeze(u);
