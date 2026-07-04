# Mini FPS

A tiny browser-based roguelike first-person shooter built with [Three.js](https://threejs.org/)
and Vite. Two maps, **30 waves** each: survive the Arena, unlock **THE FOUNDRY** — climb the towers, hold the three-story
building, build a run out of upgrades, and take down six bosses along the way.
Play it at **https://kfiggins.github.io/fable-fps-test/**.

## Run it

```sh
npm install
npm run dev
```

Then open the printed URL (usually http://localhost:5173) and click to play.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Aim |
| Left click (hold) | Shoot |
| Right click (hold) | Aim down sights (rifle irons / marksman scope) |
| WASD | Move |
| Shift | Sprint |
| Space | Jump · hold in air to jetpack (once bought) |
| R | Reload |
| G | Throw grenade |
| Q / E | Abilities |
| Scroll / 1–2 | Switch weapon |
| Esc | Pause / release mouse |

## Loadout

You carry the **rifle** (fast, reliable, iron sights) and the **marksman** (huge single
shots, 3.75× scope) from the start. Enemies randomly drop **grenades** (bosses always
drop two) and **scrap**. Hold G to charge a longer grenade throw; scrap is currency.

## The roguelike layer

After each wave, pick 1 of 3 randomized upgrades (common/uncommon/rare/legendary — odds
improve every wave you survive). **Boss waves guarantee a legendary option.** Scrap is
spent on the upgrade screen: **reroll (75)**, **grenade (30)**, **helper drone (125, max 2)**,
the **jetpack (300)** — hold Space in the air to fly, then buy fuel/thrust upgrades
until you can land on the building roof — **armor bars (25 each, max 4)** that soak
25 damage apiece and stay broken until you rebuy them — or the **MECH (1000)**: pilot a
towering war machine with 2200 non-regenerating HP, dual infinite cannons, boost jets,
Rocket Barrage on Q and Titan Stomp on E. When it dies you eject and it's gone for good
(until the next 1000 scrap).

**Abilities** appear in the upgrade pool as uncommon/rare/legendary cards and bind to
**Q or E** (two slots — replace or skip freely): Healing Field, Grapple Claw (3s cooldown,
flings you up past your mark — roof-capable), Bubble Shield (breaks under fire),
Homing Missile, Stasis Nova (freezes everything), Sweep Laser, Overclock.

Synergies are the point: Vampire + Berserker, Pierce + High Ground, Cluster Bombs +
Grenadier, Grapple Claw + High Ground, Golden Gun + Overclock…

## The map

90×90m arena with three climbable towers (stairs, parapets, cover posts) and a central
**three-story building** — ground-floor door, interior staircases to each floor and the
roof, windows to shoot from on every side. Ground enemies (grunts, rushers, tanks) know
how to climb the stairs and will chase you all the way up. Bosses are too big to fit
inside… their summons aren't.

## The enemies

| Type | Pro | Con |
| --- | --- | --- |
| **Grunt** | Balanced, 3-round bursts, hides behind cover to patch up | No standout strength |
| **Rusher** | Very fast, small, zigzags, brutal melee | One body shot kills it |
| **Tank** | Huge health pool, heavy cannon | Crawls, giant hitbox, slow fire |
| **Sniper** | Laser-telegraphed shots that HURT (red laser = locked — move!) | One-shot fragile, flees up close |
| **The Warden** (5) | + slow orb volleys you must strafe | Slam dodged by jumping |
| **The Titan** (10) | + homing missiles — break lock behind walls | Bigger target |
| **The Butcher** (15) | FAST melee monster + artillery (run from the shrinking red rings) | Enormous head |
| **The Overlord** (20) | Orbs, missiles, artillery, summons, enrage | Merely the midpoint |
| **The Phantom** (25) | Teleports around you, aimed shots, orb storms | Fragile-ish for a boss |
| **The Apex** (30) | Every attack pattern in the game at once | The actual final exam |

Regular enemies gain health and damage every wave. Killing a boss wipes the field.

## Tech

- Three.js for rendering; no game engine or physics library — movement, gravity, stair
  step-up, ceilings, and standing-on-boxes are hand-rolled AABB checks (`src/world.js`).
- Bots share the same vertical physics and use waypoint routes to pursue you into
  towers and the building (`src/world.js` `routeFor`, `src/bots.js`).
- Hitscan shooting via raycasts; grenades are simple ballistic projectiles.
- Sound effects are synthesized with WebAudio (`src/sounds.js`) — no asset files.
- `window.__game` exposes a debug handle (stats, `debug.winWave()`, `debug.give(id)`).
