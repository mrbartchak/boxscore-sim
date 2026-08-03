// Game simulation: team strength from the active rotation, final score, and a
// per-player box score that accumulates into season stats.

import { gaussian, clamp, rand } from './random.js';

const TOTAL_MINUTES = 200; // 5 players * 40 minutes
const HOME_ADVANTAGE = 3.2;

// Build a default rotation for a roster: top 5 by overall start (30 min each),
// the rest split bench minutes. Star = highest overall.
export function defaultRotation(players) {
  const sorted = [...players].sort((a, b) => b.overall - a.overall);
  const starters = sorted.slice(0, 5).map((p) => p.id);
  const minutes = {};
  players.forEach((p) => {
    minutes[p.id] = starters.includes(p.id) ? 30 : 10;
  });
  return { starters, minutes, starId: sorted[0].id };
}

// Normalize a rotation's minutes to exactly 200 player-minutes.
export function normalizedMinutes(teamState) {
  const { players, rotation } = teamState;
  const raw = {};
  let sum = 0;
  players.forEach((p) => {
    const m = Math.max(0, rotation.minutes[p.id] ?? 0);
    raw[p.id] = m;
    sum += m;
  });
  const out = {};
  if (sum === 0) {
    players.forEach((p) => (out[p.id] = TOTAL_MINUTES / players.length));
    return out;
  }
  players.forEach((p) => (out[p.id] = (raw[p.id] / sum) * TOTAL_MINUTES));
  return out;
}

// Overall team strength (roughly 40-99) from minutes-weighted player overalls,
// with a small bump for the star.
export function teamStrength(teamState) {
  const mins = normalizedMinutes(teamState);
  let weighted = 0;
  teamState.players.forEach((p) => {
    weighted += p.overall * (mins[p.id] / TOTAL_MINUTES);
  });
  const star = teamState.players.find((p) => p.id === teamState.rotation.starId);
  const starBump = star ? (star.overall - 60) * 0.02 : 0;
  return weighted + starBump;
}

// Distribute a team's points/assists/rebounds across players by tendency*minutes.
function boxScore(teamState, teamPts) {
  const mins = normalizedMinutes(teamState);
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
export function simulateGame(home, away, { neutral = false } = {}) {
  const sHome = teamStrength(home) + (neutral ? 0 : HOME_ADVANTAGE);
  const sAway = teamStrength(away);

  const expMargin = (sHome - sAway) * 0.9;
  const margin = gaussian(expMargin, 9);
  const total = clamp(gaussian(143, 12), 118, 192);

  let homePts = Math.round((total + margin) / 2);
  let awayPts = Math.round((total - margin) / 2);
  if (homePts === awayPts) {
    // Overtime: nudge the stronger side.
    if (sHome + (neutral ? HOME_ADVANTAGE : 0) >= sAway) homePts += 2;
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
