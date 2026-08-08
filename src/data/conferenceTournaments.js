// How each conference actually runs its tournament — field size and bye
// structure, taken from the 2026 brackets. FACTS, not logic: the engine reads
// this table, but nothing here knows how a bracket is built.
//
// A format is `entries`: how many NEW teams enter at each round, best seeds
// last. Everything else follows from it — the field is the sum, the round count
// falls out of the halving, and a team that enters at round r has r byes.
//
//   [8]        an 8-team bracket, everybody plays the quarterfinals
//   [8, 4, 4]  16 teams: 9-16 open, 5-8 have a bye, 1-4 a double bye
//   [4, 2, 2]  a stepladder: two seeds join at every rung
//
// The pairing inside a round is always the same rule — best remaining seed
// against worst remaining seed — which is what reproduces 5v12/8v9 in a 16-team
// bracket and 8-vs-the-9/12-winner in a stepladder. See `buildStaggered`.
//
// Only entries that ADD UP are legal: every round must have an even number of
// teams in it. `assertFormats` below checks that at import time.

export const CONF_TOURNEY_FORMATS = {
  // ---- Power conferences: everybody (nearly) in, top four double-byed ----
  // 15 of 18 make it; 16-18 stay home. Seeds 1-4 open in the quarterfinals.
  'ACC': [6, 5, 4],
  // All 18. The only six-round conference tournament in the country.
  'Big Ten': [4, 6, 4, 4],
  // All 16: top eight bye the first round, top four double-bye.
  'Big 12': [8, 4, 4],
  'SEC': [8, 4, 4],
  // All 11, one of the cleanest brackets there is — 6/11, 7/10, 8/9, then 4v5.
  'Big East': [6, 5],

  // ---- Multi-bid leagues ----
  // The American is a 10-team stepladder: 1-2 to the semis, 3-4 to the quarters.
  'American Athletic Conference': [4, 2, 2, 2],
  'Mountain West': [8, 4], // all 12, top four to the quarterfinals
  'West Coast Conference': [4, 2, 2, 2, 2], // the WCC ladder: 1 and 2 wait for the semis
  'Atlantic 10': [4, 6, 4], // all 14, top ten bye, top four double-bye
  'Missouri Valley Conference': [6, 5], // Arch Madness — all 11, top five to the quarters
  'Conference USA': [4, 6], // top 10 of 12
  // The Sun Belt stepladder: seven rounds, the longest bracket in Division I.
  'Sun Belt Conference': [4, 2, 2, 2, 2, 2],
  'Mid-American Conference': [8], // top 8 only, straight to the quarterfinals
  'Ivy League': [4], // Ivy Madness — top four, one weekend, that's it
  'Coastal Athletic Association': [2, 7, 4], // all 13: one play-in, then top four double-byed
  'ASUN': [8, 4],
  // The Horizon reseeds between rounds; we keep a fixed bracket, so this is the
  // shape without the reseeding: all 11, top five to the quarterfinals.
  'Horizon League': [6, 5],

  // ---- One-bid leagues ----
  'Big West': [4, 2, 2], // top 8, stepladder: 1-2 to the semis
  'Big Sky': [4, 6], // all 10, top six bye
  'Southern Conference': [4, 6], // all 10, top six bye
  'The Summit League': [2, 7], // all 9, 8v9 play-in
  'America East': [8], // top 8 of 9
  'Patriot League': [4, 6], // all 10, top six bye
  'MAAC': [4, 6], // top 10, top six bye
  'Ohio Valley Conference': [4, 2, 2], // top 8, stepladder
  'Big South': [2, 7], // all 9, 8v9 play-in
  'Southland Conference': [4, 2, 2], // top 8, stepladder
  'Northeast Conference': [8], // top 8
  'MEAC': [8], // all 8
  'SWAC': [4, 2, 6], // all 12, top six to the quarterfinals
  'Western Athletic Conference': [2, 3, 2], // all 7, top two to the semis
};

// The fallback for a conference the table has never heard of (a league gets
// added, gets renamed): the eight-team bracket every conference used to run.
export const DEFAULT_FORMAT = [8];

export const fieldSize = (entries) => entries.reduce((a, b) => a + b, 0);

// A format is only playable if no round is left with an odd number of teams.
// Cheap enough to run at import, and it fails loudly rather than silently
// handing someone a bye they didn't earn.
function assertFormats() {
  for (const [conf, entries] of Object.entries(CONF_TOURNEY_FORMATS)) {
    let alive = 0;
    for (let r = 0; alive > 1 || r < entries.length; r++) {
      alive += entries[r] ?? 0;
      if (alive <= 1) break;
      if (alive % 2 === 1) {
        throw new Error(
          `${conf} tournament format is unplayable: round ${r} seats ${alive} teams`
        );
      }
      alive /= 2;
    }
  }
}
assertFormats();
