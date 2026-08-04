# College Hoops Dynasty — Project Context

A browser-based **college basketball simulation game**. Pick a program, get a
randomly generated roster, manage your lineup, and sim through a season →
conference tournaments → 64-team national bracket.

Currently a **client-only React + Vite app** (no backend yet). Long-term plan:
add a **Python backend + Postgres**. The code is deliberately layered so the
game logic can be ported/served later (see Architecture).

## Commands
- `npm run dev` — dev server at http://localhost:5173/ (exposed on LAN via `server.host` in `vite.config.js`)
- `npm run build` — production build to `dist/` (use this to catch compile errors)
- `npm run preview` — serve the built app

Headless engine checks: the store + engine are pure ESM importable in Node
(no JSX), so a `node script.mjs` that imports `src/store/useGame.js`, calls
`selectTeam(id)` and loops `_stepDay()` can verify a full season without a browser.

## Architecture — one-way dependency flow
```
data/  →  engine/  →  store/  →  components/
(facts)  (pure logic)  (state)   (React UI)
```
- **`data/`** and **`engine/`** are PURE — no React, no zustand, no DOM. This is
  the layer that ports to a Python backend later. Never import "up" the chain.
- **`store/useGame.js`** — single zustand store; all game state + actions.
- **`components/`** — read the store, call actions, render. No game rules here.

## File map
- `data/teams.js` — 17 conferences, 184 teams. Each team: `{id, name, abbr, conference, prestige(0-100), color}`. `prestige` drives roster quality.
- `data/names.js` — first/last name pools.
- `engine/random.js` — RNG helpers (`gaussian`, `pick`, `clamp`, `round1`).
- `engine/players.js` — `generateRoster(team)`, `overallTier()`, `seasonAverages()`, `careerAverages()`.
- `engine/simulation.js` — `defaultLineup()`, `rotationMinutes()`, `teamStrength()`, `simulateGame()`.
- `engine/schedule.js` — `buildRegularSeason()` (double round-robin per conf), date helpers, `SEASON_START`.
- `engine/rankings.js` — `powerRating`, `rankTeams`, `conferenceStandings`, `leaderboard`.
- `engine/tournament.js` — `seedConferenceTournaments()`, `selectNationalField()`, `buildNationalBracket()` (4 regions × 16), `buildSingleElim()`.
- `store/useGame.js` — see below.
- `audio/sfx.js` — Web Audio reveal SFX, synthesized (no asset files). One
  fanfare per `overallTier`; sits outside `engine/` because it touches browser
  APIs. Exports `playRevealSfx(tier)`, `playTeamSfx()`, `setMuted`/`isMuted`.
- `components/` — `App`, `Layout`, `SeasonView` (phase router for the schedule tab), `ScheduleView` (calendar), `TournamentView` (conf + national screens), `RosterView`, `StatsView`, `TeamSelect`, `RosterReveal`, `PlayerCard`, `common.jsx`.

## Key domain concepts

### Season phases (`store.phase`)
`SELECT → REGULAR → CONF_TOURNEY → NATIONAL → DONE`. The "Schedule" tab
(`SeasonView`) swaps content by phase: calendar (REGULAR) → conference bracket
(CONF_TOURNEY) → Selection Sunday gate + national bracket (NATIONAL/DONE). The
bracket lives ONLY here, not in Stats.

`BLANK_SEASON` in the store is the single source of truth for "what resets
between seasons". `newSeason()` re-runs `selectTeam` with the current program
(fresh rosters league-wide, `seasonNumber++`); `abandonSeason()` does the same
but drops back to `SELECT`. Anything that should survive a new season
(`userTeamId`, `seasonNumber`, `version`, `seasonStart`) must stay OUT of
`BLANK_SEASON`.

### The simulation loop
`_stepDay()` advances the calendar ONE day, sims all games on that date across
the whole league, accumulates box scores into team/player stats, propagates
tournament winners via `nextGameId`/`nextSlot` feeder links, and runs phase
transitions (generates the next phase's games when the current one completes).

`_runSim(shouldStop)` runs `_stepDay` on a timer. It **always stops at a phase
boundary** (so the postseason never auto-runs — this is intentional; the user
wanted a pause before each tournament). It also pauses ~360ms on days the user's
team plays. Public actions: `simulateTo(date)`, `simulateRound()`,
`simulateTournament()`, `stopSim()`.

**Gotcha:** `currentDate` starts at `PRESEASON` (one day BEFORE the first game),
because `_stepDay` advances *then* simulates the new day — otherwise day-0 games
get skipped.

### Rotation model (`teamState.rotation`)
`{ starters: [{pos, id} × 5], bench: [id × 5], starId }`. Slot ids used by
drag-and-drop: `"S:PG".."S:C"` and `"B:0".."B:4"`. Minutes are DERIVED, not set:
starters 30 each, bench `[22,13,8,5,2]` (6th→10th man) = 200 total. `swapLineup(fromSlot, toSlot)` swaps occupants. `starId` gives a usage boost in the sim.

### Player stats
- `projPpg/projApg/projReb` — internal sim weights, normalized at generation so
  the roster sums to a realistic team total (~73 pts). NOT displayed directly.
- Accumulated `gp/pts/ast/reb/min` → `seasonAverages(p)` (null before any games).
- `careerGp/careerPpg/...` — generated backstory for returning players; freshmen
  have none → `careerAverages(p)` returns null (shown as dashes).
- **Reveal shows career averages; Roster shows season averages.**
- `overallTier(ovr)`: 99=rainbow, 90-98=diamond, 80-89=gold, 70-79=silver, else base. Drives `PlayerCard` colors and reveal animation drama.

### National bracket
64 teams → 4 regions of 16 (snake-seeded 1–16) → Final Four → Championship.
Rendered two-sided (regions 0,1 left; 2,3 right) with the title game in the
middle. Region games carry `region` (0–3); FF games carry `ffRegions`.

## Conventions
- JSX (not TS). Plain CSS in `src/index.css` with CSS custom properties; the
  user's team color flows in as `--team` on the root container for theming.
- Immutable-but-scoped state updates: `_stepDay` clones only the teams/games
  touched that day (keeps ~184 teams cheap to re-render).
- Dates are ISO strings (`"2025-11-04"`) — serializable for a future DB.
- Comments explain *why*, matching existing density. Keep it economical.

## Known limitations / possible next steps
- **No persistence** — refresh resets everything. (Postgres/localStorage TBD.)
- **No true dynasty** — `newSeason()` regenerates every roster from scratch; no
  recruiting, player progression, or carry-over history between seasons yet.
- Drag-and-drop uses native HTML5 DnD → **mouse only, not touch**.
- Season calendar is date-compressed (title game lands ~late Feb, not April).
- When adding a conference, keep it **≥8 teams** — `seedConferenceTournaments`
  builds an 8-team bracket and assumes at least 8.
