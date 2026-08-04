// Lineup chemistry — what a five-man unit is worth beyond the sum of its parts.
//
// Read this before touching the weights. Every term reads a player's attributes
// RELATIVE TO HIS OWN OVERALL, which gives the system the property the whole
// design leans on: because `overall` is a position-weighted dot product of the
// six attributes, the position-weighted sum of one player's edges is exactly
// zero. Every player carries a fixed budget of shape, and every spike is
// provably paid for somewhere else in the same player.
//
// The terms below spend that budget through different curves, so you cannot max
// them all. Swapping a big for a shooter buys spacing with the glass; stacking
// two ball-dominant guards buys creation you can't use. The conflict is
// structural, not a set of tuned penalties, which is why it stayed honest when
// the 41 archetypes were dropped in on top of it.
//
// Chemistry is deliberately TALENT-NEUTRAL: it says nothing about how good the
// five are, only about how they fit. How good they are is already priced by the
// minutes-weighted rating in teamStrength, and where they stand is priced by
// positional fit. Three inputs, no double-counting — keep it that way.
//
// PURE — no React, no store. Facts in, rating points out.

import { ATTRIBUTES, ARCHETYPES_BY_ID } from '../data/archetypes.js';

// Which lineup slot each starter is filling. Bench players aren't assigned a
// position — a bench unit is fluid, so reserves are never out of position, and
// they sit outside the chemistry calculation entirely (see FIT_MINUTES_SHARE).
export function slotPositions(teamState) {
  const out = {};
  teamState.rotation.starters.forEach((s) => {
    if (s.id) out[s.id] = s.pos;
  });
  return out;
}

// Rating points that read as one full "unit" of edge over your teammates. Most
// starters land inside ±1 unit of their lineup's level; a true specialist is 1.5.
const UNIT = 12;

// Missing a piece hurts more than having extra of it helps — a lineup with no
// rim protector concedes layups every possession, while a second shot-blocker is
// mostly redundant. tanh saturates the upside; `k` steepens the downside.
const asym = (x, k = 1.7) => (x >= 0 ? Math.tanh(x) : k * Math.tanh(x));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// Term weights, in rating points at ±1 unit of edge. Tuned so the league-wide
// spread of total chemistry is ~0.5 rating (about a point of margin) with the
// best and worst constructed fives ~±1.8 — bigger than positional fit, small
// enough that it never rescues a team that has no business winning.
const SPACE_W = 2.4; // floor spacing, on its own
const INSIDE_W = 3.0; // how much your interior scoring is worth AT that spacing
const CREATE_W = 0.9; // shot creation off the dribble
const CLASH_W = 0.9; // usage that has nowhere to go
const RIM_W = 0.9; // rim protection
const CONT_W = 1.3; // perimeter containment
const GLASS_W = 1.0; // the defensive glass

// A lineup has one ball. `usage` above 1.0 is appetite for it, and the league's
// default fives carry 0.30 of it in total (sd 0.18, p99 0.75), so a unit only
// starts wasting possessions once it stacks ball-dominant archetypes well past
// what happens by accident. Measured over every AI lineup in the league —
// re-derive with `node scripts/lineupfit.mjs`.
const CLASH_BUDGET = 0.6;

// The interior-scoring edge a normal starting five's best post threat carries,
// in UNITs. Netted out so the spacing interaction reads "leans on the paint
// MORE than usual" instead of "has a paint scorer at all", which every five
// does. Measured over the league — see scripts/lineupfit.mjs.
const PAINT_BASE = 0.79;

// Re-centers the whole calculation on the league's default lineups so an
// averagely-constructed five scores exactly 0 and the season calibration is
// untouched. Not a fudge factor: the raw terms have no reason to average zero
// (a balanced PG-through-C five sits slightly above the mean on rebounding, for
// instance), and this is the measured offset. Re-derive it with
// `node scripts/lineupfit.mjs` after changing any weight above.
const FIT_CENTER = -0.017;

// Starters play 150 of 200 minutes. The bench is scored as neutral-fit rather
// than pretending we know which five of ten share the floor in garbage time.
const FIT_MINUTES_SHARE = 0.75;

// Each player's attribute edges over HIS OWN overall, in UNITs — pure shape,
// with his talent level divided out.
//
// Centering per player rather than per lineup is load-bearing twice over:
//
//  - It makes the zero-budget property hold for every player individually. The
//    position-weighted sum of one player's edges is `overall - overall`, exactly
//    zero, so a spike is provably paid for elsewhere in the SAME player. That is
//    what makes the terms below conflict rather than stack.
//  - It closes two exploits. Centering on the lineup's mean meant a five of
//    weaker players inflated every relative term at once, so chemistry paid you
//    to bench your best player; and centering on effective (post-slot) overalls
//    meant a badly aligned lineup lowered its own baseline, so chemistry paid
//    you to misalign.
//
// Chemistry therefore answers only "which five shapes are on the floor".
// Talent is already priced by the minutes-weighted rating, and where they stand
// is priced by positional fit — three inputs, no double-counting.
function unitProfile(teamState) {
  const byId = Object.fromEntries(teamState.players.map((p) => [p.id, p]));
  const five = teamState.rotation.starters
    .map((s) => ({ p: byId[s.id], pos: s.pos }))
    .filter((x) => x.p);
  if (five.length < 5) return null;

  const rel = five.map(({ p }) => {
    const o = {};
    ATTRIBUTES.forEach((a) => (o[a] = (p.attrs[a] - p.overall) / UNIT));
    return o;
  });
  const usage = five.map(({ p }) => ARCHETYPES_BY_ID[p.archetype]?.usage ?? 1);
  return { five, rel, usage };
}

// The individual chemistry terms, in rating points. Exported for the UI, which
// grades them rather than printing the numbers — the six attributes stay hidden,
// so this readout is the only feedback a player gets on how a five fits.
export function lineupTerms(teamState) {
  const prof = unitProfile(teamState);
  if (!prof) return null;
  const { rel, usage } = prof;
  const col = (a) => rel.map((r) => r[a]);
  const desc = (a) => col(a).sort((x, y) => y - x);

  // Spacing. Not the sum of jump shots — the count of players a defense has to
  // honor. Logistic per player (a player whose shooting merely matches his own
  // rating counts as half a threat), then a log so the 4th shooter adds little
  // while the 1st is worth everything.
  // Deliberately asymmetric: five shooters gain less than five non-shooters lose.
  const gravity = col('outside').map((x) => 1 / (1 + Math.exp(-2 * x)));
  const G = gravity.reduce((a, b) => a + b, 0); // 0..5, 2.5 for a flat unit
  const spacing = SPACE_W * (Math.log(1 + G) - Math.log(3.5));

  // Interior scoring is worth what the spacing lets it be worth. Three
  // non-shooters and the defense sits in the paint, so your best post scorer
  // stops converting; surround that same player with shooters and it all comes
  // back. This is why your three best players can be a worse five than two of
  // them plus a shooter.
  //
  // Keyed on your BEST interior scorer, not the unit's average: the cost of bad
  // spacing is a specific player being stranded, and it's a product of two
  // deviations, so an average taken over five would round it away to nothing.
  // PAINT_BASE nets out the post threat a normal five carries, so this measures
  // an offense that genuinely leans inside — otherwise the term degenerates into
  // a scaled copy of spacing and stops being an interaction at all.
  const spacingMult = Math.min(1.5, Math.max(0.35, 0.3 + 0.28 * G));
  const paintThreat = Math.max(...col('inside')) - PAINT_BASE;
  const interior = INSIDE_W * paintThreat * (spacingMult - 1);

  // Creation. One primary handler covers a lineup; the second matters much less
  // and the third not at all. A five with nobody who can make a shot out of
  // nothing gets stuck late in the clock, hence the steep downside.
  const ply = desc('playmaking');
  const creation = CREATE_W * (asym(ply[0]) + 0.3 * asym(ply[1]));

  // ...but appetite for the ball isn't the same as being able to create with it.
  // Two ball-dominant scorers don't stack, they take turns, and the possessions
  // one of them wanted simply evaporate. Penalty only — there is no bonus for
  // having a roster full of players who defer.
  const appetite = usage.reduce((s, u) => s + Math.max(0, u - 1), 0);
  const clash = -CLASH_W * Math.max(0, appetite - CLASH_BUDGET) ** 1.3;

  // Rim protection. One elite shot-blocker erases a lot of mistakes behind him,
  // which is why the best defender carries the term and the second is a rounding
  // error. Having nobody is the expensive case.
  const idef = desc('interiorD');
  const rim = RIM_W * (asym(idef[0]) + 0.3 * asym(idef[1]));

  // Perimeter containment is the mirror image: offenses hunt the WEAKEST
  // defender on the floor, so one hole leaks more than a stopper plugs.
  const pdef = col('perimeterD');
  const containment = CONT_W * (0.45 * mean(pdef) + 0.55 * asym(Math.min(...pdef), 1.4));

  // The glass. Linear and unglamorous — this is the bill small-ball pays, and it
  // comes due automatically because a shooter's rebounding edge is negative by
  // construction.
  const glass = GLASS_W * mean(col('rebounding'));

  return { spacing, interior, creation, clash, rim, containment, glass };
}

// Total chemistry adjustment in rating points, centered so a league-average
// construction is worth exactly 0. This is what teamStrength adds.
export function lineupFit(teamState) {
  const t = lineupTerms(teamState);
  if (!t) return 0;
  const raw =
    t.spacing + t.interior + t.creation + t.clash + t.rim + t.containment + t.glass;
  return (raw - FIT_CENTER) * FIT_MINUTES_SHARE;
}

// Display metadata for the lineup report, in the order the UI shows it.
//
// `base` and `scale` are each term's league-wide mean and standard deviation
// over default lineups, so the UI can grade a term against ITS OWN distribution.
// They are not interchangeable: Shot Creation averages +0.49 and Perimeter D
// averages -0.46, so a single shared scale would tell every user in the game
// that their creation is elite and their perimeter defense is a disaster.
// Re-derive with `node scripts/lineupfit.mjs` after changing any weight.
export const FIT_TERMS = [
  { key: 'spacing', label: 'Spacing', base: -0.233, scale: 0.529,
    hint: 'How many shooters a defense has to guard out to the arc.' },
  { key: 'interior', label: 'Interior Scoring', base: -0.061, scale: 0.245,
    hint: 'What your inside scoring is worth against the defense your spacing invites.' },
  { key: 'creation', label: 'Shot Creation', base: 0.485, scale: 0.366,
    hint: 'Whether anyone on the floor can make a shot out of nothing.' },
  // Penalty-only and zero for most lineups, so it is graded on an absolute
  // scale — a measured sd of 0.017 would call a rounding error a catastrophe.
  { key: 'clash', label: 'Ball Sharing', base: 0, scale: 0.2,
    hint: 'Ball-dominant players stacked together take turns instead of stacking.' },
  { key: 'rim', label: 'Rim Protection', base: 0.338, scale: 0.388,
    hint: 'One real shot-blocker covers for the four in front of him.' },
  { key: 'containment', label: 'Perimeter D', base: -0.456, scale: 0.268,
    hint: 'Offenses attack the weakest defender on the floor, not the average one.' },
  { key: 'glass', label: 'Rebounding', base: -0.087, scale: 0.203,
    hint: 'The bill small-ball pays.' },
];

const FIT_TERMS_BY_KEY = Object.fromEntries(FIT_TERMS.map((t) => [t.key, t]));

// Word grade for a term, so the report reads as a scouting note rather than a
// spreadsheet. The six attributes are hidden on purpose; this shows the
// CONSEQUENCE of a lineup without handing back the inputs that produced it.
export function fitGrade(key, value) {
  const t = FIT_TERMS_BY_KEY[key];
  const z = (value - (t?.base ?? 0)) / (t?.scale || 1);
  if (z >= 1.0) return { word: 'Elite', tone: 'great', z };
  if (z >= 0.35) return { word: 'Strong', tone: 'good', z };
  if (z > -0.35) return { word: 'Fine', tone: 'flat', z };
  if (z > -1.0) return { word: 'Thin', tone: 'bad', z };
  return { word: 'Poor', tone: 'awful', z };
}
