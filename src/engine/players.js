// Player generation. A team's prestige drives the overall quality of its
// randomly generated 10-man roster.

import { FIRST_NAMES, LAST_NAMES } from '../data/names.js';
import { rand, randInt, pick, shuffle, weightedIndex, gaussian, clamp, round1 } from './random.js';
import {
  ATTRIBUTES,
  ARCHETYPES,
  ARCHETYPES_BY_ID,
  POSITION_WEIGHTS,
} from '../data/archetypes.js';

export const CLASSES = ['FR', 'SO', 'JR', 'SR'];
export const CLASS_LABEL = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior' };
export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

const ATTR_MIN = 25;
const ATTR_MAX = 99;

let _pid = 0;

// A player's overall is DERIVED from his attributes, weighted for the position
// he plays. Nothing stores it independently, so the moment lineup logic starts
// caring about position fit, moving a center to the wing can change what he's
// worth without any extra bookkeeping.
export function overallFrom(attrs, position) {
  const w = POSITION_WEIGHTS[position];
  return Math.round(ATTRIBUTES.reduce((sum, a) => sum + attrs[a] * w[a], 0));
}

export function archetypeOf(player) {
  return ARCHETYPES_BY_ID[player.archetype];
}

// Archetypes eligible for a player of this position and talent level. Elite
// shapes are gated behind `minOverall` so "Unicorn" stays a thing that happens
// to a roster rather than a label; `maxOverall` keeps Raw Project off the best
// player in the country.
function pickArchetype(position, overall) {
  const pool = ARCHETYPES.filter(
    (a) =>
      a.positions.includes(position) &&
      overall >= (a.minOverall ?? 0) &&
      overall <= (a.maxOverall ?? 99)
  );
  return pool[weightedIndex(pool.map((a) => a.weight))];
}

// Build an attribute set of the given SHAPE that grades out at exactly `target`.
// The re-centering is what keeps roster generation calibrated: the talent ladder
// still decides how good everyone is, and the archetype only decides where that
// talent sits. Clamped attributes push their leftover onto the others so a 96
// Sniper still grades 96 once his outside rating hits the ceiling.
function buildAttributes(target, position, archetype) {
  const attrs = {};
  ATTRIBUTES.forEach((a) => {
    attrs[a] = clamp(target + (archetype.shape[a] ?? 0) + gaussian(0, 2.6), ATTR_MIN, ATTR_MAX);
  });

  const w = POSITION_WEIGHTS[position];
  for (let pass = 0; pass < 6; pass++) {
    const delta = target - ATTRIBUTES.reduce((s, a) => s + attrs[a] * w[a], 0);
    if (Math.abs(delta) < 0.05) break;
    // Spread the correction over attributes that still have room to move.
    const movable = ATTRIBUTES.filter(
      (a) => (delta > 0 ? attrs[a] < ATTR_MAX : attrs[a] > ATTR_MIN)
    );
    const share = movable.reduce((s, a) => s + w[a], 0);
    if (!share) break;
    movable.forEach((a) => {
      attrs[a] = clamp(attrs[a] + delta / share, ATTR_MIN, ATTR_MAX);
    });
  }

  ATTRIBUTES.forEach((a) => (attrs[a] = Math.round(attrs[a])));
  return attrs;
}

function makeName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

// Map prestige (0-100) to a program's baseline talent level — the midpoint of
// the roster before its own talent curve is applied. Deliberately conservative:
// the top of a roster is built by the ladder and the talent lottery below, not
// by this line, which keeps the 90s reserved for players who earned them
// instead of handing every blue-blood a ceiling-scraping rating.
function prestigeToOverall(prestige) {
  return 42 + (prestige / 100) * 35;
}

// Talent curve down the rotation, in units of the roster's `spread`. Real
// rosters fall off a cliff after the top few — the 9th and 10th men are deep
// reserves, not near-starters. Re-centered on its own mean so `spread` changes
// the SHAPE of a roster without quietly changing how strong the team is.
const TALENT_LADDER = (() => {
  const raw = [0.62, 0.42, 0.24, 0.08, -0.05, -0.28, -0.52, -0.8, -1.15, -1.55];
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  return raw.map((v) => v - mean);
})();

// Class mix by program tier: blue-bloods reload every year with one-and-dones,
// mid-majors win with fourth-year starters. Weights are [FR, SO, JR, SR].
const CLASS_MIX_ELITE = [0.42, 0.26, 0.19, 0.13];
const CLASS_MIX_SMALL = [0.16, 0.23, 0.29, 0.32];

function rollClass(p) {
  return CLASSES[weightedIndex(CLASS_MIX_ELITE.map((e, i) => e * p + CLASS_MIX_SMALL[i] * (1 - p)))];
}

// How far an attribute sticks out relative to the player's own level, sharpened
// by `power`. This is what makes the stat line follow the archetype instead of
// the position: a Floor General leads his team in assists because his
// playmaking towers over the rest of his game, not because he is listed at PG.
const spike = (attr, overall, power) =>
  Math.pow(clamp(attr / Math.max(overall, 1), 0.55, 1.55), power);

function generatePlayer(position, targetOverall, cls, isStar) {
  const archetype = pickArchetype(position, targetOverall);
  const attrs = buildAttributes(targetOverall, position, archetype);
  const overall = overallFrom(attrs, position);

  // Overall (35-99) scaled to a 0..1 quality factor, softened.
  const q = clamp((overall - 40) / 55, 0, 1.15);

  // Projected per-game production. These act as tendencies for the sim and as
  // the fallback display line before any games are played.
  // Scoring uses a gentler exponent than assists/rebounds: shot volume already
  // gets multiplied by archetype usage, star status and minutes downstream, and
  // stacking a sharp curve on top of all three sent league leaders to 36 ppg.
  const scoreW =
    (spike(attrs.inside, overall, 1.35) * 0.45 + spike(attrs.outside, overall, 1.35) * 0.55) *
    archetype.usage *
    (isStar ? 1.25 : 1);
  const assistW = spike(attrs.playmaking, overall, 3.2) * 1.15;
  const reboundW = spike(attrs.rebounding, overall, 2.8) * 1.1;

  const projPpg = round1(clamp(gaussian(4 + q * 15 * scoreW, 2.2), 1, 30));
  const projApg = round1(clamp(gaussian(0.6 + q * 3.5 * assistW, 0.8), 0.1, 10));
  const projReb = round1(clamp(gaussian(1 + q * 5 * reboundW, 1.1), 0.4, 15));

  return {
    id: `p${_pid++}`,
    name: makeName(),
    position,
    class: cls,
    attrs,
    archetype: archetype.id,
    overall,
    potential: clamp(overall + randInt(0, cls === 'FR' ? 12 : cls === 'SO' ? 8 : 4), 35, 99),
    isStar,
    projPpg,
    projApg,
    projReb,
    // Accumulated real season stats.
    gp: 0,
    min: 0,
    pts: 0,
    ast: 0,
    reb: 0,
    // Career (prior seasons) per-game averages; 0 for freshmen.
    careerGp: 0,
    careerPpg: 0,
    careerApg: 0,
    careerReb: 0,
  };
}

const PRIOR_SEASONS = { FR: 0, SO: 1, JR: 2, SR: 3 };

// Give returning players a plausible career history (younger seasons = lower).
function assignCareer(p) {
  const seasons = PRIOR_SEASONS[p.class];
  if (seasons === 0) return;
  p.careerGp = seasons * randInt(28, 33);
  const dev = 0.72 + seasons * 0.06; // developed less earlier in their career
  p.careerPpg = round1(clamp(p.projPpg * dev * (0.85 + rand() * 0.3), 0.4, 32));
  p.careerApg = round1(clamp(p.projApg * dev * (0.8 + rand() * 0.4), 0, 11));
  p.careerReb = round1(clamp(p.projReb * dev * (0.85 + rand() * 0.3), 0.3, 15));
}

// Scale a projected stat across the roster so the team totals are realistic.
function scaleStat(players, key, total) {
  const sum = players.reduce((a, p) => a + p[key], 0) || 1;
  const f = total / sum;
  players.forEach((p) => (p[key] = round1(p[key] * f)));
}

export function generateRoster(team) {
  const p = team.prestige / 100;

  // 1. This program's talent level THIS season. The noise term is what makes a
  //    blue-blood's down year and a mid-major's dream team possible — without
  //    it every 95-prestige roster comes out the same shade of gold.
  const base = prestigeToOverall(team.prestige) + gaussian(0, 3.6);

  // 2. How top-heavy the roster is. Elite programs concentrate talent in a star
  //    or two and stash prospects at the end of the bench; small schools run
  //    flatter, veteran rotations. This is what stops a blue-blood's 9th man
  //    from out-rating a good high-major's starters, and it varies per team so
  //    a powerhouse can be either a two-man show or genuinely deep.
  const spread = clamp(gaussian(8.5 + p * 5.5, 2.4), 5, 18);

  const overalls = TALENT_LADDER
    .map((step) => clamp(Math.round(base + step * spread + gaussian(0, 2)), 35, 99))
    .sort((a, b) => b - a);

  // 3. Talent lottery for the top of the roster. Prestige stacks the odds but
  //    never owns them — Davidson landed Steph Curry and Murray State landed Ja
  //    Morant. The two rolls are separate on purpose: blue-chips are the common
  //    case that gives a roster a real go-to guy, and only the rare generational
  //    roll reaches the top of the scale, so a 99 stays a once-in-years event
  //    rather than standard issue at every blue-blood.
  if (rand() < 0.004 + p ** 3 * 0.075) {
    overalls[0] = Math.max(overalls[0], clamp(Math.round(gaussian(94, 4)), 88, 99));
  } else if (rand() < 0.05 + p ** 2 * 0.42) {
    const boost = Math.round(2 + Math.abs(gaussian(0, 4.5)));
    overalls[0] = Math.min(96, overalls[0] + boost);
  }

  // 4. Spread the ladder across positions so the top five talents each take a
  //    different spot. Sometimes two of the best land at the same position and a
  //    quality player rides the bench — a real and frustrating logjam.
  const slots = [...shuffle(POSITIONS), ...shuffle(POSITIONS)];
  if (rand() < 0.3) {
    const a = randInt(1, 4);
    const b = randInt(5, 9);
    [slots[a], slots[b]] = [slots[b], slots[a]];
  }

  const players = overalls.map((ovr, i) =>
    generatePlayer(slots[i], ovr, rollClass(p), i === 0)
  );

  // The ladder is sorted, but overall is derived from attributes now, so
  // rounding and attribute ceilings can reshuffle the very top. Take whoever
  // actually graded out highest.
  const star = players.reduce((a, b) => (b.overall > a.overall ? b : a));
  players.forEach((pl) => (pl.isStar = pl.id === star.id));
  star.projPpg *= 1.15; // heavier scoring share before normalization

  // Normalize projected production so the roster sums to a realistic team line.
  // (Everyone's points must add up to what the team actually scores.)
  scaleStat(players, 'projPpg', clamp(gaussian(70 + team.prestige * 0.05, 3), 60, 80));
  scaleStat(players, 'projApg', clamp(gaussian(14, 1.2), 10, 18));
  scaleStat(players, 'projReb', clamp(gaussian(34, 1.8), 28, 40));

  players.forEach(assignCareer);
  return players;
}

// Visual tier for an overall rating, used to color player cards.
// 99 = rainbow, 90-98 = diamond, 80-89 = gold, 70-79 = silver, else base.
export function overallTier(overall) {
  if (overall >= 99) return 'rainbow';
  if (overall >= 90) return 'diamond';
  if (overall >= 80) return 'gold';
  if (overall >= 70) return 'silver';
  return 'base';
}

// Current-season averages, or null before any games have been played.
export function seasonAverages(p) {
  if (p.gp > 0) {
    return {
      ppg: round1(p.pts / p.gp),
      apg: round1(p.ast / p.gp),
      rpg: round1(p.reb / p.gp),
      mpg: round1(p.min / p.gp),
    };
  }
  return null;
}

// Career (prior-season) averages, or null for freshmen with no history.
export function careerAverages(p) {
  if (p.careerGp > 0) {
    return { ppg: p.careerPpg, apg: p.careerApg, rpg: p.careerReb };
  }
  return null;
}
