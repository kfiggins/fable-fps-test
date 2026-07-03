# Mini FPS

A tiny browser-based roguelike first-person shooter built with [Three.js](https://threejs.org/)
and Vite. Survive **20 waves** in a walled arena — climb the towers, hold the three-story
building, build a run out of upgrades, and take down four bosses along the way.
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
| Space | Jump (also dodges boss slams) |
| R | Reload |
| G | Throw grenade |
| Q / 1–2 | Switch weapon |
| Esc | Pause / release mouse |

## Loadout

You carry the **rifle** (fast, reliable, iron sights) and the **marksman** (huge single
shots, 3.75× scope) from the start. Enemies randomly drop **grenades** (bosses always
drop two) and **scrap**. Grenades throw with G; scrap is currency.

## The roguelike layer

After each wave, pick 1 of 3 randomized upgrades (common/uncommon/rare/legendary — odds
improve every wave you survive). **Boss waves guarantee a legendary option.** Scrap can be
spent on the upgrade screen: **reroll the offer (50)**, **buy a grenade (30)**, or buy a
**helper drone (100, max 2)** that follows you and plinks at enemies for the rest of the run.

38 upgrades and counting — synergies are the point: Vampire + Berserker, Pierce + High
Ground, Cluster Bombs + Grenadier, Golden Gun + Gunslinger…

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
| **The Warden** (5) | Burst cannon, ground slam, summons | Slam dodged by jumping |
| **The Titan** (10) | All of the above + aimed cannon | Bigger target |
| **The Butcher** (15) | FAST melee monster, enrages at 40% | Enormous head |
| **The Overlord** (20) | The full kit, enrages at 35% | The final exam |

Regular enemies gain health and damage every wave. Killing a boss wipes the field.

## Tech

- Three.js for rendering; no game engine or physics library — movement, gravity, stair
  step-up, ceilings, and standing-on-boxes are hand-rolled AABB checks (`src/world.js`).
- Bots share the same vertical physics and use waypoint routes to pursue you into
  towers and the building (`src/world.js` `routeFor`, `src/bots.js`).
- Hitscan shooting via raycasts; grenades are simple ballistic projectiles.
- Sound effects are synthesized with WebAudio (`src/sounds.js`) — no asset files.
- `window.__game` exposes a debug handle (stats, `debug.winWave()`, `debug.give(id)`).
