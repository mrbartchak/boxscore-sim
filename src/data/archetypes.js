// Player attributes and the archetype catalog.
//
// An archetype is a SHAPE, not a level. `shape` holds offsets in rating points
// applied around whatever overall the roster ladder handed the player, so a 62
// Rim Protector and an 88 Rim Protector have the same silhouette at different
// sizes. Generation re-centers afterwards, which means an archetype makes a
// player lopsided without making him better or worse — every spike is paid for
// somewhere else. That trade is the whole point: it's what will let a lineup be
// more (or less) than the sum of its ratings.
//
// FACTS ONLY — no logic here. Selection and generation live in engine/players.js.

export const ATTRIBUTES = [
  'inside',
  'outside',
  'playmaking',
  'perimeterD',
  'interiorD',
  'rebounding',
];

export const ATTR_LABEL = {
  inside: 'Inside Scoring',
  outside: 'Outside Shooting',
  playmaking: 'Playmaking',
  perimeterD: 'Perimeter Defense',
  interiorD: 'Interior Defense',
  rebounding: 'Rebounding',
};

export const ATTR_SHORT = {
  inside: 'INS',
  outside: 'OUT',
  playmaking: 'PLY',
  perimeterD: 'PER',
  interiorD: 'INT',
  rebounding: 'REB',
};

// How much each attribute counts toward a player's overall AT HIS POSITION.
// Weights sum to 1 per position, so overall stays on the familiar 35-99 scale
// and every existing tier/colour threshold keeps working untouched. A center's
// rebounding is worth double a point guard's; a point guard's playmaking is
// worth four times a center's.
export const POSITION_WEIGHTS = {
  PG: { inside: 0.14, outside: 0.22, playmaking: 0.26, perimeterD: 0.18, interiorD: 0.06, rebounding: 0.14 },
  SG: { inside: 0.18, outside: 0.26, playmaking: 0.14, perimeterD: 0.2, interiorD: 0.07, rebounding: 0.15 },
  SF: { inside: 0.19, outside: 0.21, playmaking: 0.13, perimeterD: 0.19, interiorD: 0.11, rebounding: 0.17 },
  PF: { inside: 0.21, outside: 0.13, playmaking: 0.08, perimeterD: 0.12, interiorD: 0.21, rebounding: 0.25 },
  C: { inside: 0.22, outside: 0.08, playmaking: 0.07, perimeterD: 0.08, interiorD: 0.28, rebounding: 0.27 },
};

// `usage` is shot-taking appetite, feeding the box-score distribution: a
// Microwave Scorer hunts his own offense, a Glue Guy takes what comes to him.
// `weight` is relative frequency within the pool a player is eligible for.
// `minOverall` / `maxOverall` gate an archetype to a talent band.
export const ARCHETYPES = [
  // ---------------------------------------------------------------- lead guards
  {
    id: 'floor-general',
    label: 'Floor General',
    blurb: 'Runs the show. Sees the pass a beat before it exists.',
    positions: ['PG'],
    weight: 1.4,
    usage: 0.85,
    shape: { playmaking: 16, outside: 2, perimeterD: 1, inside: -5, interiorD: -9, rebounding: -7 },
  },
  {
    id: 'scoring-point',
    label: 'Scoring Point',
    blurb: 'A point guard who looks for his own shot first.',
    positions: ['PG'],
    weight: 1.2,
    usage: 1.18,
    shape: { outside: 10, inside: 6, playmaking: 2, perimeterD: -3, interiorD: -9, rebounding: -8 },
  },
  {
    id: 'pass-first',
    label: 'Pass-First Point',
    blurb: 'Would rather have the assist. Defenses sag off him.',
    positions: ['PG'],
    weight: 0.9,
    usage: 0.6,
    shape: { playmaking: 18, perimeterD: 2, outside: -8, inside: -6, interiorD: -8, rebounding: -5 },
  },
  {
    id: 'on-ball-pest',
    label: 'On-Ball Pest',
    blurb: 'Picks you up full court and never stops talking.',
    positions: ['PG', 'SG'],
    weight: 0.9,
    usage: 0.7,
    shape: { perimeterD: 17, playmaking: 4, inside: -6, outside: -5, interiorD: -6, rebounding: -6 },
  },
  {
    id: 'downhill-slasher',
    label: 'Downhill Guard',
    blurb: 'Lives in the paint off the bounce. Doesn\'t settle.',
    positions: ['PG', 'SG'],
    weight: 1.0,
    usage: 1.15,
    shape: { inside: 13, playmaking: 5, outside: -9, interiorD: -6, rebounding: -5 },
  },
  {
    id: 'sniper',
    label: 'Sniper',
    blurb: 'Range well beyond the arc. Everything else is optional.',
    positions: ['PG', 'SG'],
    weight: 1.0,
    usage: 1.14,
    shape: { outside: 18, inside: -6, playmaking: -3, interiorD: -10, rebounding: -8 },
  },
  {
    id: 'combo-guard',
    label: 'Combo Guard',
    blurb: 'Can run the point or play off the ball. Fits anywhere.',
    positions: ['PG', 'SG'],
    weight: 1.3,
    usage: 1.1,
    shape: { outside: 7, playmaking: 7, inside: 3, interiorD: -8, rebounding: -6 },
  },

  // ------------------------------------------------------------------ off guards
  {
    id: 'sharpshooter',
    label: 'Sharpshooter',
    blurb: 'Coming off screens all night. Never needs a dribble.',
    positions: ['SG', 'SF'],
    weight: 1.2,
    usage: 1.14,
    shape: { outside: 19, playmaking: -5, inside: -4, interiorD: -9, rebounding: -7 },
  },
  {
    id: 'three-and-d',
    label: '3&D Wing',
    blurb: 'Guards the other team\'s best perimeter player and spaces the floor.',
    positions: ['SG', 'SF'],
    weight: 1.3,
    usage: 0.85,
    shape: { outside: 12, perimeterD: 12, playmaking: -7, inside: -5, interiorD: -3, rebounding: -3 },
  },
  {
    id: 'slasher',
    label: 'Slasher',
    blurb: 'Attacks closeouts relentlessly. Dares you to help.',
    positions: ['SG', 'SF'],
    weight: 1.1,
    usage: 1.2,
    shape: { inside: 14, perimeterD: 3, outside: -8, playmaking: -2, interiorD: -4 },
  },
  {
    id: 'microwave',
    label: 'Microwave Scorer',
    blurb: 'Instant offense off the bench. Heats up in seconds, defends none.',
    positions: ['SG', 'SF'],
    weight: 0.9,
    usage: 1.28,
    shape: { outside: 11, inside: 9, perimeterD: -8, interiorD: -8, playmaking: -5, rebounding: -4 },
  },
  {
    id: 'two-way-guard',
    label: 'Two-Way Guard',
    blurb: 'No glaring hole on either end.',
    positions: ['SG'],
    weight: 1.1,
    usage: 1.0,
    shape: { perimeterD: 11, outside: 5, inside: 4, playmaking: 2, interiorD: -4, rebounding: -5 },
  },
  {
    id: 'spot-up',
    label: 'Spot-Up Shooter',
    blurb: 'Stands in the corner and punishes help defense.',
    positions: ['SG', 'SF'],
    weight: 1.0,
    usage: 0.8,
    shape: { outside: 15, playmaking: -8, inside: -5, perimeterD: -2, interiorD: -6, rebounding: -4 },
  },
  {
    id: 'connector',
    label: 'Connector',
    blurb: 'Makes the extra pass, hits the open one, guards his man.',
    positions: ['SG', 'SF'],
    weight: 1.0,
    usage: 0.75,
    shape: { playmaking: 8, outside: 6, perimeterD: 5, inside: -2, interiorD: -5 },
  },

  // ----------------------------------------------------------------- small forwards
  {
    id: 'point-forward',
    label: 'Point Forward',
    blurb: 'Initiates the offense from the wing. A matchup problem.',
    positions: ['SF', 'PF'],
    weight: 0.9,
    usage: 1.1,
    shape: { playmaking: 15, inside: 5, rebounding: 4, outside: -2, perimeterD: -4, interiorD: -5 },
  },
  {
    id: 'wing-stopper',
    label: 'Wing Stopper',
    blurb: 'Takes the toughest assignment every night. Offense is an afterthought.',
    positions: ['SF'],
    weight: 1.0,
    usage: 0.65,
    shape: { perimeterD: 18, interiorD: 4, rebounding: 2, outside: -8, inside: -7, playmaking: -6 },
  },
  {
    id: 'do-it-all',
    label: 'Do-It-All Wing',
    blurb: 'Fills every column in the box score. No weakness to attack.',
    positions: ['SF'],
    weight: 0.9,
    usage: 1.05,
    shape: { inside: 4, outside: 4, playmaking: 4, perimeterD: 4, interiorD: 2, rebounding: 3 },
  },
  {
    id: 'corner-specialist',
    label: 'Corner Specialist',
    blurb: 'One job, done exceptionally well.',
    positions: ['SF'],
    weight: 0.7,
    usage: 0.8,
    shape: { outside: 20, inside: -8, playmaking: -8, perimeterD: -6, interiorD: -8, rebounding: -7 },
  },
  {
    id: 'small-ball-four',
    label: 'Small-Ball Four',
    blurb: 'Undersized inside, but he battles and switches everything.',
    positions: ['SF', 'PF'],
    weight: 1.0,
    usage: 0.95,
    shape: { rebounding: 11, inside: 7, interiorD: 6, outside: -4, playmaking: -6, perimeterD: -2 },
  },
  {
    id: 'athletic-finisher',
    label: 'Athletic Finisher',
    blurb: 'Plays above the rim. Ask him to shoot and everyone holds their breath.',
    positions: ['SF', 'PF'],
    weight: 1.0,
    usage: 1.1,
    shape: { inside: 13, rebounding: 5, perimeterD: 3, outside: -12, playmaking: -8 },
  },

  // ---------------------------------------------------------------- power forwards
  {
    id: 'stretch-four',
    label: 'Stretch Four',
    blurb: 'Drags the other team\'s big man twenty-five feet from the rim.',
    positions: ['PF'],
    weight: 1.2,
    usage: 1.05,
    shape: { outside: 18, playmaking: 1, inside: -3, interiorD: -7, rebounding: -6 },
  },
  {
    id: 'glass-cleaner',
    label: 'Glass Cleaner',
    blurb: 'Owns the offensive boards. Second chances all night.',
    positions: ['PF', 'C'],
    weight: 1.2,
    usage: 0.75,
    shape: { rebounding: 18, interiorD: 5, inside: 4, outside: -14, playmaking: -9 },
  },
  {
    id: 'face-up-four',
    label: 'Face-Up Four',
    blurb: 'Catches at the elbow and beats bigs off the bounce.',
    positions: ['PF'],
    weight: 1.0,
    usage: 1.15,
    shape: { inside: 10, outside: 8, playmaking: 2, rebounding: -5, interiorD: -6 },
  },
  {
    id: 'energy-big',
    label: 'Energy Big',
    blurb: 'Fifteen hard minutes of screens, rolls and rebounds.',
    positions: ['PF', 'C'],
    weight: 1.2,
    usage: 0.7,
    shape: { rebounding: 12, interiorD: 8, inside: 5, outside: -14, playmaking: -10 },
  },
  {
    id: 'enforcer',
    label: 'Enforcer',
    blurb: 'Nobody gets a comfortable look in the paint.',
    positions: ['PF', 'C'],
    weight: 1.0,
    usage: 0.7,
    shape: { interiorD: 13, rebounding: 11, perimeterD: 2, inside: -2, outside: -13, playmaking: -9 },
  },
  {
    id: 'playmaking-big',
    label: 'Playmaking Big',
    blurb: 'The offense runs through him at the elbow.',
    positions: ['PF', 'C'],
    weight: 0.8,
    usage: 1.0,
    shape: { playmaking: 14, inside: 5, outside: 4, perimeterD: -3, interiorD: -4, rebounding: -3 },
  },
  {
    id: 'pick-and-pop',
    label: 'Pick-and-Pop Big',
    blurb: 'Sets the screen, steps back, buries it.',
    positions: ['PF', 'C'],
    weight: 1.0,
    usage: 1.05,
    shape: { outside: 14, inside: 4, playmaking: 2, perimeterD: -4, interiorD: -6, rebounding: -7 },
  },

  // ---------------------------------------------------------------------- centers
  {
    id: 'rim-protector',
    label: 'Rim Protector',
    blurb: 'Erases everything at the basket. Guards live in fear.',
    positions: ['C', 'PF'],
    weight: 1.3,
    usage: 0.7,
    shape: { interiorD: 18, rebounding: 9, inside: -1, outside: -16, playmaking: -10 },
  },
  {
    id: 'post-scorer',
    label: 'Back-to-the-Basket',
    blurb: 'Old-school post game. Throw it in and get out of the way.',
    positions: ['C', 'PF'],
    weight: 1.1,
    usage: 1.18,
    shape: { inside: 16, rebounding: 6, outside: -10, playmaking: -6, perimeterD: -5 },
  },
  {
    id: 'stretch-five',
    label: 'Stretch Five',
    blurb: 'A seven-footer who lives at the arc. Nightmare to match up with.',
    positions: ['C'],
    weight: 0.8,
    usage: 1.1,
    shape: { outside: 19, playmaking: 2, inside: -2, interiorD: -5, rebounding: -6 },
  },
  {
    id: 'rim-runner',
    label: 'Rim Runner',
    blurb: 'Sprints the floor and catches everything above the square.',
    positions: ['C'],
    weight: 1.0,
    usage: 0.9,
    shape: { inside: 13, interiorD: 6, rebounding: 6, outside: -16, playmaking: -11 },
  },
  {
    id: 'anchor',
    label: 'Defensive Anchor',
    blurb: 'The entire defensive scheme is built around him.',
    positions: ['C'],
    weight: 1.1,
    usage: 0.65,
    shape: { interiorD: 15, rebounding: 12, perimeterD: 3, inside: -4, outside: -15, playmaking: -8 },
  },
  {
    id: 'skilled-big',
    label: 'Skilled Big',
    blurb: 'Passes, shoots, scores inside. A modern five.',
    positions: ['C', 'PF'],
    weight: 0.9,
    usage: 1.1,
    shape: { playmaking: 6, inside: 6, outside: 5, interiorD: 3, rebounding: 3, perimeterD: -2 },
  },

  // ------------------------------------------------------------ any position
  {
    id: 'glue-guy',
    label: 'Glue Guy',
    blurb: 'Does the little things. Coaches love him, box scores ignore him.',
    positions: ['PG', 'SG', 'SF', 'PF', 'C'],
    weight: 0.5,
    usage: 0.6,
    shape: { perimeterD: 6, rebounding: 5, playmaking: 4, interiorD: 3, inside: -3, outside: -2 },
  },
  {
    id: 'swiss-army',
    label: 'Swiss Army Knife',
    blurb: 'No spike, no hole. Plug him in anywhere.',
    positions: ['PG', 'SG', 'SF', 'PF', 'C'],
    weight: 0.45,
    usage: 0.9,
    shape: { inside: 2, outside: 2, playmaking: 2, perimeterD: 2, interiorD: 2, rebounding: 2 },
  },
  {
    id: 'defensive-specialist',
    label: 'Defensive Specialist',
    blurb: 'On the floor at the end of close games for exactly one reason.',
    positions: ['PG', 'SG', 'SF', 'PF', 'C'],
    weight: 0.4,
    usage: 0.5,
    shape: { perimeterD: 12, interiorD: 6, rebounding: 2, outside: -10, inside: -9, playmaking: -4 },
  },
  {
    id: 'raw-project',
    label: 'Raw Project',
    blurb: 'All tools, no polish. Somebody\'s going to be very patient with him.',
    positions: ['PG', 'SG', 'SF', 'PF', 'C'],
    weight: 0.5,
    maxOverall: 76,
    usage: 0.8,
    shape: { inside: 8, rebounding: 6, perimeterD: 4, outside: -14, playmaking: -12 },
  },

  // ----------------------------------------------- elite only (talent-gated)
  {
    id: 'bucket-getter',
    label: 'Bucket Getter',
    blurb: 'Gets his against anybody, any coverage, any night.',
    positions: ['PG', 'SG', 'SF'],
    weight: 3.2,
    minOverall: 84,
    usage: 1.32,
    shape: { inside: 10, outside: 10, playmaking: 3, perimeterD: -4, interiorD: -7, rebounding: -4 },
  },
  {
    id: 'franchise-point',
    label: 'Franchise Point Guard',
    blurb: 'Controls tempo, score and scoreboard. Everything runs through him.',
    positions: ['PG'],
    weight: 3.2,
    minOverall: 86,
    usage: 1.22,
    shape: { playmaking: 14, outside: 9, inside: 6, perimeterD: 3, interiorD: -8, rebounding: -5 },
  },
  {
    id: 'two-way-star',
    label: 'Two-Way Star',
    blurb: 'Twenty a night and he takes your best scorer out of the game.',
    positions: ['SG', 'SF', 'PF'],
    weight: 3.2,
    minOverall: 86,
    usage: 1.15,
    shape: { perimeterD: 10, inside: 7, outside: 7, rebounding: 4, playmaking: 4, interiorD: 3 },
  },
  {
    id: 'unicorn',
    label: 'Unicorn',
    blurb: 'Shoots like a guard, protects the rim like a five. Shouldn\'t exist.',
    positions: ['PF', 'C'],
    weight: 3.2,
    minOverall: 88,
    usage: 1.2,
    shape: { outside: 11, interiorD: 10, inside: 8, playmaking: 6, rebounding: 6, perimeterD: 2 },
  },
];

export const ARCHETYPES_BY_ID = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a]));
