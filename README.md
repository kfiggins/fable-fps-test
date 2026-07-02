# Mini FPS

A tiny browser-based first-person shooter built with [Three.js](https://threejs.org/) and Vite.
Survive **10 waves** in a walled arena — climb the towers, hold the high ground, and take down
two bosses along the way.

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
| Esc | Pause / release mouse |

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

When a sniper's laser turns **red**, its aim is locked — move! Killing a boss wipes out
everything else on the field.

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
