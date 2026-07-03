import { deepFreeze } from './util.js';
// Weapon roster: you carry both from the start. Roguelike stats apply
// globally on top of these numbers.
export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'RIFLE',
    desc: 'Reliable at every range — right-click for iron sights',
    body: 34, head: 100, interval: 0.14, reload: 1.1, mag: 10,
    pellets: 1, spread: 0, sound: 'shoot',
    zoomFov: 55, adsPos: [0, -0.175, -0.4],
  },
  marksman: {
    id: 'marksman', name: 'MARKSMAN',
    desc: 'Huge single shots — right-click for a real scope',
    body: 100, head: 300, interval: 0.75, reload: 1.5, mag: 4,
    pellets: 1, spread: 0, sound: 'marksman',
    zoomFov: 20, scope: true,
  },
};

export const WEAPON_ORDER = ['rifle', 'marksman'];

deepFreeze(WEAPONS);
deepFreeze(WEAPON_ORDER);
