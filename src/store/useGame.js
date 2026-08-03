import { create } from 'zustand';
import { TEAMS, CONFERENCES, TEAMS_BY_ID } from '../data/teams.js';
import { generateRoster } from '../engine/players.js';
import { defaultRotation, simulateGame } from '../engine/simulation.js';
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
    rotation: defaultRotation(players),
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

  setView: (v) => set({ activeView: v }),

  selectTeam: (teamId) => {
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
      version: get().version + 1,
    });
  },

  // ---- Rotation management (user team) ----
  toggleStarter: (playerId) =>
    set((s) => {
      const ts = s.teamStates[s.userTeamId];
      let starters = ts.rotation.starters;
      if (starters.includes(playerId)) {
        starters = starters.filter((id) => id !== playerId);
      } else if (starters.length < 5) {
        starters = [...starters, playerId];
      } else {
        return {};
      }
      return updateUserRotation(s, { starters });
    }),

  setStar: (playerId) =>
    set((s) => updateUserRotation(s, { starId: playerId })),

  setMinutes: (playerId, minutes) =>
    set((s) => {
      const ts = s.teamStates[s.userTeamId];
      const m = Math.max(0, Math.min(40, minutes));
      return updateUserRotation(s, {
        minutes: { ...ts.rotation.minutes, [playerId]: m },
      });
    }),

  // ---- Simulation ----
  simulateTo: (targetDate) => {
    if (get().simulating) return;
    if (targetDate <= get().currentDate) return;
    set({ simulating: true, simTarget: targetDate });

    const tick = () => {
      const s = get();
      if (!s.simulating) return;
      get()._stepDay();
      const after = get();
      // Any game that is scheduled with known participants but not yet played.
      const anyPending = Object.values(after.games).some(
        (g) => !g.played && g.homeId && g.awayId
      );
      if (after.currentDate >= after.simTarget || after.phase === 'DONE' || !anyPending) {
        set({ simulating: false, simTarget: null });
        return;
      }
      setTimeout(tick, SIM_SPEED_MS);
    };
    setTimeout(tick, SIM_SPEED_MS);
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

function updateUserRotation(s, changes) {
  const ts = s.teamStates[s.userTeamId];
  return {
    teamStates: {
      ...s.teamStates,
      [s.userTeamId]: { ...ts, rotation: { ...ts.rotation, ...changes } },
    },
    version: s.version + 1,
  };
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
