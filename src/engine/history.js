// The dynasty's permanent record: one row per completed season, built the moment
// the national title game goes final.
//
// It has to be captured there and not derived later, because the offseason wipes
// the season it describes — `BLANK_SEASON` takes the games, the standings and the
// bracket with it, and the roster that finished the year is developed out of
// existence. Everything the Legacy tab shows is banked here while the board is
// still up.

import { TEAMS_BY_ID } from '../data/teams.js';
import { teamStrength } from './simulation.js';
import { NATIONAL_ROUND_NAMES } from './tournament.js';

// Bracket rounds, by index: 0 Round of 64 … 4 Final Four, 5 Championship. A
// semi-finalist is a team that REACHED the Final Four, which is what the third
// rafter banner hangs for.
export const FINAL_FOUR_ROUND = 4;
const TITLE_ROUND = 5;

export function buildSeasonRecord({
  games,
  teamStates,
  userTeamId,
  seasonNumber,
  champions,
  nationalChampionId,
  nationalField,
}) {
  const ts = teamStates[userTeamId];
  const team = TEAMS_BY_ID[userTeamId];
  const all = Object.values(games);

  // Regular season only. `ts.record` can't be used: by now it has both
  // tournaments folded into it, and a title run would read as a better year in
  // league play than it was.
  const record = { w: 0, l: 0 };
  const confRecord = { w: 0, l: 0 };
  const mine = [];
  for (const g of all) {
    if (!g.played || (g.homeId !== userTeamId && g.awayId !== userTeamId)) continue;
    if (g.phase === 'NATIONAL') mine.push(g);
    if (g.phase !== 'REGULAR') continue;
    const won = g.result.winnerId === userTeamId;
    record[won ? 'w' : 'l']++;
    if (g.conference != null) confRecord[won ? 'w' : 'l']++;
  }

  mine.sort((a, b) => a.round - b.round);
  const madeField = (nationalField || []).includes(userTeamId);
  const opener = mine[0];
  const last = mine[mine.length - 1];
  const roundReached = last ? last.round : null;
  const natChamp = nationalChampionId === userTeamId;

  return {
    season: seasonNumber,
    teamId: userTeamId,
    // Form is a March mood swing, not the team — measure the roster without it.
    overall: Math.round(teamStrength({ ...ts, form: 0 })),
    record,
    confRecord,
    madeField,
    seed: opener ? (opener.homeId === userTeamId ? opener.seedHome : opener.seedAway) : null,
    roundReached,
    finish: finishLabel({ madeField, roundReached, natChamp }),
    confChamp: champions[team.conference] === userTeamId,
    natChamp,
    semiFinalist: madeField && roundReached >= FINAL_FOUR_ROUND,
  };
}

// The round a team lost in IS the round it reached, so the elimination round
// names the finish — except at the top, where losing the last game has its own
// name and winning it has a better one.
function finishLabel({ madeField, roundReached, natChamp }) {
  if (!madeField) return 'Missed the Field';
  if (natChamp) return 'National Champions';
  if (roundReached === TITLE_ROUND) return 'Runner-Up';
  return NATIONAL_ROUND_NAMES[roundReached] ?? '—';
}
