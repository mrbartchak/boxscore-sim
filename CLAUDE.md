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
- `npm run calibrate -- [seasons]` — **run this after touching roster generation
  or any simulation weight.** Sims N full seasons headless and diffs the result
  against the historical record in `data/marchmadness.js`.
- `npm run lineupfit -- [rosters]` — **run this after touching any weight in
  `engine/lineup.js`.** Re-derives every hard-coded constant in that file, checks
  chemistry is uncorrelated with prestige, and runs forced-lineup-shape scenarios
  to confirm the terms still conflict. Then re-run `calibrate`.

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
- `data/archetypes.js` — the 6 `ATTRIBUTES`, `POSITION_WEIGHTS` (how each
  attribute counts toward overall at each position), and the 41-entry
  `ARCHETYPES` catalog. Facts only; selection/generation live in `players.js`.
- `data/marchmadness.js` — historical NCAA tournament aggregates (1985–2024):
  seed-by-seed first round win rates, typical spreads, champion/Final Four
  distributions. **Facts, not logic** — the engine never reads it at runtime; it
  is the calibration target the sim constants were tuned against.
- `engine/random.js` — RNG helpers (`gaussian` (Box-Muller), `shuffle`, `weightedIndex`, `pick`, `clamp`, `round1`).
- `engine/players.js` — `generateRoster(team)`, `overallFrom()`, `effectiveOverall()`, `archetypeOf()`, `overallTier()`, `seasonAverages()`, `careerAverages()`.
- `engine/simulation.js` — `defaultLineup()`, `rotationMinutes()`, `teamStrength()`, `simulateGame()`, `rollPostseasonForm()`. Re-exports `slotPositions()`.
- `engine/lineup.js` — five-man unit chemistry: `lineupFit()` (rating points, added by `teamStrength`), `lineupTerms()`, `slotPositions()`, plus `FIT_TERMS`/`fitGrade()` for the UI.
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
A starter's `pos` is the slot he FILLS, which may not be his natural position —
see Positional fit.

### Attributes and archetypes
Every player carries `attrs` — `inside`, `outside`, `playmaking`, `perimeterD`,
`interiorD`, `rebounding` (each 25–99) — plus an `archetype` id.

**`overall` is DERIVED, never stored independently**: `overallFrom(attrs, position)`
is the `POSITION_WEIGHTS` dot product, so a center's rebounding is worth ~2x a
point guard's. Every existing tier/colour threshold keeps working unchanged.

**An archetype is a shape, not a level.** `shape` holds rating-point offsets, and
`buildAttributes` re-centers afterwards so the derived overall lands *exactly* on
the number the talent ladder assigned. This is load-bearing — it's why adding 41
archetypes did not move the season calibration by a point. Verified across every
archetype × position × talent level: mean error 0.000, worst 0.

Consequences worth knowing:
- A spike is always paid for elsewhere. A Sniper's shooting costs him defense and
  rebounding; he is not a better player than a Glue Guy of the same overall.
- `minOverall` / `maxOverall` gate archetypes to a talent band, so Unicorn and
  Bucket Getter are things that happen to a roster (~24% of players 84+), and
  Raw Project never lands on the best player in the country.
- Box-score tendencies flow from the attributes via `spike()`, not from position.
  A Floor General leads his team in assists because his playmaking towers over
  the rest of his own game. Scoring uses a gentler exponent (1.35 vs 3.2/2.8)
  because usage, star status and minutes already multiply it downstream.

**The six attributes are deliberately NOT shown in the UI.** Cards show overall
and archetype only. Working out which archetypes fit together is the game — do
not "helpfully" add an attribute readout.

### Positional fit (live)
`teamStrength` rates each starter via `effectiveOverall(player, slotPosition)` —
his overall recomputed under the slot's `POSITION_WEIGHTS` — not at his natural
spot. Stacking two point guards costs whatever the second gives up sliding over.
Bench players have no assigned slot and are never penalised.

Two properties this leans on, both verified:
- **`defaultLineup` never plays anyone out of position** (rosters always hold
  exactly 2 of each position, and the logjam swap preserves that multiset). So
  the penalty is worth exactly zero for all 184 AI teams and the league
  calibration is untouched. Confirmed over 7,360 default lineups: 0 out of spot.
- Searching every swap from the default lineup, ~89% of rosters have some
  improvement available, averaging +0.45 rating (~0.8 pts of margin), best
  observed +1.9 (~3.4 pts). The worst available mistake costs ~-1.5.

That gap is intentional: the AI leaves value on the table, and finding it is the
user's reward for engaging. Don't "fix" `defaultLineup` into an optimiser without
deciding how much edge the player should keep.

The card's big number and tier colour stay tied to the NATURAL overall so a card
doesn't change identity mid-drag; the `pcard__fit` badge carries the consequence.

### Lineup chemistry (`engine/lineup.js`) — live
What the five on the floor are worth TOGETHER, added to `teamStrength` as
`lineupFit(teamState)` in rating points. Seven terms: spacing, interior scoring,
shot creation, ball sharing, rim protection, perimeter D, rebounding.

**The load-bearing idea.** Every term reads a player's attributes relative to
**his own overall**, not to the lineup's or the league's. Because overall is a
position-weighted dot product, the position-weighted sum of one player's edges
is *exactly zero* — each player carries a fixed budget of shape, and a spike is
provably paid for inside the same player. The terms spend that budget through
different curves, so they conflict structurally rather than by tuning. Swapping
a big for a shooter buys spacing with the glass, automatically.

**Three inputs, no double-counting** — keep it this way:
- how good the five are → minutes-weighted rating
- where they stand → positional fit (`effectiveOverall`)
- which shapes share the floor → chemistry

Per-player centering isn't cosmetic; it closed two exploits found by measurement.
Centering on the *lineup mean* let a five of weaker players inflate every term at
once, so chemistry paid you to bench your best player. Centering on *effective*
(post-slot) overalls let a misaligned lineup lower its own baseline, so chemistry
paid you to misalign. Both showed up as impossible-looking positive deltas in
`npm run lineupfit` before they were understood.

Shape notes worth keeping: spacing is a count of threats a defense must honor
(logistic per player, then a log — the 1st shooter is worth everything, the 4th
almost nothing) and is deliberately asymmetric, since five shooters gain less
than five non-shooters lose. Interior scoring is a genuine *interaction*, best
paint threat × spacing, netted by `PAINT_BASE` so it means "leans on the paint
more than usual" rather than degenerating into a scaled copy of spacing. Rim
protection keys on the best defender (one shot-blocker covers for four);
perimeter D keys on the **worst** (offenses hunt the weakest man). Ball sharing
is penalty-only and zero for 99% of lineups — it exists to punish stacking
ball-dominant archetypes.

**Measured, not guessed** — `npm run lineupfit` derives every hard-coded constant
(`FIT_CENTER`, `PAINT_BASE`, `CLASH_BUDGET`, and each term's `base`/`scale`) and
re-run it after changing any weight, then re-run `calibrate`. Current state:
- chemistry averages ~0 league-wide (sd ~0.47 rating), `corr(prestige, chemistry)
  = 0.02` — it must NOT correlate with prestige or it just amplifies talent
- one swap moves chemistry ~1.2 rating across its range (max 3.4)
- benching your best shooter for an equally-rated non-shooter costs ~0.24 rating
  and is worse on 74% of rosters — the mechanic the design is actually about
- forced-shape checks all land negative: five bigs -0.11, five shooters -0.08,
  no creator -0.38, and top-5-talent-regardless-of-position ~0.00

Effect on the bracket, A/B over **400 seasons each** (1,600 games per seed line,
so ~1.2pt standard error — shorter runs are noise, and a 150-season pass wrongly
suggested a much larger win):

| line | without | with | historical |
|------|---------|------|------------|
| 5v12 | +7.9 | **+3.9** | 65.0% |
| 8v9  | +5.0 | **+3.8** | 49.4% |
| 3v14 | -0.8 | -2.6 | 85.6% |
| 7v10 | -2.5 | -3.5 | 61.3% |

Mean absolute first-round error 3.78 → 3.36. 1-seed title share is **unchanged**
at 71.8%. The mechanism is simple and worth remembering: chemistry adds strength
variance that is uncorrelated with seed, so every line gets pulled toward 50%.
That helps where we were too chalky (5v12, 8v9 — the two residuals this file has
always documented) and mildly hurts where we were already below history (3v14,
7v10). It is a real but modest gain, concentrated almost entirely on 5v12.

`fitGrade(key, value)` grades each term against **its own** league distribution.
Do not give the terms a shared scale — Shot Creation averages +0.49 and Perimeter
D averages -0.46, so one scale would tell every user their creation is elite and
their perimeter defense is a disaster.

The `LineupReport` panel in `RosterView` is the ONLY feedback the game gives on
any of this, since the six attributes are hidden. It shows word grades and
centered bars, never raw numbers — consequences, not inputs.

### Roster generation (`generateRoster`) — four stages, in order
1. **Team talent level** — `prestigeToOverall(prestige) + gaussian(0, 3.6)`. The
   noise is the point: it gives blue-bloods down years and mid-majors dream
   teams. Deliberately conservative; the top of a roster is NOT built here.
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

Known residual: 5v12 and 8v9 still come out ~4 points chalkier than history
(down from ~5-8 before lineup chemistry), because the real committee under-seeds
mid-major champions and the 8/9 line is a coin flip by construction. Our seeding
is strictly merit-ordered, so it can't reproduce that. Everything else lands
within ~4 points; mean absolute first-round error is ~3.4.

Also known: 1 seeds win ~72% of titles against a historical 62.5%. Lineup
chemistry did NOT move this, and neither did anything else tried so far. **Only
trust A/B numbers from 300+ season runs** — at 150 seasons the seed-line noise is
±3-6 points, which is larger than most effects being measured here, and it has
produced convincing-looking phantom results more than once.

### Player stats
- `projPpg/projApg/projReb` — internal sim weights derived from `attrs` +
  archetype `usage`, normalized at generation so the roster sums to a realistic
  team total (~73 pts). NOT displayed directly.
- Accumulated `gp/pts/ast/reb/min` → `seasonAverages(p)` (null before any games).
- `careerGp/careerPpg/...` — generated backstory for returning players; freshmen
  have none → `careerAverages(p)` returns null (shown as dashes).
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
- **No true dynasty** — `newSeason()` regenerates every roster from scratch; no
  recruiting, player progression, or carry-over history between seasons yet.
- Drag-and-drop uses native HTML5 DnD → **mouse only, not touch**.
- Season calendar is date-compressed (title game lands ~late Feb, not April).
- When adding a conference, keep it **≥8 teams** — `seedConferenceTournaments`
  builds an 8-team bracket and assumes at least 8.
- Every regular-season game is **intra-conference** (double round-robin), so a
  team's record is only meaningful relative to its league. Several parts of the
  engine depend on this; adding non-conference games means reworking the SOS
  term in `powerRating` into a real opponent-average.
- Conference tournaments are 8 teams for every conference regardless of size.
- Chemistry scores the STARTING FIVE only; the bench's 50 minutes are treated as
  neutral-fit (`FIT_MINUTES_SHARE = 0.75`). Modelling a real second unit means
  deciding which five actually share the floor, which the minutes model doesn't
  currently express.
- `defaultLineup` is not a chemistry optimiser — AI teams take the best player at
  each position and leave the fit value on the table. That gap IS the player's
  edge (~1.2 rating of swing per swap); don't close it without deciding how much
  edge to keep.
- Natural next layers, in rough order: minutes budget + stamina/fouls; a
  system/scheme choice (pace, zone, press) that re-weights the chemistry terms;
  role satisfaction (a high-usage archetype buried on the bench sulks);
  multi-season development using `potential`.
