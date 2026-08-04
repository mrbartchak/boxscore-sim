// Small random helpers. Uses Math.random; centralized so we can swap in a
// seeded RNG later for reproducible sims.

export const rand = () => Math.random();

export const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Box-Muller normal. The old sum-of-uniforms approximation was hard-truncated
// at ±1.73 SD, which quietly capped every tail in the engine: no true blowouts,
// no shock upsets, and no outlier recruits. Capped at ±3.5 SD so a single game
// can still be a stunner without being absurd.
export const gaussian = (mean = 0, sd = 1) => {
  const u = Math.random() || Number.EPSILON;
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  return mean + Math.max(-3.5, Math.min(3.5, z)) * sd;
};

// Fisher-Yates on a copy — callers never expect their array mutated.
export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Pick an index from a weight array (weights need not sum to 1).
export const weightedIndex = (weights) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
};

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const round1 = (v) => Math.round(v * 10) / 10;
