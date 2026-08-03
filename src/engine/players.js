// Player generation. A team's prestige drives the overall quality of its
// randomly generated 10-man roster.

import { FIRST_NAMES, LAST_NAMES } from '../data/names.js';
import { rand, randInt, pick, gaussian, clamp, round1 } from './random.js';

export const CLASSES = ['FR', 'SO', 'JR', 'SR'];
export const CLASS_LABEL = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior' };
export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// Positional archetypes: how a player's overall translates into a stat profile.
// scoring/assist/rebound are relative weights within the position.
const ARCHETYPE = {
  PG: { score: 1.0, assist: 1.8, rebound: 0.5 },
  SG: { score: 1.2, assist: 0.9, rebound: 0.6 },
  SF: { score: 1.1, assist: 0.8, rebound: 1.0 },
  PF: { score: 1.0, assist: 0.5, rebound: 1.4 },
  C: { score: 0.95, assist: 0.4, rebound: 1.7 },
};

let _pid = 0;

// A standard 10-man roster: two of each position.
const ROSTER_POSITIONS = ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C', 'C'];

function makeName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

// Map prestige (0-100) to the mean overall of a generated player.
// Prestige 95 -> ~83 mean, prestige 50 -> ~64, prestige 40 -> ~60.
function prestigeToOverall(prestige) {
  return 42 + (prestige / 100) * 44;
}

function generatePlayer(position, teamMeanOverall, isStar) {
  const overall = clamp(
    Math.round(gaussian(teamMeanOverall, 6) + (isStar ? 7 : 0)),
    35,
    99
  );

  const cls = pick(CLASSES);
  const arch = ARCHETYPE[position];

  // Overall (35-99) scaled to a 0..1 quality factor, softened.
  const q = clamp((overall - 40) / 55, 0, 1.15);

  // Projected per-game production. These act as tendencies for the sim and as
  // the fallback display line before any games are played.
  const usage = isStar ? 1.25 : 1;
  const projPpg = round1(clamp(gaussian(4 + q * 15 * arch.score * usage, 2.2), 1, 30));
  const projApg = round1(clamp(gaussian(0.6 + q * 3.5 * arch.assist, 0.8), 0.1, 10));
  const projReb = round1(clamp(gaussian(1 + q * 5 * arch.rebound, 1.1), 0.4, 15));

  return {
    id: `p${_pid++}`,
    name: makeName(),
    position,
    class: cls,
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
  const mean = prestigeToOverall(team.prestige);
  const players = ROSTER_POSITIONS.map((pos) => generatePlayer(pos, mean, false));

  // Anoint the highest-overall player as the star and give them a boost.
  players.sort((a, b) => b.overall - a.overall);
  const star = players[0];
  star.isStar = true;
  star.overall = clamp(star.overall + 4, 35, 99);
  star.projPpg *= 1.3; // heavier scoring share before normalization

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
