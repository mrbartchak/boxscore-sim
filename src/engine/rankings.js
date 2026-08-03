// Ranking computations for teams (overall + per conference) and players (league).

import { TEAMS_BY_ID } from '../data/teams.js';
import { playerAverages } from './players.js';

// A blended power rating: win%, scoring margin, and prestige as a light
// strength-of-schedule proxy (helps compare across conferences early on).
export function powerRating(ts) {
  const games = ts.record.w + ts.record.l;
  const winPct = games ? ts.record.w / games : 0.5;
  const margin = games ? (ts.pf - ts.pa) / games : 0;
  const team = TEAMS_BY_ID[ts.teamId];
  return winPct * 100 + margin * 1.5 + team.prestige * 0.25;
}

export function rankTeams(teamStates) {
  return Object.values(teamStates)
    .map((ts) => ({ ts, rating: powerRating(ts) }))
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
      const avg = playerAverages(p);
      rows.push({
        player: p,
        teamId: ts.teamId,
        value: avg[stat],
        gp: p.gp,
      });
    });
  });
  const played = rows.filter((r) => r.gp > 0);
  const pool = played.length ? played : rows;
  return pool.sort((a, b) => b.value - a.value).slice(0, limit);
}
