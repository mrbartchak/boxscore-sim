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
  };
}

export function generateRoster(team) {
  const mean = prestigeToOverall(team.prestige);
  const players = ROSTER_POSITIONS.map((pos) => generatePlayer(pos, mean, false));

  // Anoint the highest-overall player as the star and give them a boost.
  players.sort((a, b) => b.overall - a.overall);
  const star = players[0];
  star.isStar = true;
  star.overall = clamp(star.overall + 4, 35, 99);
  star.projPpg = round1(star.projPpg * 1.2 + 2);

  return players;
}

// Season averages for display; falls back to projections before games played.
export function playerAverages(p) {
  if (p.gp > 0) {
    return {
      ppg: round1(p.pts / p.gp),
      apg: round1(p.ast / p.gp),
      rpg: round1(p.reb / p.gp),
      mpg: round1(p.min / p.gp),
    };
  }
  return { ppg: p.projPpg, apg: p.projApg, rpg: p.projReb, mpg: 0 };
}
