# Mini FPS

A tiny browser-based first-person shooter built with [Three.js](https://threejs.org/) and Vite.
You're in a small walled arena against 5 bots that chase you and shoot back. Rack up kills —
the bots get a little faster and more accurate as your kill count climbs.

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
| Space | Jump |
| R | Reload |
| Esc | Pause / release mouse |

## Gameplay notes

- One hitscan rifle: 10-round magazine, auto-reload when empty. Headshots are one-shot kills; body shots take three.
- Bots respawn 3 seconds after dying, spawning away from you.
- Health regenerates slowly after 5 seconds without taking damage.
- Cover blocks bot line of sight — they can't hit what they can't see.

## Tech

- Three.js for rendering; no game engine or physics library — movement, gravity, and
  collisions are simple hand-rolled AABB checks (`src/world.js`).
- Hitscan shooting via raycasts for both the player and bots.
- Sound effects are synthesized with WebAudio (`src/sounds.js`) — no asset files.
