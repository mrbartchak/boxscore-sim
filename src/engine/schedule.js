// Season schedule generation. The regular season is a double round-robin within
// each conference, with rounds mapped onto real calendar dates.

import { CONFERENCES } from '../data/teams.js';

export const SEASON_START = '2025-11-04';

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

// Circle-method round robin. Returns an array of rounds; each round is an array
// of [homeId, awayId] pairings covering every team once.
function roundRobin(ids) {
  const teams = [...ids];
  if (teams.length % 2 === 1) teams.push(null); // bye
  const n = teams.length;
  const rounds = [];
  const arr = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const pairings = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a != null && b != null) {
        // Alternate home/away by round for balance.
        pairings.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
    }
    rounds.push(pairings);
    // Rotate all but the first element.
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}

let _gid = 0;

// Build the full-league regular-season schedule.
// teamStatesByConf: { [conference]: [teamId, ...] }
export function buildRegularSeason(teamIdsByConf) {
  const games = [];
  const maxRounds = { value: 0 };

  const perConfRounds = {};
  for (const conf of CONFERENCES) {
    const ids = teamIdsByConf[conf];
    const first = roundRobin(ids);
    // Double round robin: second half swaps home/away.
    const second = first.map((round) => round.map(([h, a]) => [a, h]));
    const rounds = [...first, ...second];
    perConfRounds[conf] = rounds;
    maxRounds.value = Math.max(maxRounds.value, rounds.length);
  }

  // Map each round index onto a calendar date, cadence ~ every 3-4 days.
  const dateForRound = [];
  let cursor = 0;
  for (let r = 0; r < maxRounds.value; r++) {
    dateForRound.push(addDays(SEASON_START, cursor));
    cursor += r % 2 === 0 ? 3 : 4; // Wed / Sat feel
  }

  for (const conf of CONFERENCES) {
    perConfRounds[conf].forEach((round, r) => {
      const date = dateForRound[r];
      round.forEach(([homeId, awayId]) => {
        games.push({
          id: `g${_gid++}`,
          date,
          round: r,
          homeId,
          awayId,
          conference: conf,
          phase: 'REGULAR',
          neutral: false,
          played: false,
          result: null,
        });
      });
    });
  }

  const lastRegularDate = dateForRound[maxRounds.value - 1];
  return { games, lastRegularDate };
}
