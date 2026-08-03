import { create } from 'zustand';
import { TEAMS, CONFERENCES, TEAMS_BY_ID } from '../data/teams.js';
import { generateRoster } from '../engine/players.js';
import { defaultLineup, simulateGame } from '../engine/simulation.js';
import { buildRegularSeason, SEASON_START, addDays } from '../engine/schedule.js';
import {
  seedConferenceTournaments,
  selectNationalField,
  buildNationalBracket,
} from '../engine/tournament.js';

const SIM_SPEED_MS = 80;

// Start the cursor one day before the first game so the day-by-day loop (which
// advances, then simulates the new day) actually steps into every game date.
const PRESEASON = addDays(SEASON_START, -1);

function freshTeamState(teamId) {
  const team = TEAMS_BY_ID[teamId];
  const players = generateRoster(team);
  return {
    teamId,
    players,
    rotation: defaultLineup(players),
    record: { w: 0, l: 0 },
    confRecord: { w: 0, l: 0 },
    pf: 0,
    pa: 0,
    streak: 0, // + wins, - losses
  };
}

// Apply a game's box score + result to a team state, returning a new state.
function applyResult(ts, box, teamPts, oppPts, won, isConf) {
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
    streak: won ? Math.max(1, ts.streak + 1) : Math.min(-1, ts.streak - 1),
  };
}

export const useGame = create((set, get) => ({
  phase: 'SELECT', // SELECT | REGULAR | CONF_TOURNEY | NATIONAL | DONE
  userTeamId: null,
  teamStates: {},
  games: {}, // id -> game
  gameIdsByDate: {}, // iso -> [id]
  currentDate: PRESEASON,
  seasonStart: SEASON_START,
  lastRegularDate: null,
  lastConfDate: null,
  simulating: false,
  simTarget: null,
  version: 0,
  champions: {}, // conference -> teamId
  nationalField: null, // [teamId] seeded
  nationalChampionId: null,
  activeView: 'schedule', // schedule | roster | stats
  showReveal: false,
  revealRandom: false,

  setView: (v) => set({ activeView: v }),
  dismissReveal: () => set({ showReveal: false }),

  selectTeam: (teamId, { random = false } = {}) => {
    const teamStates = {};
    const teamIdsByConf = {};
    CONFERENCES.forEach((c) => (teamIdsByConf[c] = []));
    TEAMS.forEach((t) => {
      teamStates[t.id] = freshTeamState(t.id);
      teamIdsByConf[t.conference].push(t.id);
    });

    const { games, lastRegularDate } = buildRegularSeason(teamIdsByConf);
    const gamesById = {};
    const gameIdsByDate = {};
    games.forEach((g) => {
      gamesById[g.id] = g;
      (gameIdsByDate[g.date] ||= []).push(g.id);
    });

    set({
      userTeamId: teamId,
      teamStates,
      games: gamesById,
      gameIdsByDate,
      lastRegularDate,
      currentDate: PRESEASON,
      phase: 'REGULAR',
      activeView: 'schedule',
      showReveal: true,
      revealRandom: random,
      champions: {},
      nationalField: null,
      nationalChampionId: null,
      version: get().version + 1,
    });
  },

  // ---- Rotation management (user team) ----
  setStar: (playerId) =>
    set((s) => setUserRotation(s, { ...s.teamStates[s.userTeamId].rotation, starId: playerId })),

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
      const anyPending = Object.values(after.games).some(
        (g) => !g.played && g.homeId && g.awayId
      );
      const phaseChanged = after.phase !== startPhase;
      if (after.phase === 'DONE' || !anyPending || phaseChanged || shouldStop(after)) {
        set({ simulating: false });
        return;
      }
      // Brief pause on days the user's own team plays, so results register.
      const userPlayed = (after.gameIdsByDate[after.currentDate] || []).some((id) => {
        const g = after.games[id];
        return g && g.played && (g.homeId === after.userTeamId || g.awayId === after.userTeamId);
      });
      setTimeout(tick, userPlayed ? 360 : SIM_SPEED_MS);
    };
    setTimeout(tick, SIM_SPEED_MS);
  },

  simulateTo: (targetDate) => {
    if (targetDate <= get().currentDate) return;
    get()._runSim((st) => st.currentDate >= targetDate);
  },

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
        const result = simulateGame(home, away, { neutral: g.neutral });

        const homeWon = result.winnerId === g.homeId;
        const isConf = g.phase === 'REGULAR' || g.phase === 'CONF_TOURNEY';

        teamStates[g.homeId] = applyResult(
          home, result.homeBox, result.homePts, result.awayPts, homeWon, isConf
        );
        teamStates[g.awayId] = applyResult(
          away, result.awayBox, result.awayPts, result.homePts, !homeWon, isConf
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
      } else if (s.phase === 'NATIONAL' && allPlayed('NATIONAL')) {
        const finalGame = Object.values(games).find(
          (g) => g.phase === 'NATIONAL' && g.played && !g.nextGameId
        );
        if (finalGame) {
          patch.nationalChampionId = finalGame.result.winnerId;
          patch.phase = 'DONE';
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
