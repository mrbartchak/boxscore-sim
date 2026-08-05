// Season schedule generation.
//
// Every team plays exactly 30 regular-season games: 12 non-conference in
// November and December, then 18 league games. That split is the whole design —
// conferences run from 7 to 18 teams, so "18 league games" means very different
// things (a triple round-robin in the WAC, everyone-once-plus-one in the ACC),
// and the non-conference slate is what finally lets teams from different leagues
// be compared to each other at all (see `powerRating`).
//
// The unit of construction is a ROUND: a set of games in which no team appears
// twice. Rounds are then spread evenly across their window, which is what keeps
// everyone at roughly two games a week without pinning the whole league to the
// same two days.

import { shuffle } from './random.js';

export const SEASON_START = '2025-11-04';
export const CONF_GAMES = 18;
export const NONCONF_GAMES = 12;

// Two games a week is the target, so each half of the season gets exactly the
// span its games need: 12 games is six weeks, 18 games is nine. That also puts
// the title game in March instead of February, which the old compressed
// calendar never managed.
const NONCONF_WINDOW_DAYS = 41;
const CONF_START_DAY = 45;
const CONF_WINDOW_DAYS = 62;

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Circle-method round robin. Returns rounds of [homeId, awayId] pairings; an odd
// entry count gets a bye each round. Home/away alternates by round for balance.
function circleRounds(ids) {
  const arr = [...ids];
  if (arr.length % 2 === 1) arr.push(null); // bye
  const n = arr.length;
  const cur = [...arr];
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = cur[i];
      const b = cur[n - 1 - i];
      if (a != null && b != null) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    cur.splice(1, 0, cur.pop()); // rotate all but the first
  }
  return rounds;
}

const flip = (pairs) => pairs.map(([h, a]) => [a, h]);

// Pack loose games into rounds by repeatedly skimming off as many games as can
// be played at once, then squeezing the tail back into those rounds.
//
// Both halves matter. Taking a maximal set each pass keeps rounds evenly sized,
// where filling the earliest round first would crowd every team's games into the
// front of the window. But skimming alone leaves a long, thin tail — a handful
// of stragglers each getting a round of their own — and a team stuck in that
// tail goes a fortnight between games. A team playing `d` games needs at least
// `d` rounds to play them in, so the tail is folded back into `d + 1`.
function packIntoRounds(edges) {
  let remaining = edges;
  const rounds = [];
  while (remaining.length) {
    const busy = new Set();
    const round = [];
    const left = [];
    for (const e of remaining) {
      if (busy.has(e[0]) || busy.has(e[1])) left.push(e);
      else { busy.add(e[0]); busy.add(e[1]); round.push(e); }
    }
    rounds.push(round);
    remaining = left;
  }

  const degree = {};
  edges.forEach(([a, b]) => { degree[a] = (degree[a] || 0) + 1; degree[b] = (degree[b] || 0) + 1; });
  const target = Math.max(1, ...Object.values(degree)) + 1;

  const busy = rounds.map((r) => new Set(r.flat()));
  for (let r = rounds.length - 1; r >= target; r--) {
    const stuck = [];
    for (const e of rounds[r]) {
      const slot = busy.findIndex((set, q) => q < target && !set.has(e[0]) && !set.has(e[1]));
      if (slot === -1) { stuck.push(e); continue; }
      rounds[slot].push(e);
      busy[slot].add(e[0]);
      busy[slot].add(e[1]);
    }
    rounds[r] = stuck;
  }
  return rounds.filter((r) => r.length);
}

// A `deg`-regular circulant on the given order: every team plays the `deg/2`
// neighbours on each side of it. Used to top a league up to 18 games when whole
// round-robins don't divide evenly into it.
function circulantEdges(ids, deg) {
  const n = ids.length;
  const edges = [];
  const half = Math.floor(deg / 2);
  for (let d = 1; d <= half; d++) {
    for (let i = 0; i < n; i++) edges.push([ids[i], ids[(i + d) % n]]);
  }
  if (deg % 2 === 1) {
    // An odd degree needs the diameter pairing, which only exists on an even n.
    for (let i = 0; i < n / 2; i++) edges.push([ids[i], ids[i + n / 2]]);
  }
  return edges;
}

// One league's 18 games per team, as rounds.
//
// Whole round-robins come first (`perCycle` games each, home/away flipped every
// other cycle). What's left over depends on the parity of the league: an even
// one can just play more rounds of the same rotation, because every team appears
// in every round. An odd one always has someone sitting, so its remainder is
// built as a circulant and packed into rounds instead — which is why a 9- or
// 11-team league needs a few more dates to fit the same 18 games.
export function conferenceRounds(ids) {
  const n = ids.length;
  const perCycle = n - 1;
  const base = circleRounds(ids);
  const cycles = Math.floor(CONF_GAMES / perCycle);
  const remainder = CONF_GAMES - cycles * perCycle;

  const rounds = [];
  for (let c = 0; c < cycles; c++) {
    base.forEach((pairs) => rounds.push(c % 2 === 0 ? pairs : flip(pairs)));
  }
  if (remainder > 0) {
    if (n % 2 === 0) {
      for (let i = 0; i < remainder; i++) {
        const pairs = base[i % base.length];
        rounds.push(cycles % 2 === 0 ? pairs : flip(pairs));
      }
    } else {
      rounds.push(...packIntoRounds(circulantEdges(ids, remainder)));
    }
  }
  return rounds;
}

// Non-conference rounds for the whole league at once.
//
// The league has an odd number of teams, so there is no way to line all of them
// up in rounds where everybody plays — somebody always sits. A round-robin
// rotation makes that worse than it sounds: the teams it benches in consecutive
// rounds are the same ones it has already matched against each other, so they
// cannot simply make the game up among themselves later.
//
// So the slate is built as a graph instead of a rotation. Line the league up in
// a random order and give every team the six neighbours on each side of it:
// exactly 12 opponents each, nobody benched, no repeats. Only then is it broken
// into rounds.
function nonConferenceRounds(teams) {
  const confOf = Object.fromEntries(teams.map((t) => [t.id, t.conference]));
  const ids = shuffle(teams.map((t) => t.id));
  const n = ids.length;

  const edges = [];
  for (let d = 1; d <= NONCONF_GAMES / 2; d++) {
    for (let i = 0; i < n; i++) edges.push([ids[i], ids[(i + d) % n]]);
  }

  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const scheduled = new Set(edges.map(([a, b]) => key(a, b)));
  const canPlace = (a, b) => a !== b && confOf[a] !== confOf[b] && !scheduled.has(key(a, b));

  // A random order pairs the occasional league rival, which is a conference game
  // in disguise. Trade partners with another game — that keeps everyone's count
  // at 12 — using the same swap trick `separateConferences` uses on the bracket.
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    if (confOf[a] !== confOf[b]) continue;
    for (const j of shuffle(edges.map((_, k) => k))) {
      if (j === i) continue;
      const [c, d] = edges[j];
      scheduled.delete(key(a, b));
      scheduled.delete(key(c, d));
      if (canPlace(a, d) && canPlace(c, b)) {
        edges[i] = [a, d];
        edges[j] = [c, b];
        scheduled.add(key(a, d));
        scheduled.add(key(c, b));
        break;
      }
      scheduled.add(key(a, b));
      scheduled.add(key(c, d));
    }
  }

  // Home and away alternate down the line so nobody hosts all twelve.
  return packIntoRounds(shuffle(edges.map(([a, b], i) => (i % 2 ? [b, a] : [a, b]))));
}

// Spread `total` rounds evenly across a window, nudged by `phase` so leagues
// don't all tip off on the same two days of the week.
function roundDate(startDay, windowDays, index, total, phase) {
  const offset = total > 1 ? Math.round((index * windowDays) / (total - 1)) : 0;
  return startDay + offset + phase;
}

// Small stable per-conference offset, so the calendar has games most nights.
function conferencePhase(conference) {
  let h = 0;
  for (let i = 0; i < conference.length; i++) h = (h * 31 + conference.charCodeAt(i)) % 3;
  return h;
}

let _gid = 0;

// Build the full-league regular season. `teams` is the TEAMS array.
export function buildRegularSeason(teams) {
  const games = [];
  let lastDay = 0;

  const push = (homeId, awayId, day, conference) => {
    lastDay = Math.max(lastDay, day);
    games.push({
      id: `g${_gid++}`,
      date: addDays(SEASON_START, day),
      round: day,
      homeId,
      awayId,
      conference, // null for non-conference games
      phase: 'REGULAR',
      neutral: false,
      played: false,
      result: null,
    });
  };

  const nonConf = nonConferenceRounds(teams);
  nonConf.forEach((pairs, i) => {
    const day = roundDate(0, NONCONF_WINDOW_DAYS, i, nonConf.length, 0);
    pairs.forEach(([h, a], k) => push(h, a, day + (k % 2), null));
  });

  const byConf = {};
  teams.forEach((t) => (byConf[t.conference] ||= []).push(t.id));
  for (const [conf, ids] of Object.entries(byConf)) {
    const rounds = conferenceRounds(shuffle(ids));
    const phase = conferencePhase(conf);
    rounds.forEach((pairs, i) => {
      const day = roundDate(CONF_START_DAY, CONF_WINDOW_DAYS, i, rounds.length, phase);
      pairs.forEach(([h, a]) => push(h, a, day, conf));
    });
  }

  return { games, lastRegularDate: addDays(SEASON_START, lastDay) };
}
