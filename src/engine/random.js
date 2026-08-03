// Small random helpers. Uses Math.random; centralized so we can swap in a
// seeded RNG later for reproducible sims.

export const rand = () => Math.random();

export const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Approximate a normal distribution via the sum of uniforms (central limit).
export const gaussian = (mean = 0, sd = 1) => {
  let s = 0;
  for (let i = 0; i < 6; i++) s += Math.random();
  return mean + ((s - 3) / 3) * sd * 1.732;
};

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const round1 = (v) => Math.round(v * 10) / 10;
