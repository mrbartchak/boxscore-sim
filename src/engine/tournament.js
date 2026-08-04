// Single-elimination tournaments: conference tournaments and the 64-team
// national championship bracket. Games carry calendar dates and feeder links so
// the same day-by-day simulation loop can drive them.

import { CONFERENCES, TEAMS_BY_ID } from '../data/teams.js';
import { addDays } from './schedule.js';
import { conferenceStandings, powerRating, ratingContext } from './rankings.js';

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

// Select the national field the way the selection committee does: every
// conference tournament champion takes an automatic bid no matter how bad their
// resume, and the remaining spots go at-large to the best resumes left on the
// board. All 64 are then seeded 1-64 on the same rating — which is how a
// one-bid-league champion ends up a 15 or 16 seed.
//
// (The real event is 68 with a First Four play-in; this bracket is the 64-team
// field the play-in feeds, so those four games are the deliberate omission.)
export function selectNationalField(teamStates, championIds) {
  const champSet = new Set(championIds);
  const ctx = ratingContext(teamStates);
  const ranked = Object.values(teamStates)
    .map((ts) => ({ teamId: ts.teamId, rating: powerRating(ts, ctx) }))
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

export const REGIONS = ['East', 'West', 'South', 'Midwest'];

// Distribute 64 overall-seeded teams into 4 regions of 16 on the committee's
// S-curve: each seed line is dealt across the regions, alternating direction, so
// the strongest 1 seed is paired with the weakest 2 seed and the weakest 16.
// regions[r][line] holds that region's seed number line+1.
function assignRegions(seeded) {
  const regions = [[], [], [], []];
  for (let line = 0; line < 16; line++) {
    const group = seeded.slice(line * 4, line * 4 + 4);
    const order = line % 2 === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];
    order.forEach((regionIdx, i) => {
      regions[regionIdx][line] = group[i];
    });
  }
  return regions;
}

// Seed lines that share a path to the Sweet 16. Within a pod the four teams meet
// each other in the first two rounds: 1/16 vs 8/9, 5/12 vs 4/13, and so on.
const POD_LINES = [
  [0, 15, 7, 8], // 1, 16, 8, 9
  [4, 11, 3, 12], // 5, 12, 4, 13
  [5, 10, 2, 13], // 6, 11, 3, 14
  [6, 9, 1, 14], // 7, 10, 2, 15
];

// The committee never lets conference rivals meet early. Because our regular
// season is a double round-robin, every same-conference pair has already played
// twice — which under the real bracketing principles puts them off-limits to
// each other until the Sweet 16.
//
// Fixed by hill-climbing on swaps WITHIN a seed line across regions, which is
// the same tool the committee uses: moving a 12 seed from the East to the West
// keeps the bracket's seed structure intact and costs only a little S-curve
// precision, which the real committee also trades away for this rule.
function separateConferences(regions) {
  const confOf = (id) => TEAMS_BY_ID[id].conference;

  const conflictsIn = (r) => {
    let n = 0;
    for (const pod of POD_LINES) {
      const seen = new Set();
      for (const line of pod) {
        const c = confOf(regions[r][line]);
        if (seen.has(c)) n++;
        else seen.add(c);
      }
    }
    return n;
  };
  const totalConflicts = () => regions.reduce((sum, _, r) => sum + conflictsIn(r), 0);

  let best = totalConflicts();
  for (let pass = 0; pass < 6 && best > 0; pass++) {
    for (let line = 0; line < 16; line++) {
      for (let r = 0; r < 4; r++) {
        for (let other = r + 1; other < 4; other++) {
          const a = regions[r][line];
          const b = regions[other][line];
          regions[r][line] = b;
          regions[other][line] = a;
          const after = totalConflicts();
          if (after < best) {
            best = after;
          } else {
            regions[r][line] = a; // no improvement, put them back
            regions[other][line] = b;
          }
        }
      }
    }
  }
  return regions;
}

// The 64-team national bracket: four 16-team regions feeding a Final Four and
// Championship. Regions 0,1 form the left half; 2,3 the right half.
export function buildNationalBracket(seededTeamIds, startDate) {
  const regions = separateConferences(assignRegions(seededTeamIds));
  const games = [];
  const regionFinals = [];
  let regionLastDate = startDate;

  regions.forEach((teamsBySeed, r) => {
    const { games: rGames, lastDate, finalGameId } = buildSingleElim(
      teamsBySeed,
      startDate,
      2,
      'NATIONAL'
    );
    rGames.forEach((g) => (g.region = r));
    games.push(...rGames);
    regionFinals.push(finalGameId);
    regionLastDate = lastDate;
  });

  const ffDate = addDays(regionLastDate, 3);
  const champDate = addDays(ffDate, 2);

  const mkGame = (round, date) => ({
    id: `x${_tid++}`,
    phase: 'NATIONAL',
    round,
    date,
    region: null,
    neutral: true,
    homeId: null,
    awayId: null,
    seedHome: null,
    seedAway: null,
    played: false,
    result: null,
    nextGameId: null,
    nextSlot: null,
  });

  const ffA = mkGame(4, ffDate); // regions 0 vs 1 (left half)
  const ffB = mkGame(4, ffDate); // regions 2 vs 3 (right half)
  const champ = mkGame(5, champDate);
  ffA.ffRegions = [0, 1];
  ffB.ffRegions = [2, 3];

  const link = (fromId, toGame, slot) => {
    const g = games.find((x) => x.id === fromId);
    g.nextGameId = toGame.id;
    g.nextSlot = slot;
  };
  link(regionFinals[0], ffA, 'home');
  link(regionFinals[1], ffA, 'away');
  link(regionFinals[2], ffB, 'home');
  link(regionFinals[3], ffB, 'away');
  ffA.nextGameId = champ.id; ffA.nextSlot = 'home';
  ffB.nextGameId = champ.id; ffB.nextSlot = 'away';

  games.push(ffA, ffB, champ);
  return { games, lastDate: champDate, finalGameId: champ.id };
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
