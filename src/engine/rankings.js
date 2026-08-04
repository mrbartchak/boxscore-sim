// Ranking computations for teams (overall + per conference) and players (league).

import { TEAMS_BY_ID, CONFERENCES } from '../data/teams.js';
import { seasonAverages } from './players.js';
import { teamStrength, MARGIN_PER_RATING } from './simulation.js';

// Average roster strength of each conference, and the league average. The
// regular season is played ENTIRELY inside the conference, so a team's schedule
// strength simply *is* its league's strength — there is nothing else to measure.
export function ratingContext(teamStates) {
  const all = Object.values(teamStates);
  const strengthById = {};
  all.forEach((ts) => (strengthById[ts.teamId] = teamStrength(ts)));

  const byConf = {};
  CONFERENCES.forEach((c) => (byConf[c] = []));
  all.forEach((ts) => byConf[TEAMS_BY_ID[ts.teamId].conference].push(strengthById[ts.teamId]));

  const confStrength = {};
  Object.entries(byConf).forEach(([c, xs]) => {
    confStrength[c] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  });
  const leagueAvg =
    all.reduce((a, ts) => a + strengthById[ts.teamId], 0) / (all.length || 1);

  return { confStrength, leagueAvg };
}

// Selection-committee-style resume rating, built on OPPONENT-ADJUSTED scoring
// margin the way the real NET is. Raw margin is the trap: a dominant team in a
// one-bid league piles up +20s against nobody, and rating that at face value
// puts them on the 4 line and eventually in a Final Four, which has never
// happened. Since the regular season is played entirely inside the conference,
// the adjustment is exact — a league that rates X points weak inflates every
// margin inside it by X * MARGIN_PER_RATING points.
export function powerRating(ts, ctx) {
  const games = ts.record.w + ts.record.l;
  if (!games) {
    // Preseason: nothing to judge but the program itself.
    return TEAMS_BY_ID[ts.teamId].prestige;
  }
  const winPct = ts.record.w / games;
  const margin = (ts.pf - ts.pa) / games;
  const conf = TEAMS_BY_ID[ts.teamId].conference;
  const sos = ctx ? ctx.confStrength[conf] - ctx.leagueAvg : 0;
  const adjMargin = margin + sos * MARGIN_PER_RATING;
  // Efficiency leads, record still counts — the committee rewards winning.
  return adjMargin * 2 + winPct * 25;
}

export function rankTeams(teamStates) {
  const ctx = ratingContext(teamStates);
  return Object.values(teamStates)
    .map((ts) => ({ ts, rating: powerRating(ts, ctx) }))
    .sort((a, b) => b.rating - a.rating)
    .map((x, i) => ({ ...x, rank: i + 1 }));
}

export function rankTeamsInConference(teamStates, conference) {
  return rankTeams(teamStates).filter(
    (x) => TEAMS_BY_ID[x.ts.teamId].conference === conference
  ).map((x, i) => ({ ...x, confRank: i + 1 }));
}

// Conference standings ordered by conference record (then overall win%).
export function conferenceStandings(teamStates, conference) {
  return Object.values(teamStates)
    .filter((ts) => TEAMS_BY_ID[ts.teamId].conference === conference)
    .sort((a, b) => {
      const ap = a.confRecord.w - a.confRecord.l;
      const bp = b.confRecord.w - b.confRecord.l;
      if (bp !== ap) return bp - ap;
      return b.record.w - a.record.w;
    });
}

// League-wide player leaderboards. `stat` is 'ppg' | 'apg' | 'rpg'.
// Only counts players with at least `minGames` played (unless none yet).
export function leaderboard(teamStates, stat, limit = 25) {
  const rows = [];
  Object.values(teamStates).forEach((ts) => {
    ts.players.forEach((p) => {
      const avg = seasonAverages(p);
      rows.push({
        player: p,
        teamId: ts.teamId,
        value: avg ? avg[stat] : 0,
        gp: p.gp,
      });
    });
  });
  const played = rows.filter((r) => r.gp > 0);
  const pool = played.length ? played : rows;
  return pool.sort((a, b) => b.value - a.value).slice(0, limit);
}
