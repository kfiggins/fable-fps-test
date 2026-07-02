# Mini FPS

A tiny browser-based first-person shooter built with [Three.js](https://threejs.org/) and Vite.
Survive **20 waves** in a walled arena — climb the towers, hold the high ground, and take down
four bosses along the way. Play it at **https://kfiggins.github.io/fable-fps-test/**.

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
| WASD | Move |
| Shift | Sprint |
| Space | Jump (also dodges boss slams) |
| R | Reload |
| G | Throw grenade |
| Q / 1–4 | Switch weapon |
| Esc | Pause / release mouse |

## Weapons

You start with the **rifle**. Beating the wave 5/10/15 bosses lets you claim one of:
**shotgun** (8 pellets, brutal close, falls off past 15m), **marksman** (huge single
shots, built for headshots), **SMG** (24-round hose for close range). By wave 15 you
have the full arsenal. Roguelike upgrades apply to every weapon.

Enemies have an 8% chance to drop a **grenade** pickup (bosses always drop two).
Carry up to 5; G throws them — big area damage, safe to yourself.

## The enemies

Every type trades a big strength for a big weakness:

| Type | Pro | Con |
| --- | --- | --- |
| **Grunt** | Balanced, fires 3-round bursts, hides behind cover to patch up when hurt | No standout strength |
| **Rusher** | Very fast, small target, zigzags, brutal melee | Dies to a single body shot; no gun |
| **Tank** | Huge health pool, heavy cannon hits | Crawls, giant hitbox, slow fire rate |
| **Sniper** | Long-range laser-telegraphed shots that HURT | One-shot fragile; panics and flees up close |
| **The Warden** (wave 5) | Burst cannon, ground slam, summons rushers | Slam is dodged by jumping; slow |
| **The Titan** (wave 10) | All of the above, bigger, plus an aimed cannon shot | Same weaknesses, bigger target |
| **The Butcher** (wave 15) | Fast, melee monster, enrages at 40% health | Enormous headshot target |
| **The Overlord** (wave 20) | The full kit — burst, cannon, slam, summons, enrage | You get everything you've learned |

When a sniper's laser turns **red**, its aim is locked — move! Killing a boss wipes out
everything else on the field. Regular enemies gain health and damage every wave, and enraged
bosses (glowing red) move and attack ~50% faster.

## Scoring

- Kill points by type (grunt 100 → titan 5000), **headshot ×1.5**, **airborne kill ×2**.
- Chain kills within 4 seconds to build a combo multiplier up to **×5**.
- Wave-clear bonus of 250 × wave number, plus a full heal.
- Best score is saved locally and shown on the menu.

## The map

90×90m arena with three climbable towers (stairs on one side, cover posts on top),
wall segments, and jump-mantleable crates. Cover blocks enemy line of sight.

## Tech

- Three.js for rendering; no game engine or physics library — movement, gravity, stair
  step-up, and standing-on-boxes are hand-rolled AABB checks (`src/world.js`, `src/player.js`).
- Hitscan shooting via raycasts for both the player and bots.
- Sound effects are synthesized with WebAudio (`src/sounds.js`) — no asset files.
- `window.__game` exposes a debug handle (stats, `debug.winWave()`) for testing.
