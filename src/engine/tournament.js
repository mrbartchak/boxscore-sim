// Single-elimination tournaments: conference tournaments and the 64-team
// national championship bracket. Games carry calendar dates and feeder links so
// the same day-by-day simulation loop can drive them.

import { CONFERENCES, TEAMS_BY_ID } from '../data/teams.js';
import { addDays } from './schedule.js';
import { conferenceStandings, powerRating } from './rankings.js';

let _tid = 0;

// Seed positions in bracket order for a single-elim bracket of size n (pow 2).
export function seedOrder(n) {
  let arr = [1, 2];
  const rounds = Math.log2(n);
  for (let r = 1; r < rounds; r++) {
    const sum = arr.length * 2 + 1;
    const next = [];
    for (const s of arr) next.push(s, sum - s);
    arr = next;
  }
  return arr;
}

// Build a single-elim bracket. teamsBySeed[0] is the #1 seed, etc.
// Later-round games start with null participants and are filled by feeders.
export function buildSingleElim(teamsBySeed, startDate, gapDays, phase) {
  const n = teamsBySeed.length; // power of 2
  const order = seedOrder(n);
  const numRounds = Math.log2(n);
  const games = [];

  let prevRound = [];
  let date = startDate;
  for (let i = 0; i < n; i += 2) {
    const seedA = order[i];
    const seedB = order[i + 1];
    const g = {
      id: `x${_tid++}`,
      phase,
      round: 0,
      date,
      neutral: true,
      homeId: teamsBySeed[seedA - 1],
      awayId: teamsBySeed[seedB - 1],
      seedHome: seedA,
      seedAway: seedB,
      played: false,
      result: null,
      nextGameId: null,
      nextSlot: null,
    };
    games.push(g);
    prevRound.push(g);
  }

  for (let r = 1; r < numRounds; r++) {
    date = addDays(date, gapDays);
    const cur = [];
    for (let i = 0; i < prevRound.length; i += 2) {
      const g = {
        id: `x${_tid++}`,
        phase,
        round: r,
        date,
        neutral: true,
        homeId: null,
        awayId: null,
        seedHome: null,
        seedAway: null,
        played: false,
        result: null,
        nextGameId: null,
        nextSlot: null,
      };
      prevRound[i].nextGameId = g.id;
      prevRound[i].nextSlot = 'home';
      prevRound[i + 1].nextGameId = g.id;
      prevRound[i + 1].nextSlot = 'away';
      games.push(g);
      cur.push(g);
    }
    prevRound = cur;
  }

  return { games, lastDate: date, finalGameId: prevRound[0].id };
}

// One 8-team single-elim tournament per conference (top 8 by conf record).
export function seedConferenceTournaments(teamStates, startDate) {
  const allGames = [];
  const finals = {}; // conference -> final game id
  let lastDate = startDate;

  for (const conf of CONFERENCES) {
    const standings = conferenceStandings(teamStates, conf).slice(0, 8);
    const teamsBySeed = standings.map((ts) => ts.teamId);
    const { games, lastDate: d, finalGameId } = buildSingleElim(
      teamsBySeed,
      startDate,
      2,
      'CONF_TOURNEY'
    );
    games.forEach((g) => (g.conference = conf));
    allGames.push(...games);
    finals[conf] = finalGameId;
    lastDate = d;
  }

  return { games: allGames, finals, lastDate };
}

// Select the 64-team national field: conference champions get automatic bids,
// the rest are at-large by power rating. All 64 are seeded 1-64 by rating.
export function selectNationalField(teamStates, championIds) {
  const champSet = new Set(championIds);
  const ranked = Object.values(teamStates)
    .map((ts) => ({ teamId: ts.teamId, rating: powerRating(ts) }))
    .sort((a, b) => b.rating - a.rating);

  const field = [...championIds];
  for (const r of ranked) {
    if (field.length >= 64) break;
    if (!champSet.has(r.teamId)) field.push(r.teamId);
  }

  // Seed the 64 by rating (champions included in the sort).
  const ratingOf = Object.fromEntries(ranked.map((r) => [r.teamId, r.rating]));
  return field
    .slice(0, 64)
    .sort((a, b) => ratingOf[b] - ratingOf[a]);
}

export function buildNationalBracket(seededTeamIds, startDate) {
  const { games, lastDate, finalGameId } = buildSingleElim(
    seededTeamIds,
    startDate,
    3,
    'NATIONAL'
  );
  return { games, lastDate, finalGameId };
}

export const NATIONAL_ROUND_NAMES = [
  'Round of 64',
  'Round of 32',
  'Sweet 16',
  'Elite Eight',
  'Final Four',
  'Championship',
];

export const CONF_ROUND_NAMES = ['Quarterfinals', 'Semifinals', 'Final'];
