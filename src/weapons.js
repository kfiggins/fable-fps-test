// Weapon roster. The rifle is the starter; the rest are boss rewards
// (waves 5/10/15). Roguelike stats apply globally on top of these numbers.
export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'RIFLE',
    desc: 'Reliable at every range — right-click for iron sights',
    body: 34, head: 100, interval: 0.14, reload: 1.1, mag: 10,
    pellets: 1, spread: 0, sound: 'shoot',
    zoomFov: 55, adsPos: [0, -0.175, -0.4],
  },
  shotgun: {
    id: 'shotgun', name: 'SHOTGUN',
    desc: '8 pellets — deletes anything close, falls off hard past 15m',
    body: 9, head: 18, interval: 0.85, reload: 1.6, mag: 5,
    pellets: 8, spread: 0.055, sound: 'shotgun',
    falloffStart: 12, falloffEnd: 30, falloffMin: 0.25,
  },
  marksman: {
    id: 'marksman', name: 'MARKSMAN',
    desc: 'Huge single shots — right-click for a real scope',
    body: 100, head: 300, interval: 0.75, reload: 1.5, mag: 4,
    pellets: 1, spread: 0, sound: 'marksman',
    zoomFov: 20, scope: true,
  },
  smg: {
    id: 'smg', name: 'SMG',
    desc: 'Melts up close — 24 rounds of forgiveness',
    body: 16, head: 40, interval: 0.07, reload: 1.3, mag: 24,
    pellets: 1, spread: 0.012, sound: 'smg',
  },
};

export const WEAPON_ORDER = ['rifle', 'shotgun', 'marksman', 'smg'];
