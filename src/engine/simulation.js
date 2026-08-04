// Game simulation: team strength from the active rotation, final score, and a
// per-player box score that accumulates into season stats.

import { gaussian, clamp, rand } from './random.js';
import { POSITIONS, effectiveOverall } from './players.js';
import {
  MARGIN_SD_VS_SPREAD,
  TYPICAL_GAME_TOTAL,
  HOME_COURT_POINTS,
} from '../data/marchmadness.js';

const TOTAL_MINUTES = 200; // 5 players * 40 minutes

// Rating points -> expected point margin. Calibrated so the strength gaps this
// engine produces between seed lines land on the historical first-round spreads
// in data/marchmadness.js (a 1 vs 16 is ~23.5, an 8 vs 9 is a pick'em).
// See scripts/calibrate.mjs — re-run it if you touch roster generation.
export const MARGIN_PER_RATING = 1.8;

// Game-to-game noise. Real college margins scatter ~11 points around the spread;
// this single constant is why a 20-point favorite still loses sometimes, and
// dropping it is the fastest way to make the bracket unrealistically chalky.
const MARGIN_SD = MARGIN_SD_VS_SPREAD;

// Single elimination on a neutral floor is noisier than a league game: no home
// crowd, an opponent nobody has scouted, and no chance to make it back tomorrow.
// About a point of extra scatter — enough to keep the deep rounds from going
// chalk without disturbing the regular season's calibration.
const TOURNEY_SD_BONUS = 1.1;

// Experience premium, in rating points, applied by minutes. Older rotations
// consistently outperform their raw talent in March — it's the best-documented
// reason veteran mid-majors knock off freshman-led blue-bloods.
const CLASS_BONUS = { FR: -1.2, SO: -0.3, JR: 0.5, SR: 1.2 };

// How far a team's March level drifts from the resume it was seeded on.
// Without this the bracket is far too chalky: our seeding is computed from true
// strength over a 30-game sample, so it is a near-perfect ranking, while the
// real committee is seeding a four-month-old resume for a team whose rotation,
// health and confidence have all moved since. That gap — not luck in any single
// game — is what actually produces Cinderella runs and blue-blood flameouts.
const POSTSEASON_FORM_SD = 0.9;

// Playing time is derived from the rotation, not set by hand. Starters share the
// bulk of the minutes; bench minutes fall off from the 6th man down to the 10th.
const STARTER_MIN = 30; // 5 x 30 = 150
const BENCH_MIN = [22, 13, 8, 5, 2]; // 6th..10th man -> 50

// Build a default rotation: the best player at each position starts, the rest
// fill the bench ordered by overall. Star = highest overall.
export function defaultLineup(players) {
  const byPos = {};
  POSITIONS.forEach((pos) => (byPos[pos] = []));
  players.forEach((p) => byPos[p.position].push(p));
  Object.values(byPos).forEach((arr) => arr.sort((a, b) => b.overall - a.overall));

  const used = new Set();
  const starters = POSITIONS.map((pos) => {
    const best = byPos[pos][0];
    used.add(best.id);
    return { pos, id: best.id };
  });
  const bench = players
    .filter((p) => !used.has(p.id))
    .sort((a, b) => b.overall - a.overall)
    .map((p) => p.id);
  const starId = [...players].sort((a, b) => b.overall - a.overall)[0].id;
  return { starters, bench, starId };
}

// Which lineup slot each starter is filling. Bench players aren't assigned a
// position — a bench unit is fluid, so reserves are never out of position.
export function slotPositions(teamState) {
  const out = {};
  teamState.rotation.starters.forEach((s) => {
    if (s.id) out[s.id] = s.pos;
  });
  return out;
}

// Minutes per player id, derived from starter/bench slot position.
export function rotationMinutes(teamState) {
  const out = {};
  teamState.players.forEach((p) => (out[p.id] = 0));
  teamState.rotation.starters.forEach((s) => {
    if (s.id) out[s.id] = STARTER_MIN;
  });
  teamState.rotation.bench.forEach((id, i) => {
    if (id) out[id] = BENCH_MIN[i] ?? 0;
  });
  return out;
}

// Overall team strength (roughly 40-99) from minutes-weighted player ratings,
// plus a small bump for the star and a minutes-weighted experience premium.
// Because this is minutes-weighted, a top-heavy roster is only as good as its
// bench lets it be — a thin blue-blood really does rate below a deep rival.
//
// Ratings are counted AT THE SLOT EACH PLAYER FILLS, not at his natural spot,
// so stacking your two best point guards costs you whatever the second one
// gives up sliding to the two. `defaultLineup` never plays anyone out of
// position, so this is worth exactly zero until a human moves someone — the
// league-wide calibration is untouched by design.
export function teamStrength(teamState) {
  const mins = rotationMinutes(teamState);
  const slots = slotPositions(teamState);
  let weighted = 0;
  let experience = 0;
  teamState.players.forEach((p) => {
    const share = mins[p.id] / TOTAL_MINUTES;
    weighted += effectiveOverall(p, slots[p.id]) * share;
    experience += (CLASS_BONUS[p.class] ?? 0) * share;
  });
  const star = teamState.players.find((p) => p.id === teamState.rotation.starId);
  const starBump = star ? (star.overall - 60) * 0.02 : 0;
  return weighted + starBump + experience + (teamState.form ?? 0);
}

// Re-roll every team's form. Called at each postseason phase change and ALWAYS
// after the field has been picked and seeded, so the committee is judging the
// resume and nothing else — exactly like the real thing.
export function rollPostseasonForm(teamStates) {
  const out = {};
  Object.values(teamStates).forEach((ts) => {
    out[ts.teamId] = { ...ts, form: gaussian(0, POSTSEASON_FORM_SD) };
  });
  return out;
}

// Distribute a team's points/assists/rebounds across players by tendency*minutes.
function boxScore(teamState, teamPts) {
  const mins = rotationMinutes(teamState);
  const players = teamState.players;

  const scoreW = players.map((p) => {
    const usage = p.id === teamState.rotation.starId ? 1.3 : 1;
    return Math.max(0.1, p.projPpg * (mins[p.id] / 24) * usage * (0.75 + rand() * 0.5));
  });
  const astW = players.map((p) => Math.max(0.02, p.projApg * (mins[p.id] / 24) * (0.6 + rand() * 0.8)));
  const rebW = players.map((p) => Math.max(0.05, p.projReb * (mins[p.id] / 24) * (0.6 + rand() * 0.8)));

  const teamAst = Math.round(clamp(teamPts * 0.28 + gaussian(0, 2), 6, 26));
  const teamReb = Math.round(clamp(gaussian(34, 4), 22, 48));

  const distribute = (weights, total) => {
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const rawVals = weights.map((w) => (w / sum) * total);
    const floored = rawVals.map((v) => Math.floor(v));
    let remainder = total - floored.reduce((a, b) => a + b, 0);
    // Hand out the rounding remainder to the largest fractional parts.
    const order = rawVals
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < remainder; k++) floored[order[k % order.length].i]++;
    return floored;
  };

  const pts = distribute(scoreW, teamPts);
  const ast = distribute(astW, teamAst);
  const reb = distribute(rebW, teamReb);

  return players.map((p, i) => ({
    playerId: p.id,
    min: Math.round(mins[p.id]),
    pts: pts[i],
    ast: ast[i],
    reb: reb[i],
  }));
}

// Simulate a single game. `home`/`away` are team states. Returns a result.
// `bracket` marks single-elimination games, which carry extra variance.
export function simulateGame(home, away, { neutral = false, bracket = false } = {}) {
  // Home court is worth POINTS, not rating — convert the rating gap to a margin
  // first, then add it, or the edge gets multiplied into something absurd.
  const ratingGap = teamStrength(home) - teamStrength(away);
  const expMargin = ratingGap * MARGIN_PER_RATING + (neutral ? 0 : HOME_COURT_POINTS);

  const margin = gaussian(expMargin, MARGIN_SD + (bracket ? TOURNEY_SD_BONUS : 0));
  const total = clamp(gaussian(TYPICAL_GAME_TOTAL, 12), 118, 192);

  let homePts = Math.round((total + margin) / 2);
  let awayPts = Math.round((total - margin) / 2);
  if (homePts === awayPts) {
    // Overtime: nudge the side that was favored.
    if (expMargin >= 0) homePts += 2;
    else awayPts += 2;
  }

  return {
    homeId: home.teamId,
    awayId: away.teamId,
    homePts,
    awayPts,
    winnerId: homePts > awayPts ? home.teamId : away.teamId,
    homeBox: scaleBox(boxScore(home, homePts), homePts),
    awayBox: scaleBox(boxScore(away, awayPts), awayPts),
    neutral,
  };
}

// Guarantee the box score points sum exactly to the team total.
function scaleBox(box, teamPts) {
  const sum = box.reduce((a, b) => a + b.pts, 0);
  let diff = teamPts - sum;
  let i = 0;
  while (diff !== 0 && box.length) {
    const idx = i % box.length;
    if (diff > 0) {
      box[idx].pts++;
      diff--;
    } else if (box[idx].pts > 0) {
      box[idx].pts--;
      diff++;
    }
    i++;
    if (i > 1000) break;
  }
  return box;
}
