// The offseason: the roster carry-over that turns one season into a dynasty.
//
// Three things happen, in order, to every team in the league:
//   1. Players leave. Seniors graduate; underclassmen declare for the pro league
//      if a pro league would actually take them; buried reserves transfer out.
//   2. Everyone who stays gets a year older and develops toward their potential.
//   3. A recruiting class (plus the occasional portal transfer) refills exactly
//      the seats that opened, at the program's prestige level.
//
// Step 3 is what keeps the league stable across decades. Development pushes
// every returning roster upward, so recruits have to arrive BELOW the level they
// will eventually reach — RECRUIT_DISCOUNT is that runway. Get it wrong in
// either direction and a hundred simulated seasons drift into a league of 95s or
// a league of 50s. `npm run calibrate` re-checks the equilibrium.

import { rand, randInt, gaussian, clamp, round1, shuffle, weightedIndex } from './random.js';
import {
  CLASSES,
  TALENT_LADDER,
  TEAM_NOISE_SD,
  prestigeToOverall,
  generatePlayer,
  assignCareer,
  projectStats,
  normalizeProjections,
} from './players.js';

// ---------------------------------------------------------------------------
// Program cycle
//
// A program's level moves year to year WITH MEMORY: recruiting is a three-year
// pipeline and staffs don't turn over overnight. Rolling it fresh each season
// would be the same as rolling each class independently, and a roster made of
// four independent classes averages its way to the league mean — after a decade
// the blue-bloods stop being blue-bloods and every seed line converges. (That
// compression is measurable: it cost ~20% of the league's strength spread, and
// strength spread is exactly what MARGIN_PER_RATING turns into point spreads.)
//
// An AR(1) with this persistence has a stationary spread of TEAM_NOISE_SD, so a
// carried-over league keeps the same shape as a freshly generated one and a
// single calibration covers both.
const CYCLE_PERSISTENCE = 0.72;

export function rollCycle() {
  return gaussian(0, TEAM_NOISE_SD);
}

export function nextCycle(prev) {
  const shock = TEAM_NOISE_SD * Math.sqrt(1 - CYCLE_PERSISTENCE ** 2);
  return CYCLE_PERSISTENCE * (prev ?? 0) + gaussian(0, shock);
}

export const DEPARTURE_LABEL = {
  GRADUATED: 'Graduated',
  PRO: 'Turned Pro',
  TRANSFER: 'Transferred',
};

const NEXT_CLASS = { FR: 'SO', SO: 'JR', JR: 'SR' };

// Nobody below this rating leaves early — there is no professional money in a
// 69-overall sophomore, however badly his coach's roster needs the scholarship.
const PRO_FLOOR = 80;

// Rating at which a departure is a foregone conclusion.
const PRO_CEILING = 92;

// How likely an underclassman is to leave early for the pro league. Talent is
// the gate and prestige is the multiplier: scouts see everyone eventually, but
// they see a blue-blood's freshman in November and a one-bid league's in March.
export function proDeclareChance(player, prestige) {
  if (player.class === 'SR') return 0;
  const talent = clamp((player.overall - PRO_FLOOR) / (PRO_CEILING - PRO_FLOOR), 0, 1);
  if (talent <= 0) return 0;
  // Freshmen are the rawest of the three and the likeliest to be told to wait.
  const readiness = { FR: 0.88, SO: 1, JR: 1.06 }[player.class];
  const exposure = 0.55 + 0.45 * (prestige / 100);
  return clamp(talent ** 1.5 * readiness * exposure, 0, 0.95);
}

// Buried reserves go looking for minutes. `depthRank` is 0-based on overall, so
// a rank of 7+ is the end of the bench. Stacked programs bleed more of them.
export function transferOutChance(player, depthRank, prestige) {
  if (player.class === 'SR') return 0;
  if (depthRank < 5) return 0.02; // rotation regulars almost never leave
  const buried = depthRank >= 7 ? 0.16 : 0.07;
  return clamp(buried * (0.7 + (prestige / 100) * 0.8), 0, 0.35);
}

// Share of the remaining gap to potential a player closes in one offseason.
// Keyed by the class they are leaving, so the biggest jump is freshman → soph.
const GROWTH = { FR: 0.55, SO: 0.42, JR: 0.3 };

// Players develop where they play. A starter's 30 minutes a night are worth far
// more than a 10th man's garbage time, which is both true to life and the reason
// a rotation stays top-heavy: without it every roster flattens toward its own
// average after a few seasons, and a blue-blood's bench creeps up on its
// starters again. It also means the minutes the user hands out actually matter.
function minutesFactor(p) {
  const mpg = p.gp > 0 ? p.min / p.gp : 0;
  return 0.55 + 0.65 * clamp(mpg / 26, 0, 1);
}

// Age a returning player one year: fold the season just played into his career
// line, then move him toward his ceiling. Returns a new object.
export function developPlayer(p) {
  const next = { ...p, class: NEXT_CLASS[p.class] };
  const played = minutesFactor(p); // computed before the accumulators reset

  // This season becomes career history; the accumulators reset for the new one.
  if (p.gp > 0) {
    const gp = p.careerGp + p.gp;
    next.careerPpg = round1((p.careerPpg * p.careerGp + p.pts) / gp);
    next.careerApg = round1((p.careerApg * p.careerGp + p.ast) / gp);
    next.careerReb = round1((p.careerReb * p.careerGp + p.reb) / gp);
    next.careerGp = gp;
  }
  next.gp = 0;
  next.min = 0;
  next.pts = 0;
  next.ast = 0;
  next.reb = 0;

  // A late bloomer's ceiling can rise; most players just close on the one they
  // already have, and a few go backwards.
  next.potential = clamp(p.potential + (rand() < 0.18 ? randInt(1, 3) : 0), 35, 99);
  const gap = Math.max(0, next.potential - p.overall);
  const gain = Math.round(clamp(gaussian(gap * GROWTH[p.class] * played, 1.8), -2, gap));
  next.overall = clamp(p.overall + gain, 35, 99);
  next.lastOverall = p.overall; // what he was a year ago, for the offseason screen

  return projectStats(next, p.isStar);
}

// Sample the roster talent ladder at `n` even steps so a class of any size still
// has a headliner and a project at the end of it. Small classes are compressed:
// two recruits are not the top and bottom of a ten-man depth chart.
function ladderSteps(n) {
  if (n <= 1) return [0];
  const squeeze = 0.55 + 0.45 * (n / TALENT_LADDER.length);
  return Array.from({ length: n }, (_, i) => {
    const idx = Math.round((i * (TALENT_LADDER.length - 1)) / (n - 1));
    return TALENT_LADDER[idx] * squeeze;
  });
}

// Freshmen arrive unfinished, and make the difference up over three years of
// development. This is the size of that runway: too big and the league sags a
// little further every season, too small and it inflates. Tuned so a carried-over
// league sits at the same average level as a freshly generated one.
const RECRUIT_DISCOUNT = 2;

// Build the class that replaces the departed. `positions` are the exact spots
// that opened up, so a roster keeps its two-deep at every position forever.
export function recruitClass(team, positions, cycle = 0) {
  const n = positions.length;
  if (!n) return [];
  const p = team.prestige / 100;

  const base = prestigeToOverall(team.prestige) - RECRUIT_DISCOUNT + cycle;
  const spread = clamp(gaussian(8.5 + p * 5.5, 2.4), 5, 18);
  const overalls = ladderSteps(n)
    .map((step) => clamp(Math.round(base + step * spread + gaussian(0, 2)), 35, 99))
    .sort((a, b) => b - a);

  // The same talent lottery the initial rosters run. Signing day is where the
  // generational freshman lands — the one who is already the best player in the
  // country in November and gone by June.
  if (rand() < 0.003 + p ** 3 * 0.055) {
    overalls[0] = Math.max(overalls[0], clamp(Math.round(gaussian(93, 4)), 87, 99));
  } else if (rand() < 0.05 + p ** 2 * 0.38) {
    overalls[0] = Math.min(94, overalls[0] + Math.round(2 + Math.abs(gaussian(0, 4))));
  }

  const spots = shuffle(positions);
  return overalls.map((ovr, i) => makeArrival(spots[i], ovr, p));
}

// One incoming player: usually a freshman, sometimes a portal transfer who is
// older, more finished, and has a career line already. Richer programs pull more
// of them.
function makeArrival(position, overall, p) {
  const isTransfer = rand() < 0.1 + p * 0.12;
  if (!isTransfer) return generatePlayer(position, overall, 'FR', false);

  // A transfer is proven where a recruit is projected — a little better now, a
  // little less room to grow (which generatePlayer already handles by class).
  const cls = CLASSES[weightedIndex([0, 0.45, 0.4, 0.15])];
  const player = generatePlayer(position, clamp(overall + randInt(0, 3), 35, 99), cls, false);
  assignCareer(player);
  return player;
}

// Run the whole offseason for one team. Returns the new player list plus the
// departures and arrivals, which the UI replays as the offseason scene.
export function advanceRoster(teamState, team) {
  const cycle = nextCycle(teamState.cycle);
  const depth = [...teamState.players].sort((a, b) => b.overall - a.overall);
  const rankOf = new Map(depth.map((p, i) => [p.id, i]));

  const departures = [];
  const returning = [];
  // One row per player who finished last season here, best first — the order the
  // offseason screen walks down when it shows you what became of each of them.
  const report = [];
  depth.forEach((p) => {
    let reason = null;
    if (p.class === 'SR') reason = 'GRADUATED';
    else if (rand() < proDeclareChance(p, team.prestige)) reason = 'PRO';
    else if (rand() < transferOutChance(p, rankOf.get(p.id), team.prestige)) reason = 'TRANSFER';

    if (reason) {
      departures.push({ player: p, reason });
      report.push({ before: p, after: null, reason });
    } else {
      const grown = developPlayer(p);
      returning.push(grown);
      report.push({ before: p, after: grown, reason: null });
    }
  });

  const incoming = recruitClass(team, departures.map((d) => d.player.position), cycle);
  const players = [...returning, ...incoming];

  // The featured player is whoever is now best — the roster that produced last
  // year's star may not even contain him.
  const star = players.reduce((a, b) => (b.overall > a.overall ? b : a));
  players.forEach((pl) => (pl.isStar = pl === star));
  star.projPpg *= 1.3; // heavier scoring share before normalization
  normalizeProjections(players, team);

  return { players, departures, incoming, report, cycle };
}
