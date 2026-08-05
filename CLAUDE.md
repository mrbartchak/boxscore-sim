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
- `npm run calibrate -- [seasons]` — **run this after touching roster generation,
  the offseason, or any simulation weight.** Sims N full seasons headless and
  diffs the result against the historical record in `data/marchmadness.js`. Its
  last section (`DYNASTY DRIFT`) then ages a league a decade and checks that a
  carried-over league still has the same shape as a freshly generated one.

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
- `data/marchmadness.js` — historical NCAA tournament aggregates (1985–2024):
  seed-by-seed first round win rates, typical spreads, champion/Final Four
  distributions. **Facts, not logic** — the engine never reads it at runtime; it
  is the calibration target the sim constants were tuned against.
- `engine/random.js` — RNG helpers (`gaussian` (Box-Muller), `shuffle`, `weightedIndex`, `pick`, `clamp`, `round1`).
- `engine/players.js` — `generateRoster(team, cycle)`, `generatePlayer()`, `projectStats()`, `normalizeProjections()`, `overallTier()`, `wearsStar()`, `seasonAverages()`, `careerAverages()`.
- `engine/offseason.js` — the dynasty step: `advanceRoster(teamState, team)` plus
  `proDeclareChance`, `transferOutChance`, `developPlayer`, `recruitClass`,
  `rollCycle`/`nextCycle`. See "The offseason" below.
- `engine/simulation.js` — `defaultLineup()`, `rotationMinutes()`, `teamStrength()`, `simulateGame()`.
- `engine/schedule.js` — `buildRegularSeason()` (double round-robin per conf), date helpers, `SEASON_START`.
- `engine/rankings.js` — `powerRating`, `rankTeams`, `conferenceStandings`, `leaderboard`.
- `engine/tournament.js` — `seedConferenceTournaments()`, `selectNationalField()`, `buildNationalBracket()` (4 regions × 16), `buildSingleElim()`.
- `store/useGame.js` — see below.
- `audio/sfx.js` — Web Audio reveal SFX, synthesized (no asset files). One
  fanfare per `overallTier`; sits outside `engine/` because it touches browser
  APIs. Exports `playRevealSfx(tier)`, `playTeamSfx()`, `setMuted`/`isMuted`.
- `components/` — `App`, `Layout`, `SeasonView` (phase router for the schedule tab), `ScheduleView` (calendar), `TournamentView` (conf + national screens), `RosterView`, `StatsView`, `TeamSelect`, `RosterReveal`, `OffseasonReveal`, `Interstitials` (phase gates), `PlayerCard`, `common.jsx`.

## Key domain concepts

### Season phases (`store.phase`)
`SELECT → REGULAR → CONF_TOURNEY → NATIONAL → DONE`. The "Schedule" tab
(`SeasonView`) swaps content by phase: calendar (REGULAR) → conference bracket
(CONF_TOURNEY) → Selection Sunday gate + national bracket (NATIONAL/DONE). The
bracket lives ONLY here, not in Stats.

`BLANK_SEASON` in the store is the single source of truth for "what resets
between seasons". `selectTeam(id)` starts a dynasty at season 1 with generated
rosters league-wide; `newSeason()` ages the league one year (see "The offseason");
`abandonSeason()` drops back to `SELECT`. Anything that should survive a new
season (`userTeamId`, `seasonNumber`, `version`, `seasonStart`) must stay OUT of
`BLANK_SEASON`.

### Phase gates (the interstitials)
Each phase change raises a one-shot flag that `App` renders as a full-screen gate,
dismissed by an action of the same name. They render in a fixed priority chain in
`App` so two can never stack:

| flag | raised when | component |
|---|---|---|
| `showReveal` | `selectTeam` | `RosterReveal` |
| `showOffseason` | `newSeason` | `OffseasonReveal` |
| `showSeasonSummary` | REGULAR → CONF_TOURNEY | `Interstitials.SeasonSummary` |
| `showConfChamp` | CONF_TOURNEY → NATIONAL | `Interstitials.ConferenceChampBanner` |
| `showChampBanner` | NATIONAL → DONE | `App.ChampionBanner` |

They work because `_runSim` already stops at every phase boundary. The conference
champion banner deliberately says nothing about whether the *user* made the field —
that reveal belongs to Selection Sunday, which is the very next screen.

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

`starId` is **not user-editable** — it is always the highest-overall player, set
by `defaultLineup` and re-derived whenever the roster turns over (the player's own
`isStar` flag names the same man). `wearsStar(player, starId)` decides who shows a
★ in the UI: the featured player *and* anyone at diamond tier (90+).

Minutes are no longer only a scoring input: the offseason develops players in
proportion to the minutes they played, so the rotation is a multi-year decision.

### Roster generation (`generateRoster`) — four stages, in order
1. **Team talent level** — `prestigeToOverall(prestige) + cycle`, where `cycle`
   defaults to `gaussian(0, TEAM_NOISE_SD)`. The noise is the point: it gives
   blue-bloods down years and mid-majors dream teams. Deliberately conservative;
   the top of a roster is NOT built here. (The store passes an explicit `cycle`
   and stores it on the team state so the offseason can carry it forward.)
2. **`spread`** — how top-heavy the roster is, wider at high prestige. Applied
   through `TALENT_LADDER`, a 10-step curve re-centered on its own mean so
   `spread` changes a roster's SHAPE without changing how strong the team is.
   This is what keeps a blue-blood's 9th man from out-rating a good high-major's
   starters (the bug that motivated the whole system).
3. **Talent lottery** — two independent rolls on the best player. The common
   *blue-chip* roll is capped at 96; only the rare *generational* roll reaches
   the top of the scale, which is what keeps a 99 a once-in-years event.
   Odds scale with prestige but are never zero — Davidson landed Steph Curry.
4. **Position assignment** — the ladder is dealt across positions so the top five
   talents each take a different spot, with a 30% chance of a logjam swap.

Tuned so `npm run calibrate` reports: Duke starters ~83 / bench ~68, ~14 diamonds
and ~0.5 rainbows league-wide per season, and ~2 diamond+ players per season at
sub-65-prestige programs.

### The offseason (`engine/offseason.js`) — the dynasty loop
`newSeason()` runs `advanceRoster` for **every** team in the league, then rebuilds
the schedule. Rosters carry over; only the user's departures/arrivals are kept (in
`store.offseason`) for `OffseasonReveal` to replay. Three stages:

1. **Departures.** Every senior graduates. Underclassmen declare for the pro
   league on `proDeclareChance` — talent is the gate, prestige the multiplier, so
   nobody under `PRO_FLOOR` (74) ever leaves and a 92 at a blue-blood almost
   always does. Buried reserves (`depthRank >= 5`) may transfer out.
2. **Development.** `developPlayer` folds the season just played into the career
   line, resets the accumulators, advances the class, and closes part of the gap
   to `potential`. The gain scales with **minutes played** — which is what keeps
   rotations top-heavy instead of flattening toward the roster average, and is why
   `potential` headroom now grows with a player's rating (`rollPotential`).
3. **Recruiting.** `recruitClass` fills *exactly the positions that opened*, which
   is what keeps every roster two-deep at all five positions forever —
   `defaultLineup` would throw on an empty position. Recruits arrive
   `RECRUIT_DISCOUNT` below the program's level and grow into it. Roughly 10-22%
   of arrivals are portal transfers instead of freshmen (older, better now, less
   headroom); the same talent lottery runs for the headline signing.

**The program cycle is load-bearing.** A carried-over roster is four recruiting
classes averaged together, and four independent draws average *out* — left alone,
the league's strength spread collapses ~20%, blue-bloods regress to the mean, and
since `MARGIN_PER_RATING` turns strength spread into point spreads, every seed line
converges. So `cycle` is an AR(1) with `CYCLE_PERSISTENCE` memory and a stationary
spread of `TEAM_NOISE_SD`: a program's rise or fall lasts several seasons, and an
aged league keeps the same shape as a generated one. `npm run calibrate`'s
`DYNASTY DRIFT` table is the check — the two rows must stay close.

Known residual: after a decade the blue-blood band sits ~2 points below a fresh
league's, because the pros drain the best underclassmen and generation never does.
That is arguably the more realistic of the two.

### Simulation weighting — all calibrated against `data/marchmadness.js`
`simulateGame` is `ratingGap * MARGIN_PER_RATING + home court`, scattered by
`MARGIN_SD`. Do not change these blind — `npm run calibrate` exists to check them:
- `MARGIN_PER_RATING` (1.8) — rating → points. Set so the strength gaps between
  seed lines reproduce real first-round spreads (1v16 ≈ 23.5, 8v9 ≈ pick'em).
- `MARGIN_SD` (11.0) — real CBB margins scatter ~11 points around the spread.
  Lowering this is the fastest way to make the bracket unrealistically chalky.
- `HOME_COURT_POINTS` — added in POINTS after the rating conversion, not before.
- `CLASS_BONUS` — veteran rotations outperform raw talent, the best-documented
  reason veteran mid-majors upset freshman-led blue-bloods.
- `POSTSEASON_FORM_SD` — re-rolled per team at each postseason phase, **always
  after the field is seeded**. Our seeding is near-perfect (true strength over 30
  games) where the real committee seeds a four-month-old resume; this models that
  gap, and without it 1 seeds win ~78% of titles instead of the historical ~63%.

Known residual: 5v12 and 8v9 come out ~5-7 points chalkier than history, because
the real committee under-seeds mid-major champions and the 8/9 line is a coin
flip by construction. Our seeding is strictly merit-ordered, so it can't
reproduce that. Everything else lands within ~4 points.

### Player stats
- `projPpg/projApg/projReb` — internal sim weights (`projectStats`), then
  `normalizeProjections` scales them so the roster sums to a realistic team total
  (~73 pts). NOT displayed directly. **Any code that changes roster membership
  must re-run `normalizeProjections`** — the offseason does.
- Accumulated `gp/pts/ast/reb/min` → `seasonAverages(p)` (null before any games).
- `careerGp/careerPpg/...` — generated backstory for a player's seasons before you
  had him, then genuinely accumulated each offseason. Freshmen have none →
  `careerAverages(p)` returns null (shown as dashes).
- `potential` is the ceiling development walks toward; `lastOverall` is set by
  `developPlayer` so the offseason screen can show the year's ▲/▼.
- **Reveal shows career averages; Roster shows season averages.**
- `overallTier(ovr)`: 99=rainbow, 90-98=diamond, 80-89=gold, 70-79=silver, else base. Drives `PlayerCard` colors and reveal animation drama.

### National bracket — mirrors the real bracketing principles
64 teams → 4 regions of 16 → Final Four → Championship. Rendered two-sided
(regions 0,1 left; 2,3 right) with the title game in the middle. Region games
carry `region` (0–3); FF games carry `ffRegions`. The rules it implements:
- **Auto-bids first.** Every conference tournament champion is in regardless of
  resume (which is how a sub-.500 team reaches the field); the rest are at-large.
- **Seeding is opponent-adjusted.** `powerRating` runs on adjusted scoring margin
  — since the regular season is played entirely inside the conference, a team's
  SOS simply *is* its conference's strength, and the adjustment is exact. Raw
  margin is the trap: it puts one-bid-league bullies on the 4 line.
- **S-curve.** `assignRegions` deals each seed line across regions in alternating
  direction, so the strongest 1 seed draws the weakest 2 and the weakest 16.
- **Conference separation.** `separateConferences` hill-climbs on swaps *within a
  seed line* until no two same-conference teams share a Sweet 16 path. Residual
  ~1% of first-round games, where a big conference makes it unavoidable.

Deliberate omission: the real event is 68 with a First Four play-in. This is the
64-team bracket the play-in feeds.

## Conventions
- JSX (not TS). Plain CSS in `src/index.css` with CSS custom properties; the
  user's team color flows in as `--team` on the root container for theming.
- Immutable-but-scoped state updates: `_stepDay` clones only the teams/games
  touched that day (keeps ~184 teams cheap to re-render).
- Dates are ISO strings (`"2025-11-04"`) — serializable for a future DB.
- Comments explain *why*, matching existing density. Keep it economical.

## Known limitations / possible next steps
- **No persistence** — refresh resets everything. (Postgres/localStorage TBD.)
- **No dynasty history** — rosters, development and recruiting now carry across
  seasons, but nothing *records* the seasons: no year-by-year team history, no
  banners, no career leaderboards, no coach reputation feeding back into prestige
  (`team.prestige` is static data, so winning never makes a program stronger).
- **Recruiting is not a decision** — `recruitClass` hands you a class sized to your
  departures at your prestige level. There is no board, no pitch, no competition.
- Drag-and-drop uses native HTML5 DnD → **mouse only, not touch**.
- Season calendar is date-compressed (title game lands ~late Feb, not April).
- When adding a conference, keep it **≥8 teams** — `seedConferenceTournaments`
  builds an 8-team bracket and assumes at least 8.
- Every regular-season game is **intra-conference** (double round-robin), so a
  team's record is only meaningful relative to its league. Several parts of the
  engine depend on this; adding non-conference games means reworking the SOS
  term in `powerRating` into a real opponent-average.
- Conference tournaments are 8 teams for every conference regardless of size.
