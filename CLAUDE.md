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
- `data/teams.js` — the 2025-26 Division I membership: 31 conferences, 365 teams,
  ranging from 7 members (WAC) to 18 (ACC, Big Ten). Each team:
  `{id, name, abbr, conference, prestige(0-100), color}`. `prestige` drives roster
  quality and now spans 32-95, a full tier deeper than the old 184-team league.
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
- `engine/schedule.js` — `buildRegularSeason(teams)` builds all 5,475 games, date
  helpers, `SEASON_START`. See "The schedule" below.
- `engine/rankings.js` — `powerRating`, `rankTeams`, `conferenceStandings`, `leaderboard`.
- `data/conferenceTournaments.js` — the field size and bye structure each of the
  31 leagues actually plays, from the 2026 brackets. Facts; see "Conference
  tournaments" below for the `entries` notation.
- `engine/tournament.js` — `seedConferenceTournaments()`, `buildStaggered()`,
  `confRoundNames()`, `selectNationalField()`, `buildNationalBracket()`
  (4 regions × 16), `buildSingleElim()`.
- `engine/history.js` — `buildSeasonRecord()`, the one row the record book keeps
  per completed season. See "The record book" below.
- `store/useGame.js` — see below.
- `audio/sfx.js` — Web Audio reveal SFX, synthesized (no asset files). One
  fanfare per `overallTier`; sits outside `engine/` because it touches browser
  APIs. Exports `playRevealSfx(tier)`, `playTeamSfx()`, `setMuted`/`isMuted`.
- `components/` — `App`, `Layout`, `SeasonView` (phase router for the schedule tab), `ScheduleView` (calendar), `TournamentView` (conf + national screens), `SelectionSunday` (seed reveal), `RosterView`, `StatsView`, `TeamSelect`, `RosterReveal`, `OffseasonReveal`, `Interstitials` (phase gates), `LegacyView` (rafters + record book), `PlayerCard`, `common.jsx`.

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

`OffseasonReveal` runs three acts of its own inside the `showOffseason` gate:
**development** (last season's roster laid out as cards from the first frame,
then resolved one at a time — the rating flips, the card pops in proportion to
the gain via a `--pop` custom property, a tier crossing borrows the roster
reveal's animation, and departures fade out under their reason), **recruits**,
then **roster**, which embeds `RosterView` so the lineup can be set before
tip-off. Note the specificity trap: the pop animation is a shorthand and must
exclude `.devcard--tierup`, or it silently cancels the tier animation.

Selection Sunday is the exception: it isn't a store flag but local state in
`NationalTournamentView`, because it gates a whole phase's screen rather than
overlaying it. `SelectionSunday` reveals the field, then the region, then the
seed; a team that missed the field gets `skipToOffseason()`, which plays the
bracket out (the league still needs a champion to age from) and lands in the
offseason.

They work because `_runSim` already stops at every phase boundary. The conference
champion banner deliberately says nothing about whether the *user* made the field —
that reveal belongs to Selection Sunday, which is the very next screen.

### The schedule (`buildRegularSeason`)
Every team plays **exactly 30 games: 12 non-conference, then 18 in league**, at
about two a week. The unit of construction is a ROUND — a set of games in which
no team appears twice — and rounds are spread evenly across their window.

- **League play** must produce 18 games out of conferences that range from 7 to 18
  members, so it stacks whole round-robins (flipping home/away each cycle) and
  tops up the remainder. How it tops up depends on parity: an **even** league can
  simply play more rounds of the same rotation, because every team appears in
  every round. An **odd** one always has somebody sitting, so its remainder is
  built as a circulant and packed into rounds — which is why a 9- or 11-team
  league needs a few more dates to fit the same 18 games.
- **Non-conference** is built as a graph, not a rotation: line the league up in a
  random order and give each team the six neighbours on each side. That is
  exactly 12 opponents each with nobody benched. **Do not "simplify" this back
  into a league-wide round-robin.** With an odd number of teams somebody draws a
  bye every round, and the teams a rotation benches in consecutive rounds are the
  same ones it has already matched against each other — so they cannot make the
  game up among themselves afterwards, and ~20% of seasons have no valid pairing
  at all. That failure is silent: teams just quietly end up on 29 games.
- Same-conference pairings from the random order are fixed by **trading partners**
  between two games, which keeps everyone's count at 12. Every swap is checked
  against a set of what is already scheduled, including rounds not yet reached.
- `packIntoRounds` skims maximal sets of games, then folds the tail back into
  `d + 1` rounds. Both halves matter: skimming keeps rounds evenly sized, and
  folding stops a straggler from waiting a fortnight between games.

November-December is non-conference, January-February league, and the title game
lands in March — the old calendar was compressed into February.

### The simulation loop
`_stepDay()` advances the calendar ONE day, sims all games on that date across
the whole league, accumulates box scores into team/player stats, propagates
tournament winners via `nextGameId`/`nextSlot` feeder links, and runs phase
transitions (generates the next phase's games when the current one completes).

`simulateSeason()` is the calendar's play button: `_runSim` with no stop
condition, which runs to the phase boundary and halts itself at the summary.

`simulateRegularSeason()` is the exception to the timer: it loops `_stepDay`
synchronously to the end of the regular season (~220ms for all 5,475 games) so it
lands directly on the season-summary gate instead of animating a hundred days.
Because it runs inside a click handler, React batches it into one render.

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
the schedule. Rosters carry over; only the user's own offseason is kept, in
`store.offseason` as `{ report, departures, incoming }`. `report` has one row per
player who finished last season on the roster, best first — `{ before, after,
reason }` — which is what `OffseasonReveal` walks down in its first act. Three
stages:

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
   keeps every roster two-deep at all five positions forever —
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

### Conference tournaments — every league runs its own real format
Not a 64-team bracket in miniature. A league seats 7, 13 or 18 teams and buys
its best programs rest with byes, so the brackets are **staggered**: a round
holds whoever survived the last one plus whoever enters at it, and the whole
thing runs as many rounds as that takes (two for Ivy Madness, seven for the Sun
Belt stepladder). `data/conferenceTournaments.js` describes each one as
`entries` — how many NEW teams enter at each round, worst seeds first:

```
[8]        8-team bracket, everyone opens in the quarterfinals   (MAC, MEAC)
[8, 4, 4]  all 16: 9-16 open, 5-8 bye, 1-4 double bye            (SEC, Big 12)
[6, 5, 4]  15 of 18, three tiers of byes                         (ACC)
[4, 2, 2]  a stepladder — two seeds join at every rung            (OVC, Big West)
```

The field is the sum, the round count falls out of the halving, and a team
entering at round r has r byes. **The rounds must stay even** — an odd round
means a bye nobody earned, so `assertFormats` refuses it at import.

Three rules make it work:
- **Pairing is best-remaining vs worst-remaining**, where a game's "seed" is the
  best seed that can come out of it. That one rule reproduces 5v12 and 8v9 in a
  16-team field AND the 8 seed drawing the 9/12 winner on a stepladder — do not
  replace it with a fixed line order.
- **Every tournament ends on the same day.** Rounds are a day apart and the
  finals are aligned, so longer brackets simply tip off earlier in the week.
  `lastConfDate` is that shared final date, which is what the NATIONAL phase
  counts forward from. The consequence to remember: **the leagues no longer
  share a calendar**, so the next date with a conference tournament game on it
  is usually somebody else's round. `simulateRound` therefore targets the next
  game in the USER'S conference — targeting the league-wide next date (which is
  what it used to do) leaves the bracket on screen untouched for two presses
  while the Sun Belt plays its opening rounds.
- **`bracketPos`, not insertion order, is the printed order.** Pairing by seed
  builds a round as 1v8, 2v7, 3v6, 4v5, but 1v8 and 4v5 feed the same next game —
  read top to bottom the tree crosses itself. `orderForDisplay` walks back from
  the final so each game sits beside the one it feeds; the UI sorts on it.

`confTourneyFormat(conf, teamCount)` is what the UI asks before a bracket
exists (the season summary has to name the field you made or missed), and it
also trims a format if a league is ever smaller than the one it was written for.

### The record book (`engine/history.js` → the Legacy tab)
`store.history` is one `buildSeasonRecord()` row per COMPLETED season, oldest
first. Like `userTeamId` and `seasonNumber` it lives **outside `BLANK_SEASON`**,
and it is cleared only by `selectTeam` and `abandonSeason` — a new season must
not wipe the thing that remembers the old ones.

It is written at the **NATIONAL → DONE transition inside `_stepDay`**, not in
`newSeason()`, for two reasons: the offseason is about to delete every game the
row is derived from, and writing it at DONE means the season you just finished is
already in the Legacy tab while you're still looking at the champion banner.

Two traps the row exists to avoid:
- **`ts.record` is not the regular-season record** by the time the season ends —
  both tournaments have been folded into it. The row re-counts wins from the
  `REGULAR` games themselves.
- **`teamStrength` includes `form`**, the March mood swing rolled at each
  postseason phase. The recorded `overall` zeroes it, so the number describes the
  roster rather than the week it happened to get hot.

`LegacyView` hangs three banners off `natChamp`, `confChamp` and `semiFinalist`
(reached the Final Four, i.e. `roundReached >= FINAL_FOUR_ROUND`), in the user
team's colors via the `--team` custom properties `Layout` already puts on the
root. An unearned banner still hangs, greyed — the empty rafter is the point.

### Simulation weighting — all calibrated against `data/marchmadness.js`
`simulateGame` is `ratingGap * MARGIN_PER_RATING + home court`, scattered by
`MARGIN_SD`. Do not change these blind — `npm run calibrate` exists to check them:
- `MARGIN_PER_RATING` (1.15) — rating → points. Set so the strength gaps between
  seed lines reproduce real first-round spreads (1v16 ≈ 23.5, 8v9 ≈ pick'em).
  It was 1.8 for the old 184-team league; going to all 365 programs added a tier
  below the old floor and widened the 1-vs-16 rating gap by half again. The
  ratings didn't become wrong, the conversion did — this is the knob for it.
- `MARGIN_SD` (11.0) — real CBB margins scatter ~11 points around the spread.
  Lowering this is the fastest way to make the bracket unrealistically chalky.
- `HOME_COURT_POINTS` — added in POINTS after the rating conversion, not before.
- `CLASS_BONUS` — veteran rotations outperform raw talent, the best-documented
  reason veteran mid-majors upset freshman-led blue-bloods.
- `POSTSEASON_FORM_SD` (0.55) — re-rolled per team at each postseason phase,
  **always after the field is seeded**. It is in RATING points, so compressing
  `MARGIN_PER_RATING` made it relatively stronger and it came down to match.
  Our seeding is near-perfect (true strength over 30 games) where the real
  committee seeds a four-month-old resume; this models that gap, and without it
  the 1 seeds run away with the tournament.

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
- `pollRanks(teamStates)` is the top 25 as `{ teamId: rank }` — teams outside it
  are unranked and carry no number. Shown beside the user's name in the topbar
  and beside opponents on the calendar. Before any games it ranks on prestige,
  which reads as a preseason poll.
- `overallTier(ovr)`: 99=rainbow, 90-98=diamond, 80-89=gold, 70-79=silver, else base. Drives `PlayerCard` colors and reveal animation drama.

### National bracket — mirrors the real bracketing principles
64 teams → 4 regions of 16 → Final Four → Championship. Rendered two-sided
(regions 0,1 left; 2,3 right) with the title game in the middle. Region games
carry `region` (0–3); FF games carry `ffRegions`. The rules it implements:
- **Auto-bids first.** Every conference tournament champion is in regardless of
  resume (which is how a sub-.500 team reaches the field); the rest are at-large.
- **Seeding is opponent-adjusted.** `powerRating` runs on adjusted scoring margin,
  measured from the schedule a team actually played (`oppStrengthSum`). Raw margin
  is the trap: it puts one-bid-league bullies on the 4 line.
- **S-curve.** `assignRegions` deals each seed line across regions in alternating
  direction, so the strongest 1 seed draws the weakest 2 and the weakest 16.
- **Printed line order.** A region reads top to bottom as 1/16, 8/9, 5/12, 4/13,
  6/11, 3/14, 7/10, 2/15 (`REGION_LINE_ORDER`, passed to `buildSingleElim`).
  This is display only — consecutive pairs still feed the same second-round
  game, so the tree, the pods and the Elite Eight halves are identical to
  `seedOrder(16)`. Verify that if you ever change it.
- **Conference separation.** `separateConferences` hill-climbs on swaps *within a
  seed line* until no two same-conference teams share a Sweet 16 path. Residual
  ~1% of first-round games, where a big conference makes it unavoidable.

Deliberate omission: the real event is 68 with a First Four play-in. This is the
64-team bracket the play-in feeds.

## Layout rules that exist for a reason
- **Bracket columns are fixed-width, not `min-width`.** They used to grow the
  moment a "TBD" slot became a team name, so the whole bracket shifted under the
  cursor as rounds were simulated. `.brow__name` truncates instead.
- **The tournament controls are a sticky dock** (`.tdock`) at the bottom of the
  bracket, with a "My Game" jump. A 64-team bracket is taller than the window and
  the two bottom regions sit far below a top-mounted toolbar.
- **The schedule's day slot has a fixed min-height** (`.daypanel`). It shows a box
  score, an upcoming matchup, or the next game — but always the same height, so
  the panels beneath it don't jump as the cursor moves across the calendar.

## Conventions
- JSX (not TS). Plain CSS in `src/index.css` with CSS custom properties; the
  user's team color flows in as `--team` on the root container for theming.
- Immutable-but-scoped state updates: `_stepDay` clones only the teams/games
  touched that day (keeps 365 teams cheap to re-render).
- Dates are ISO strings (`"2025-11-04"`) — serializable for a future DB.
- Comments explain *why*, matching existing density. Keep it economical.

## Known limitations / possible next steps
- **No persistence** — refresh resets everything. (Postgres/localStorage TBD.)
- **History is team-level only** — `store.history` records each season's finish
  (see "The record book"), but there are still no career leaderboards, no
  all-time player records, and no coach reputation feeding back into prestige
  (`team.prestige` is static data, so winning never makes a program stronger).
- **Recruiting is not a decision** — `recruitClass` hands you a class sized to your
  departures at your prestige level. There is no board, no pitch, no competition.
- Drag-and-drop uses native HTML5 DnD → **mouse only, not touch**.
- Conference tournament formats are the real ones, but they are **fixed
  brackets**: the Horizon League reseeds between rounds in real life and we
  play its bracket straight through. Formats are also static — a league that
  changes its field size in real life has to be edited by hand.
