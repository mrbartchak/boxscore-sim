// Reveal sound effects, synthesized with the Web Audio API.
//
// Deliberately asset-free: every sound is generated from oscillators + noise so
// there's nothing to ship, preload, or license. Lives outside engine/ because it
// touches browser APIs — engine/ stays pure for the future Python port.

let ctx = null;
let master = null;
let muted = false;

// Lazily built: browsers refuse to start an AudioContext before a user gesture,
// and the reveal only ever runs after the user clicks a team.
function audio() {
  if (muted || typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    // The top tiers stack a run, a chord and noise at once — compress so the
    // stacked voices stay loud without clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    master.connect(limiter).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isMuted() {
  return muted;
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.5;
}

// A3 = 220Hz is the root; tier notes are semitone offsets from it.
const hz = (semi) => 220 * Math.pow(2, semi / 12);

function tone(at, semi, dur, { wave = 'triangle', gain = 0.2, glide = 0 } = {}) {
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(hz(semi), at);
  if (glide) osc.frequency.exponentialRampToValueAtTime(hz(semi + glide), at + dur);
  // Fast attack, exponential tail — reads as a "chime" rather than a beep.
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(amp).connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

// Filtered white noise — the "shimmer" on the high tiers.
function sparkle(at, dur, gain) {
  const c = audio();
  if (!c) return;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.setValueAtTime(2600, at);
  hp.frequency.exponentialRampToValueAtTime(7000, at + dur);
  hp.Q.value = 1.2;
  const amp = c.createGain();
  amp.gain.setValueAtTime(gain, at);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(hp).connect(amp).connect(master);
  src.start(at);
}

// Low sine thump that gives the rarer reveals physical weight.
function thump(at, gain) {
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, at);
  osc.frequency.exponentialRampToValueAtTime(48, at + 0.3);
  amp.gain.setValueAtTime(gain, at);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
  osc.connect(amp).connect(master);
  osc.start(at);
  osc.stop(at + 0.36);
}

// Rarity ladder: each tier climbs higher, holds longer, and adds a layer.
const TIER_SFX = {
  base: (t) => {
    tone(t, 12, 0.18, { gain: 0.12 });
    tone(t + 0.06, 19, 0.22, { gain: 0.1 });
  },
  silver: (t) => {
    [12, 19, 24].forEach((n, i) => tone(t + i * 0.07, n, 0.3, { gain: 0.14 }));
    sparkle(t + 0.14, 0.22, 0.05);
  },
  gold: (t) => {
    thump(t, 0.22);
    [12, 16, 19, 24].forEach((n, i) =>
      tone(t + i * 0.075, n, 0.42, { wave: 'triangle', gain: 0.17 })
    );
    sparkle(t + 0.2, 0.4, 0.09);
  },
  diamond: (t) => {
    thump(t, 0.3);
    [12, 16, 19, 24, 28].forEach((n, i) =>
      tone(t + i * 0.08, n, 0.55, { wave: 'triangle', gain: 0.18 })
    );
    // Sustained top chord ringing under the run.
    [24, 31, 36].forEach((n) => tone(t + 0.42, n, 0.9, { wave: 'sine', gain: 0.12 }));
    sparkle(t + 0.3, 0.7, 0.13);
  },
  rainbow: (t) => {
    thump(t, 0.38);
    [12, 16, 19, 24, 28, 31, 36].forEach((n, i) =>
      tone(t + i * 0.075, n, 0.7, { wave: 'triangle', gain: 0.19 })
    );
    [24, 28, 31, 36, 40].forEach((n) => tone(t + 0.56, n, 1.6, { wave: 'sine', gain: 0.13 }));
    tone(t + 0.56, 0, 1.6, { wave: 'sine', gain: 0.16, glide: 12 });
    sparkle(t + 0.4, 1.3, 0.18);
    sparkle(t + 0.9, 0.9, 0.11);
  },
};

export function playRevealSfx(tier) {
  const c = audio();
  if (!c) return;
  (TIER_SFX[tier] || TIER_SFX.base)(c.currentTime + 0.01);
}

// The sting when a simmed game's score lands. A win climbs a major arpeggio
// with a shimmer over the top; a loss is two sinking tones and no sparkle —
// short and flat, because it plays as often as the win does and shouldn't
// become something you learn to dread hearing.
export function playResultSfx(won) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  if (won) {
    thump(t, 0.2);
    [12, 16, 19, 24].forEach((n, i) => tone(t + i * 0.055, n, 0.32, { gain: 0.15 }));
    sparkle(t + 0.14, 0.26, 0.06);
  } else {
    tone(t, 8, 0.26, { wave: 'sine', gain: 0.13, glide: -3 });
    tone(t + 0.11, 3, 0.34, { wave: 'sine', gain: 0.11, glide: -3 });
  }
}

// Short riser used when the program name lands.
export function playTeamSfx() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  thump(t, 0.3);
  tone(t, 0, 0.6, { wave: 'sine', gain: 0.16, glide: 19 });
  sparkle(t + 0.18, 0.5, 0.08);
}
