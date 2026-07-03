// Recursively freeze config tables so runtime tampering (devtools pokes,
// breakpoint edits) fails instead of silently rebalancing the game.
export function deepFreeze(obj) {
  for (const key of Object.getOwnPropertyNames(obj)) {
    const v = obj[key];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }
  return Object.freeze(obj);
}
