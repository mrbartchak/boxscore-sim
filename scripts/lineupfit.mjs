// Lineup chemistry harness. Measures the league-wide distribution of every term
// in engine/lineup.js over freshly generated default lineups, and reports the
// two constants that file has to hard-code:
//
//   CLASH_BUDGET — league mean of stacked ball-dominance appetite
//   FIT_CENTER   — league mean of the raw total, so chemistry averages zero
//
//   node scripts/lineupfit.mjs [rosters]
//
// Also reports how much chemistry is available to a user willing to search:
// the best five findable by swapping starters with the bench, versus the default.
// Re-run after changing any weight in lineup.js, then re-run calibrate.mjs.

import { TEAMS } from '../src/data/teams.js';
import { generateRoster, POSITIONS } from '../src/engine/players.js';
import { defaultLineup, teamStrength } from '../src/engine/simulation.js';
import { lineupTerms, lineupFit, FIT_TERMS, fitGrade } from '../src/engine/lineup.js';
import { ARCHETYPES_BY_ID } from '../src/data/archetypes.js';

const N = Number(process.argv[2] || 3000);

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
const pct = (a, q) => [...a].sort((x, y) => x - y)[Math.floor(q * (a.length - 1))];
const f = (x, w = 6) => x.toFixed(3).padStart(w);
const sign = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);

const state = (players, rotation) => ({ teamId: 't', players, rotation, form: 0 });

// ------------------------------------------------------------------- gather
const rows = [];
const appetites = [];
const byPrestige = [];
const paintBases = [];

for (let i = 0; i < N; i++) {
  const team = TEAMS[i % TEAMS.length];
  const players = generateRoster(team);
  const ts = state(players, defaultLineup(players));
  const t = lineupTerms(ts);
  if (!t) continue;
  rows.push(t);
  byPrestige.push([team.prestige, Object.values(t).reduce((a, b) => a + b, 0)]);

  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  appetites.push(
    ts.rotation.starters.reduce(
      (s, x) => s + Math.max(0, (ARCHETYPES_BY_ID[byId[x.id].archetype]?.usage ?? 1) - 1),
      0
    )
  );
  // Raw (un-netted) best interior-scoring edge in the five — the PAINT_BASE input.
  paintBases.push(
    Math.max(...ts.rotation.starters.map((x) => (byId[x.id].attrs.inside - byId[x.id].overall) / 12))
  );
}

console.log(`\n=== LINEUP CHEMISTRY — ${rows.length} default lineups ===\n`);
console.log('term                mean      sd     p05     p95     min     max');
for (const { key, label } of FIT_TERMS) {
  const v = rows.map((r) => r[key]);
  console.log(
    `${label.padEnd(18)}${f(mean(v))} ${f(sd(v))} ${f(pct(v, 0.05))} ${f(pct(v, 0.95))} ` +
      `${f(Math.min(...v))} ${f(Math.max(...v))}`
  );
}

const totals = rows.map((r) => Object.values(r).reduce((a, b) => a + b, 0));
console.log(
  `${'TOTAL (raw)'.padEnd(18)}${f(mean(totals))} ${f(sd(totals))} ${f(pct(totals, 0.05))} ` +
    `${f(pct(totals, 0.95))} ${f(Math.min(...totals))} ${f(Math.max(...totals))}`
);

// --------------------------------------------------------------- constants
console.log('\n--- constants to hard-code in engine/lineup.js ---');
console.log(
  `appetite (stacked ball-dominance): mean ${mean(appetites).toFixed(2)} sd ${sd(appetites).toFixed(2)} ` +
    `p50 ${pct(appetites, 0.5).toFixed(2)} p90 ${pct(appetites, 0.9).toFixed(2)} ` +
    `p99 ${pct(appetites, 0.99).toFixed(2)} max ${Math.max(...appetites).toFixed(2)}`
);
console.log(`PAINT_BASE   = ${mean(paintBases).toFixed(2)}   (sd ${sd(paintBases).toFixed(2)})`);
console.log(`FIT_CENTER   = ${mean(totals).toFixed(3)}`);
console.log('FIT_TERMS base/scale (leave `clash` on its absolute 0 / 0.2):');
for (const { key, label } of FIT_TERMS) {
  const v = rows.map((r) => r[key]);
  console.log(`  ${key.padEnd(12)} base: ${mean(v).toFixed(3).padStart(7)}  scale: ${sd(v).toFixed(3)}   (${label})`);
}

// The grades users actually see. If a term is stuck on one word the scale is
// wrong, and the report is telling everyone in the league the same thing.
console.log('\n--- grade distribution as shown in the lineup report ---');
for (const { key, label } of FIT_TERMS) {
  const counts = {};
  rows.forEach((r) => {
    const w = fitGrade(key, r[key]).word;
    counts[w] = (counts[w] || 0) + 1;
  });
  const line = ['Poor', 'Thin', 'Fine', 'Strong', 'Elite']
    .map((w) => `${w} ${(((counts[w] || 0) / rows.length) * 100).toFixed(0)}%`.padEnd(11))
    .join('');
  console.log(`${label.padEnd(18)}${line}`);
}

// Chemistry must not correlate with prestige, or it just amplifies talent and
// quietly re-tilts the whole league toward the blue-bloods.
const px = byPrestige.map((r) => r[0]);
const py = byPrestige.map((r) => r[1]);
const mx = mean(px);
const my = mean(py);
const cov = mean(byPrestige.map(([a, b]) => (a - mx) * (b - my)));
console.log(`corr(prestige, chemistry) = ${(cov / (sd(px) * sd(py))).toFixed(3)}   (want ~0)`);

// ------------------------------------------------------- how much is on offer
// Search every single swap from the default lineup. Two numbers matter and they
// are NOT the same: the total strength change (which includes simply demoting a
// good player, and should stay dominated by talent) and the chemistry change
// alone (what the new system actually put on the table).
const gains = [];
const losses = [];
const chemRange = [];
const chemGain = [];
const rearrangeChem = []; // starter<->starter only: talent held fixed

for (let i = 0; i < 600; i++) {
  const team = TEAMS[i % TEAMS.length];
  const players = generateRoster(team);
  const rot = defaultLineup(players);
  const st = state(players, rot);
  const base = teamStrength(st);
  const baseChem = lineupFit(st);

  let best = base;
  let worst = base;
  let chemHi = baseChem;
  let chemLo = baseChem;
  let reHi = baseChem;

  const trySwap = (mut, rearrangeOnly) => {
    const r = {
      starters: rot.starters.map((s) => ({ ...s })),
      bench: [...rot.bench],
      starId: rot.starId,
    };
    mut(r);
    const s2 = state(players, r);
    const v = teamStrength(s2);
    const c = lineupFit(s2);
    if (v > best) best = v;
    if (v < worst) worst = v;
    if (c > chemHi) chemHi = c;
    if (c < chemLo) chemLo = c;
    if (rearrangeOnly && c > reHi) reHi = c;
  };

  for (let a = 0; a < 5; a++) {
    for (let b = a + 1; b < 5; b++) {
      trySwap((r) => {
        const t = r.starters[a].id;
        r.starters[a].id = r.starters[b].id;
        r.starters[b].id = t;
      }, true);
    }
    for (let b = 0; b < rot.bench.length; b++) {
      trySwap((r) => {
        const t = r.starters[a].id;
        r.starters[a].id = r.bench[b];
        r.bench[b] = t;
      }, false);
    }
  }
  gains.push(best - base);
  losses.push(worst - base);
  chemRange.push(chemHi - chemLo);
  chemGain.push(chemHi - baseChem);
  rearrangeChem.push(reHi - baseChem);
}

console.log('\n--- edge available from ONE swap off the default (rating points) ---');
console.log(`total strength  best ${mean(gains).toFixed(2)} (max ${Math.max(...gains).toFixed(2)})` +
  `   worst ${mean(losses).toFixed(2)} (min ${Math.min(...losses).toFixed(2)})`);
console.log(`chemistry alone best ${mean(chemGain).toFixed(2)} (max ${Math.max(...chemGain).toFixed(2)})` +
  `   full range ${mean(chemRange).toFixed(2)} (max ${Math.max(...chemRange).toFixed(2)})`);
console.log(`chemistry from pure rearrangement (no talent change): ` +
  `mean best ${mean(rearrangeChem).toFixed(2)}, max ${Math.max(...rearrangeChem).toFixed(2)}`);
console.log(`rosters with a strength improvement available: ` +
  `${((gains.filter((g) => g > 0.01).length / gains.length) * 100).toFixed(0)}%`);

// ---------------------------------------------------------- shape scenarios
// The terms are supposed to CONFLICT. Force deliberately lopsided fives out of
// each roster and check that each one is punished by the thing it gave up. If
// any of these comes out positive the model is just rewarding talent again.
const scenarios = {
  'top 5 talent (ignore position)': (ps) => [...ps].sort((a, b) => b.overall - a.overall).slice(0, 5),
  'five biggest (stack the paint)': (ps) => [...ps].sort((a, b) => b.attrs.interiorD - a.attrs.interiorD).slice(0, 5),
  'five shooters (small ball)': (ps) => [...ps].sort((a, b) => b.attrs.outside - a.attrs.outside).slice(0, 5),
  'five ball handlers': (ps) => [...ps].sort((a, b) => b.attrs.playmaking - a.attrs.playmaking).slice(0, 5),
  'no creator (bottom playmaking)': (ps) => [...ps].sort((a, b) => a.attrs.playmaking - b.attrs.playmaking).slice(0, 5),
};

// The honest version of the marquee case. Forcing "five biggest" also changes
// how good the five are, and chemistry is talent-neutral by construction, so
// that test confounds shape with level. This one holds talent as close to fixed
// as a roster allows: take the default five, and swap its best shooter for the
// bench player of the CLOSEST overall who can't shoot. Pure shape, same level.
{
  const deltas = [];
  const spac = [];
  const inter = [];
  for (let i = 0; i < 800; i++) {
    const players = generateRoster(TEAMS[i % TEAMS.length]);
    const rot = defaultLineup(players);
    const byId = Object.fromEntries(players.map((p) => [p.id, p]));
    const five = rot.starters.map((s) => byId[s.id]);
    // the starter whose game most depends on shooting
    const shooter = five.reduce((a, b) =>
      b.attrs.outside - b.overall > a.attrs.outside - a.overall ? b : a
    );
    // closest-rated bench player who is not a shooter
    const cand = rot.bench
      .map((id) => byId[id])
      .filter((p) => p.attrs.outside - p.overall < 0)
      .sort((a, b) => Math.abs(a.overall - shooter.overall) - Math.abs(b.overall - shooter.overall))[0];
    if (!cand) continue;
    const idx = rot.starters.findIndex((s) => s.id === shooter.id);
    const swapped = {
      starters: rot.starters.map((s, k) => (k === idx ? { ...s, id: cand.id } : { ...s })),
      bench: rot.bench.map((id) => (id === cand.id ? shooter.id : id)),
      starId: rot.starId,
    };
    const a = lineupTerms(state(players, swapped));
    const b = lineupTerms(state(players, rot));
    deltas.push(lineupFit(state(players, swapped)) - lineupFit(state(players, rot)));
    spac.push(a.spacing - b.spacing);
    inter.push(a.interior - b.interior);
  }
  console.log(
    `\n--- benching your shooter for an equally-rated non-shooter (${deltas.length} rosters) ---\n` +
      `chemistry ${sign(mean(deltas))}   spacing ${sign(mean(spac))}   ` +
      `interior scoring ${sign(mean(inter))}   ` +
      `(worse in ${((deltas.filter((d) => d < 0).length / deltas.length) * 100).toFixed(0)}% of rosters)`
  );
}

console.log('\n--- forced lineup shapes vs the balanced default (chemistry only) ---');
for (const [name, choose] of Object.entries(scenarios)) {
  const deltas = [];
  const breakdown = {};
  for (let i = 0; i < 600; i++) {
    const players = generateRoster(TEAMS[i % TEAMS.length]);
    const rot = defaultLineup(players);
    const five = choose(players);
    const rest = players.filter((p) => !five.includes(p));
    const forced = {
      starters: POSITIONS.map((pos, k) => ({ pos, id: five[k].id })),
      bench: rest.map((p) => p.id),
      starId: rot.starId,
    };
    deltas.push(lineupFit(state(players, forced)) - lineupFit(state(players, rot)));
    const a = lineupTerms(state(players, forced));
    const b = lineupTerms(state(players, rot));
    FIT_TERMS.forEach(({ key }) => (breakdown[key] = (breakdown[key] || 0) + (a[key] - b[key]) / 600));
  }
  const worst = FIT_TERMS.map(({ key, label }) => [label, breakdown[key]]).sort((x, y) => x[1] - y[1]);
  console.log(
    `${name.padEnd(32)} ${sign(mean(deltas))}   ` +
      `hurt most: ${worst[0][0]} ${sign(worst[0][1])}, ${worst[1][0]} ${sign(worst[1][1])}` +
      `   | helped: ${worst[worst.length - 1][0]} ${sign(worst[worst.length - 1][1])}`
  );
}

// Sanity: default lineups should still never play anyone out of position, and
// centered chemistry should average ~0.
let outOfPos = 0;
const centered = [];
for (let i = 0; i < 500; i++) {
  const players = generateRoster(TEAMS[i % TEAMS.length]);
  const rot = defaultLineup(players);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  rot.starters.forEach((s) => {
    if (byId[s.id].position !== s.pos) outOfPos++;
  });
  centered.push(lineupFit(state(players, rot)));
}
console.log(`\ndefault lineups out of position: ${outOfPos} (want 0)`);
console.log(`centered chemistry: mean ${mean(centered).toFixed(3)} (want ~0), sd ${sd(centered).toFixed(3)}\n`);
