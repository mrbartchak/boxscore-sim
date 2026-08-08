// Single-elimination tournaments: conference tournaments and the 64-team
// national championship bracket. Games carry calendar dates and feeder links so
// the same day-by-day simulation loop can drive them.

import { CONFERENCES, TEAMS_BY_ID } from '../data/teams.js';
import {
  CONF_TOURNEY_FORMATS,
  DEFAULT_FORMAT,
  fieldSize,
} from '../data/conferenceTournaments.js';
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

// The vertical order the 16 lines of a region are printed in. Same matchups and
// the same tree as `seedOrder(16)` — consecutive pairs still feed the same
// second-round game, so only the way the bracket READS changes. This is the
// order every printed bracket uses, and the one people expect to scan.
export const REGION_LINE_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];

// Build a single-elim bracket. teamsBySeed[0] is the #1 seed, etc.
// Later-round games start with null participants and are filled by feeders.
//
// `teamsBySeed` may be SHORTER than the bracket, in which case the top seeds
// draw byes: their first-round game is never created and they are placed
// straight into round two. (Conference tournaments no longer come through here —
// their brackets are staggered, not powers of two. See `buildStaggered`.)
export function buildSingleElim(teamsBySeed, startDate, gapDays, phase, lineOrder) {
  const size = 1 << Math.ceil(Math.log2(Math.max(2, teamsBySeed.length)));
  const order = lineOrder && lineOrder.length === size ? lineOrder : seedOrder(size);
  const numRounds = Math.log2(size);
  const games = [];
  const teamAt = (seed) => teamsBySeed[seed - 1] ?? null;

  // Round 0 entries are either a real game or a bye carrying a team forward.
  let date = startDate;
  let prevRound = [];
  for (let i = 0; i < size; i += 2) {
    const seedA = order[i];
    const seedB = order[i + 1];
    const teamA = teamAt(seedA);
    const teamB = teamAt(seedB);

    if (teamA && teamB) {
      const g = {
        id: `x${_tid++}`,
        phase,
        round: 0,
        date,
        neutral: true,
        homeId: teamA,
        awayId: teamB,
        seedHome: seedA,
        seedAway: seedB,
        played: false,
        result: null,
        nextGameId: null,
        nextSlot: null,
      };
      games.push(g);
      prevRound.push({ game: g });
    } else {
      // A bye: whoever is present advances with their seed intact.
      const teamId = teamA ?? teamB;
      prevRound.push({ bye: { teamId, seed: teamA ? seedA : seedB } });
    }
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
      [prevRound[i], prevRound[i + 1]].forEach((entry, k) => {
        const slot = k === 0 ? 'home' : 'away';
        if (entry.game) {
          entry.game.nextGameId = g.id;
          entry.game.nextSlot = slot;
        } else if (entry.bye) {
          g[slot === 'home' ? 'homeId' : 'awayId'] = entry.bye.teamId;
          g[slot === 'home' ? 'seedHome' : 'seedAway'] = entry.bye.seed;
        }
      });
      games.push(g);
      cur.push({ game: g });
    }
    prevRound = cur;
  }

  return { games, lastDate: date, finalGameId: prevRound[0].game.id };
}

// ---------- Conference tournaments ----------
//
// Conference brackets are not the clean powers of two the national bracket is.
// A league seats 7, 13, 15 teams and buys its best programs rest by giving them
// byes — so a round holds however many teams the last round left plus whoever
// enters at it, and the bracket runs as many rounds as that takes. That shape is
// described by `entries` (see `data/conferenceTournaments.js`); this is the
// builder for it.

// How many rounds a format takes to crown a champion.
export function formatRounds(entries) {
  let alive = 0;
  let rounds = 0;
  for (let r = 0; ; r++) {
    alive += entries[r] ?? 0;
    if (alive <= 1) return rounds;
    alive = Math.ceil(alive / 2);
    rounds++;
  }
}

// Trim a format to a league that is smaller than the one it was written for.
// The field can only ever lose its worst seeds, so teams come off the front —
// the round the lowest seeds enter at.
function fitFormat(entries, teamCount) {
  const fitted = [...entries];
  let over = fieldSize(fitted) - teamCount;
  for (let r = 0; over > 0 && r < fitted.length; r++) {
    const cut = Math.min(fitted[r], over);
    fitted[r] -= cut;
    over -= cut;
  }
  while (fitted.length > 1 && fitted[0] === 0) fitted.shift();
  return fitted;
}

// The format a conference will actually play, given how many members it has.
// The UI asks this before the bracket exists — the season summary has to name
// the field you either made or missed.
export function confTourneyFormat(conf, teamCount) {
  return fitFormat(CONF_TOURNEY_FORMATS[conf] ?? DEFAULT_FORMAT, teamCount);
}

// Which round a seed opens in — 0 for the teams who play the first day, higher
// for the byes. What a fan actually wants to know off the standings.
export function seedEntryRound(entries, seed) {
  let lowest = fieldSize(entries);
  for (let r = 0; r < entries.length; r++) {
    const top = lowest - entries[r] + 1;
    if (seed >= top && seed <= lowest) return r;
    lowest = top - 1;
  }
  return null; // outside the field
}

// Build a bracket from an entry schedule. `teamsBySeed[0]` is the 1 seed.
//
// Within a round the pairing is always best-remaining against worst-remaining,
// where a game's "seed" is the best seed that can come out of it. That single
// rule reproduces every real bracket: 5v12 and 8v9 in a 16-team field, and the
// 8 seed drawing the 9/12 winner on a stepladder.
export function buildStaggered(teamsBySeed, entries, startDate, gapDays, phase) {
  const games = [];
  let alive = []; // { seed, teamId } for a team, or { seed, game } for a winner
  let date = startDate;
  let lastDate = startDate;

  // Byes go to the top of the standings, so a round's entrants are the WORST
  // seeds left: the first round seats the bottom of the field and the seed
  // numbers count back up from there.
  let lowest = teamsBySeed.length;

  for (let round = 0; ; round++) {
    const entering = Math.min(entries[round] ?? 0, lowest);
    for (let seed = lowest - entering + 1; seed <= lowest; seed++) {
      alive.push({ seed, teamId: teamsBySeed[seed - 1] });
    }
    lowest -= entering;
    if (alive.length <= 1) break;

    alive.sort((a, b) => a.seed - b.seed);
    const next = [];
    let list = alive;
    // The real formats never leave an odd round; a field trimmed to a smaller
    // league can, and then the top seed sits the round out.
    if (list.length % 2 === 1) {
      next.push(list[0]);
      list = list.slice(1);
    }

    for (let i = 0, j = list.length - 1; i < j; i++, j--) {
      const top = list[i];
      const bot = list[j];
      const g = {
        id: `x${_tid++}`,
        phase,
        round,
        date,
        neutral: true,
        homeId: top.teamId ?? null,
        awayId: bot.teamId ?? null,
        seedHome: top.teamId ? top.seed : null,
        seedAway: bot.teamId ? bot.seed : null,
        played: false,
        result: null,
        nextGameId: null,
        nextSlot: null,
      };
      if (top.game) { top.game.nextGameId = g.id; top.game.nextSlot = 'home'; }
      if (bot.game) { bot.game.nextGameId = g.id; bot.game.nextSlot = 'away'; }
      games.push(g);
      next.push({ seed: top.seed, game: g });
    }

    alive = next;
    lastDate = date;
    date = addDays(date, gapDays);
  }

  orderForDisplay(games);
  return { games, lastDate, finalGameId: alive[0].game.id };
}

// Bracket order for printing. Pairing by seed builds a round as 1v8, 2v7, 3v6,
// 4v5 — correct matchups, but 1v8 and 4v5 are the two that feed the same next
// game, so read top to bottom the tree crosses over itself. Walking back from
// the final puts every game beside the one it feeds, which is the order a
// printed bracket uses; `bracketPos` is what the UI sorts a round on.
function orderForDisplay(games) {
  const feeders = {};
  games.forEach((g) => {
    if (g.nextGameId) (feeders[g.nextGameId] ||= { home: null, away: null })[g.nextSlot] = g;
  });

  let level = games.filter((g) => !g.nextGameId);
  while (level.length) {
    level.forEach((g, i) => (g.bracketPos = i));
    level = level.flatMap((g) => {
      const f = feeders[g.id];
      return f ? [f.home, f.away].filter(Boolean) : [];
    });
  }
}

// One tournament per conference, each in its own real format. They all end on
// the same day — championship Saturday — so the longer brackets simply tip off
// earlier in the week, exactly as they do in March.
export function seedConferenceTournaments(teamStates, startDate) {
  const allGames = [];
  const finals = {}; // conference -> final game id
  const formats = {}; // conference -> the entry schedule actually used

  for (const conf of CONFERENCES) {
    const teamCount = conferenceStandings(teamStates, conf).length;
    formats[conf] = fitFormat(CONF_TOURNEY_FORMATS[conf] ?? DEFAULT_FORMAT, teamCount);
  }
  const maxRounds = Math.max(...CONFERENCES.map((c) => formatRounds(formats[c])));
  const lastDate = addDays(startDate, maxRounds - 1);

  for (const conf of CONFERENCES) {
    const entries = formats[conf];
    const standings = conferenceStandings(teamStates, conf).slice(0, fieldSize(entries));
    const teamsBySeed = standings.map((ts) => ts.teamId);
    const confStart = addDays(lastDate, -(formatRounds(entries) - 1));
    const { games, finalGameId } = buildStaggered(
      teamsBySeed,
      entries,
      confStart,
      1,
      'CONF_TOURNEY'
    );
    games.forEach((g) => (g.conference = conf));
    allGames.push(...games);
    finals[conf] = finalGameId;
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
      'NATIONAL',
      REGION_LINE_ORDER
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

// Conference brackets run anywhere from two rounds (Ivy Madness) to seven (the
// Sun Belt stepladder), so the round names are counted BACK from the title game
// the way every league names them: the last three are always the quarters, the
// semis and the final, and whatever comes before that is a numbered round.
const ORDINAL_ROUNDS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];

export function confRoundNames(rounds) {
  const tail = ['Quarterfinals', 'Semifinals', 'Championship'].slice(Math.max(0, 3 - rounds));
  const lead = Array.from(
    { length: Math.max(0, rounds - tail.length) },
    (_, i) => `${ORDINAL_ROUNDS[i] ?? i + 1} Round`
  );
  return [...lead, ...tail];
}
