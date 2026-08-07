import { create } from 'zustand';
import { TEAMS, TEAMS_BY_ID } from '../data/teams.js';
import { generateRoster } from '../engine/players.js';
import { advanceRoster, rollCycle } from '../engine/offseason.js';
import {
  defaultLineup,
  simulateGame,
  rollPostseasonForm,
  teamStrength,
} from '../engine/simulation.js';
import { buildRegularSeason, SEASON_START, addDays } from '../engine/schedule.js';
import { buildSeasonRecord } from '../engine/history.js';
import {
  seedConferenceTournaments,
  selectNationalField,
  buildNationalBracket,
} from '../engine/tournament.js';

const SIM_SPEED_MS = { slow: 220, normal: 80, fast: 25 };

// A user game day, when "full sim games" is on: the calendar chip spins its
// digits for REVEAL_ROLL_MS, lands on the final, then holds on the W/L flash.
// The view animates inside this window, so the two constants travel together.
export const REVEAL_ROLL_MS = 170;
export const REVEAL_MS = 500;

// Start the cursor one day before the first game so the day-by-day loop (which
// advances, then simulates the new day) actually steps into every game date.
const PRESEASON = addDays(SEASON_START, -1);

// A team's state at the top of a season. `players` is passed in so the same
// shape serves a brand-new program and one carried over from last year.
function newTeamState(teamId, players, cycle) {
  return {
    teamId,
    players,
    cycle, // program's multi-year talent swing; carried across seasons
    rotation: defaultLineup(players),
    record: { w: 0, l: 0 },
    confRecord: { w: 0, l: 0 },
    pf: 0,
    pa: 0,
    oppStrengthSum: 0, // sum of opponents' ratings, for strength of schedule
    streak: 0, // + wins, - losses
    form: 0, // postseason peak/slump, rolled when the brackets are drawn
  };
}

// Apply a game's box score + result to a team state, returning a new state.
// `oppStrength` accumulates into the strength-of-schedule term the rankings use:
// now that a third of the season is played outside the conference, a team's SOS
// has to be measured from who it actually played.
function applyResult(ts, box, teamPts, oppPts, won, isConf, oppStrength) {
  const boxById = Object.fromEntries(box.map((b) => [b.playerId, b]));
  const players = ts.players.map((p) => {
    const b = boxById[p.id];
    if (!b) return p;
    return {
      ...p,
      gp: p.gp + 1,
      min: p.min + b.min,
      pts: p.pts + b.pts,
      ast: p.ast + b.ast,
      reb: p.reb + b.reb,
    };
  });
  return {
    ...ts,
    players,
    record: { w: ts.record.w + (won ? 1 : 0), l: ts.record.l + (won ? 0 : 1) },
    confRecord: isConf
      ? { w: ts.confRecord.w + (won ? 1 : 0), l: ts.confRecord.l + (won ? 0 : 1) }
      : ts.confRecord,
    pf: ts.pf + teamPts,
    pa: ts.pa + oppPts,
    oppStrengthSum: ts.oppStrengthSum + oppStrength,
    streak: won ? Math.max(1, ts.streak + 1) : Math.min(-1, ts.streak - 1),
  };
}

// Everything that resets between seasons. `version`, `userTeamId` and the
// dynasty's `history` live outside this so a new season can keep the program,
// keep its record book, and keep re-rendering.
const BLANK_SEASON = {
  phase: 'SELECT', // SELECT | REGULAR | CONF_TOURNEY | NATIONAL | DONE
  teamStates: {},
  games: {}, // id -> game
  gameIdsByDate: {}, // iso -> [id]
  currentDate: PRESEASON,
  lastRegularDate: null,
  lastConfDate: null,
  simulating: false,
  simTarget: null,
  champions: {}, // conference -> teamId
  nationalField: null, // [teamId] seeded
  nationalChampionId: null,
  activeView: 'schedule', // schedule | roster | stats | legacy
  showReveal: false,
  showChampBanner: false,
  revealRandom: false,
  // Interstitials that gate each phase change, plus the offseason the user is
  // about to live through (departures + arrivals for their program only).
  showSeasonSummary: false,
  showConfChamp: false,
  showOffseason: false,
  offseason: null,
  reveal: null, // the user game currently rolling its score on the calendar
};

// Build the league's schedule + date index for a fresh season.
function buildSchedule() {
  const { games, lastRegularDate } = buildRegularSeason(TEAMS);
  const gamesById = {};
  const gameIdsByDate = {};
  games.forEach((g) => {
    gamesById[g.id] = g;
    (gameIdsByDate[g.date] ||= []).push(g.id);
  });
  return { games: gamesById, gameIdsByDate, lastRegularDate };
}

export const useGame = create((set, get) => ({
  ...BLANK_SEASON,
  userTeamId: null,
  seasonStart: SEASON_START,
  seasonNumber: 1,
  history: [], // one row per completed season, oldest first — the Legacy tab
  version: 0,

  // Settings live outside BLANK_SEASON — they belong to the player, not the season.
  simSpeed: 'normal', // slow | normal | fast
  fullSim: true, // play out your own games with a score roll instead of blowing past them
  setSimSpeed: (simSpeed) => set({ simSpeed }),
  setFullSim: (fullSim) => set({ fullSim }),

  setView: (v) => set({ activeView: v }),
  dismissReveal: () => set({ showReveal: false }),
  dismissChampBanner: () => set({ showChampBanner: false }),
  dismissSeasonSummary: () => set({ showSeasonSummary: false }),
  dismissConfChamp: () => set({ showConfChamp: false }),
  dismissOffseason: () => set({ showOffseason: false }),

  // Start a dynasty: every program in the league gets a generated roster.
  selectTeam: (teamId, { random = false } = {}) => {
    const teamStates = {};
    TEAMS.forEach((t) => {
      const cycle = rollCycle();
      teamStates[t.id] = newTeamState(t.id, generateRoster(t, cycle), cycle);
    });

    set({
      ...BLANK_SEASON,
      ...buildSchedule(),
      userTeamId: teamId,
      teamStates,
      seasonNumber: 1,
      history: [],
      phase: 'REGULAR',
      showReveal: true,
      revealRandom: random,
      version: get().version + 1,
    });
  },

  // Roll the whole league forward one year: seniors graduate, pro prospects
  // leave, everyone else develops, and recruiting classes fill the gaps. The
  // user keeps the team they built minus whoever they lost — this is the loop.
  newSeason: () => {
    const { userTeamId, seasonNumber, teamStates } = get();
    if (!userTeamId) return;

    const nextStates = {};
    let offseason = null;
    Object.values(teamStates).forEach((ts) => {
      const team = TEAMS_BY_ID[ts.teamId];
      const { players, departures, incoming, report, cycle } = advanceRoster(ts, team);
      nextStates[ts.teamId] = newTeamState(ts.teamId, players, cycle);
      if (ts.teamId === userTeamId) offseason = { departures, incoming, report };
    });

    set({
      ...BLANK_SEASON,
      ...buildSchedule(),
      userTeamId,
      teamStates: nextStates,
      seasonNumber: seasonNumber + 1,
      phase: 'REGULAR',
      showOffseason: true,
      offseason,
      version: get().version + 1,
    });
  },

  // For a team that missed the field: play the tournament out in one go (the
  // league still needs a champion and a completed season to age from) and land
  // straight in the offseason.
  skipToOffseason: () => {
    set({ simulating: false });
    let guard = 0;
    while (get().phase !== 'DONE' && guard++ < 400) get()._stepDay();
    get().newSeason();
  },

  // Drop the current save entirely and go back to team selection.
  abandonSeason: () =>
    set({
      ...BLANK_SEASON,
      userTeamId: null,
      seasonNumber: 1,
      history: [],
      version: get().version + 1,
    }),

  // ---- Rotation management (user team) ----
  // Swap the players occupying two lineup slots (starters or bench).
  swapLineup: (fromSlot, toSlot) =>
    set((s) => {
      if (fromSlot === toSlot) return {};
      const rot = cloneRotation(s.teamStates[s.userTeamId].rotation);
      const a = readSlot(rot, fromSlot);
      const b = readSlot(rot, toSlot);
      writeSlot(rot, fromSlot, b);
      writeSlot(rot, toSlot, a);
      return setUserRotation(s, rot);
    }),

  // ---- Simulation ----
  // Run the day-by-day loop on a timer until `shouldStop(state)` is true. The
  // loop also stops at any phase boundary so the postseason never auto-runs.
  _runSim: (shouldStop) => {
    if (get().simulating) return;
    const startPhase = get().phase;
    set({ simulating: true });
    const tick = () => {
      if (!get().simulating) return;
      get()._stepDay();
      const after = get();

      // A day the user's own team played is the one day worth stopping for.
      // Raise the reveal BEFORE the stop check, so "Next Game" — which halts on
      // exactly that date — still gets the score roll on its way out.
      const userGame = (after.gameIdsByDate[after.currentDate] || [])
        .map((id) => after.games[id])
        .find((g) => g && g.played && (g.homeId === after.userTeamId || g.awayId === after.userTeamId));
      const revealing = after.fullSim && !!userGame;
      if (revealing) {
        set({
          reveal: {
            gameId: userGame.id,
            date: userGame.date,
            won: userGame.result.winnerId === after.userTeamId,
            // The bracket advances the winner the moment the game is played, so
            // the next round's slot has to stay TBD until the roll is over —
            // otherwise you can read your own result one column to the right.
            nextGameId: userGame.nextGameId ?? null,
            nextSlot: userGame.nextSlot ?? null,
          },
        });
        // The roll plays out even if the loop stops here, so it clears itself.
        setTimeout(() => {
          if (get().reveal?.gameId === userGame.id) set({ reveal: null });
        }, REVEAL_MS);
      }

      const anyPending = Object.values(after.games).some(
        (g) => !g.played && g.homeId && g.awayId
      );
      const phaseChanged = after.phase !== startPhase;
      if (after.phase === 'DONE' || !anyPending || phaseChanged || shouldStop(after)) {
        set({ simulating: false });
        return;
      }
      setTimeout(tick, revealing ? REVEAL_MS : SIM_SPEED_MS[after.simSpeed]);
    };
    setTimeout(tick, SIM_SPEED_MS[get().simSpeed]);
  },

  simulateTo: (targetDate) => {
    if (targetDate <= get().currentDate) return;
    get()._runSim((st) => st.currentDate >= targetDate);
  },

  // Roll the calendar day by day with no end date — `_runSim` already halts at
  // the phase boundary, so this plays out the rest of the regular season and
  // stops itself at the summary.
  simulateSeason: () => get()._runSim(() => false),

  // Simulate the next round of the current tournament phase (one slate of games).
  simulateRound: () => {
    const phase = get().phase;
    const target = nextPhaseGameDate(get(), phase);
    if (!target) return;
    get()._runSim((st) => st.currentDate >= target || st.phase !== phase);
  },

  // Simulate the rest of the current tournament phase (until the phase changes).
  simulateTournament: () => {
    const phase = get().phase;
    get()._runSim((st) => st.phase !== phase);
  },

  // Burn through the rest of the regular season at once — no day-by-day timer,
  // no pauses on your games. Runs synchronously so it lands directly on the
  // end-of-season summary rather than animating a hundred days at you.
  simulateRegularSeason: () => {
    if (get().phase !== 'REGULAR') return;
    set({ simulating: false });
    let guard = 0;
    while (get().phase === 'REGULAR' && guard++ < 400) get()._stepDay();
  },

  stopSim: () => set({ simulating: false, simTarget: null }),

  _stepDay: () =>
    set((s) => {
      const newDate = addDays(s.currentDate, 1);
      const ids = s.gameIdsByDate[newDate] || [];
      const games = { ...s.games };
      const teamStates = { ...s.teamStates };

      for (const id of ids) {
        const g = games[id];
        if (!g || g.played) continue;
        if (!g.homeId || !g.awayId) continue; // unresolved bracket slot

        const home = teamStates[g.homeId];
        const away = teamStates[g.awayId];
        const result = simulateGame(home, away, {
          neutral: g.neutral,
          bracket: g.phase === 'CONF_TOURNEY' || g.phase === 'NATIONAL',
        });

        const homeWon = result.winnerId === g.homeId;
        // Only league games count toward the conference record — a REGULAR game
        // is now either conference or not, and `conference` is what says which.
        const isConf =
          (g.phase === 'REGULAR' && g.conference != null) || g.phase === 'CONF_TOURNEY';
        const homeStrength = teamStrength(home);
        const awayStrength = teamStrength(away);

        teamStates[g.homeId] = applyResult(
          home, result.homeBox, result.homePts, result.awayPts, homeWon, isConf, awayStrength
        );
        teamStates[g.awayId] = applyResult(
          away, result.awayBox, result.awayPts, result.homePts, !homeWon, isConf, homeStrength
        );

        games[id] = { ...g, played: true, result };

        // Propagate the winner into the next bracket game.
        if (g.nextGameId) {
          const ng = { ...games[g.nextGameId] };
          const seed = homeWon ? g.seedHome : g.seedAway;
          if (g.nextSlot === 'home') {
            ng.homeId = result.winnerId;
            ng.seedHome = seed;
          } else {
            ng.awayId = result.winnerId;
            ng.seedAway = seed;
          }
          games[g.nextGameId] = ng;
        }
      }

      let patch = {
        currentDate: newDate,
        games,
        teamStates,
        version: s.version + 1,
      };

      // ---- Phase transitions ----
      const allPlayed = (phase) =>
        Object.values(games).every((g) => g.phase !== phase || g.played);

      if (s.phase === 'REGULAR' && newDate >= s.lastRegularDate && allPlayed('REGULAR')) {
        const start = addDays(s.lastRegularDate, 3);
        const { games: tGames, lastDate } = seedConferenceTournaments(teamStates, start);
        patch.gameIdsByDate = appendGames(games, s.gameIdsByDate, tGames);
        patch.phase = 'CONF_TOURNEY';
        patch.lastConfDate = lastDate;
        patch.showSeasonSummary = true; // gate the postseason behind the recap
        // Seeds are locked in above; now find out who is actually peaking.
        patch.teamStates = rollPostseasonForm(teamStates);
      } else if (s.phase === 'CONF_TOURNEY' && allPlayed('CONF_TOURNEY')) {
        // Conference champions = winners of each conference final.
        const champions = {};
        Object.values(games).forEach((g) => {
          if (g.phase === 'CONF_TOURNEY' && g.played && !g.nextGameId) {
            champions[g.conference] = g.result.winnerId;
          }
        });
        const field = selectNationalField(teamStates, Object.values(champions));
        const start = addDays(s.lastConfDate, 3);
        const { games: nGames } = buildNationalBracket(field, start);
        patch.gameIdsByDate = appendGames(games, s.gameIdsByDate, nGames);
        patch.phase = 'NATIONAL';
        patch.champions = champions;
        patch.nationalField = field;
        patch.showConfChamp = true; // who cut down the nets in your league
        // Re-roll AFTER selection and seeding — the committee never gets to see
        // who is about to get hot.
        patch.teamStates = rollPostseasonForm(teamStates);
      } else if (s.phase === 'NATIONAL' && allPlayed('NATIONAL')) {
        const finalGame = Object.values(games).find(
          (g) => g.phase === 'NATIONAL' && g.played && !g.nextGameId
        );
        if (finalGame) {
          patch.nationalChampionId = finalGame.result.winnerId;
          patch.phase = 'DONE';
          patch.showChampBanner = true;
          // Bank the season into the record book while the board is still up —
          // the offseason is about to wipe every game it was built from.
          patch.history = [
            ...s.history,
            buildSeasonRecord({
              games,
              teamStates,
              userTeamId: s.userTeamId,
              seasonNumber: s.seasonNumber,
              champions: s.champions,
              nationalChampionId: finalGame.result.winnerId,
              nationalField: s.nationalField,
            }),
          ];
        }
      }

      return patch;
    }),
}));

function setUserRotation(s, rotation) {
  const ts = s.teamStates[s.userTeamId];
  return {
    teamStates: { ...s.teamStates, [s.userTeamId]: { ...ts, rotation } },
    version: s.version + 1,
  };
}

function cloneRotation(rot) {
  return {
    starters: rot.starters.map((x) => ({ ...x })),
    bench: [...rot.bench],
    starId: rot.starId,
  };
}

// Slot ids: "S:PG".."S:C" for starters, "B:0".."B:4" for bench.
function readSlot(rot, slot) {
  const [type, key] = slot.split(':');
  if (type === 'S') return rot.starters.find((s) => s.pos === key).id;
  return rot.bench[Number(key)];
}

function writeSlot(rot, slot, playerId) {
  const [type, key] = slot.split(':');
  if (type === 'S') rot.starters.find((s) => s.pos === key).id = playerId;
  else rot.bench[Number(key)] = playerId;
}

// Earliest date of an unplayed, ready-to-play game in the given phase.
function nextPhaseGameDate(state, phase) {
  let min = null;
  Object.values(state.games).forEach((g) => {
    if (g.phase === phase && !g.played && g.homeId && g.awayId) {
      if (!min || g.date < min) min = g.date;
    }
  });
  return min;
}

// Append newly generated games into the games map (mutated in place) and return
// a new date index merged from the existing one.
function appendGames(games, baseIndex, newGames) {
  const byDate = { ...baseIndex };
  newGames.forEach((g) => {
    games[g.id] = g;
    byDate[g.date] = [...(byDate[g.date] || []), g.id];
  });
  return byDate;
}
