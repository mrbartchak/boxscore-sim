// Calibration harness: sims many full seasons headless and compares the
// resulting bracket to the historical record in src/data/marchmadness.js.
//
//   node scripts/calibrate.mjs [seasons]
//
// Re-run this after touching roster generation or any simulation weight. The
// numbers that matter are the R64 win rates by seed matchup, the champion and
// Final Four distributions, and the roster-shape report (a blue-blood's bench
// should NOT rate like a good high-major's starters).

import { useGame } from '../src/store/useGame.js';
import { TEAMS } from '../src/data/teams.js';
import { generateRoster, overallTier } from '../src/engine/players.js';
import { teamStrength, defaultLineup, MARGIN_PER_RATING } from '../src/engine/simulation.js';
import {
  R64_FAVORITE_WIN_PCT,
  R64_TYPICAL_SPREAD,
  CHAMPION_SHARE_BY_SEED,
  FINAL_FOUR_SHARE_BY_SEED,
} from '../src/data/marchmadness.js';

const SEASONS = Number(process.argv[2] || 40);
const g = () => useGame.getState();
const pct = (x) => (x * 100).toFixed(1).padStart(5) + '%';
const sign = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);

// ---------------------------------------------------------------- roster shape
function rosterReport() {
  const sample = (prestige, n = 300) => {
    const team = TEAMS.find((t) => Math.abs(t.prestige - prestige) <= 1) || TEAMS[0];
    const starters = [];
    const benches = [];
    const tops = [];
    const tiers = {};
    for (let i = 0; i < n; i++) {
      const players = generateRoster(team);
      const rot = defaultLineup(players);
      const byId = Object.fromEntries(players.map((p) => [p.id, p]));
      const s = rot.starters.map((x) => byId[x.id].overall);
      const b = rot.bench.map((id) => byId[id].overall);
      starters.push(s.reduce((a, x) => a + x, 0) / 5);
      benches.push(b.reduce((a, x) => a + x, 0) / b.length);
      const best = Math.max(...players.map((p) => p.overall));
      tops.push(best);
      const t = overallTier(best);
      tiers[t] = (tiers[t] || 0) + 1;
    }
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const sd = (a) => Math.sqrt(avg(a.map((x) => (x - avg(a)) ** 2)));
    return {
      team: team.name,
      prestige: team.prestige,
      starters: avg(starters),
      bench: avg(benches),
      bestAvg: avg(tops),
      bestMax: Math.max(...tops),
      teamSd: sd(starters),
      tiers,
    };
  };

  console.log('\n=== ROSTER SHAPE (300 rosters each) ===');
  console.log('team              prest  starters  bench   gap   best  bestSD  topTier mix');
  [95, 85, 80, 70, 60, 50, 40].forEach((p) => {
    const r = sample(p);
    const mix = Object.entries(r.tiers)
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `${t} ${Math.round((c / 300) * 100)}%`)
      .join(' ');
    console.log(
      `${r.team.padEnd(17)} ${String(r.prestige).padStart(4)}  ` +
        `${r.starters.toFixed(1).padStart(7)} ${r.bench.toFixed(1).padStart(6)} ` +
        `${(r.starters - r.bench).toFixed(1).padStart(5)} ` +
        `${r.bestAvg.toFixed(1).padStart(6)} ${r.teamSd.toFixed(1).padStart(6)}   ${mix}`
    );
  });

  // The headline complaint: does an elite bench out-rate a good team's starters?
  const duke = TEAMS.find((t) => t.name === 'Duke');
  const bama = TEAMS.find((t) => t.name === 'Alabama');
  let benchBeatsStarters = 0;
  const N = 500;
  for (let i = 0; i < N; i++) {
    const dp = generateRoster(duke);
    const dRot = defaultLineup(dp);
    const dById = Object.fromEntries(dp.map((p) => [p.id, p]));
    const dBench = dRot.bench.map((id) => dById[id].overall);
    const ap = generateRoster(bama);
    const aRot = defaultLineup(ap);
    const aById = Object.fromEntries(ap.map((p) => [p.id, p]));
    const aStart = aRot.starters.map((x) => aById[x.id].overall);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    if (avg(dBench) >= avg(aStart)) benchBeatsStarters++;
  }
  console.log(
    `\nDuke bench >= Alabama starters: ${pct(benchBeatsStarters / N)} of matchups ` +
      `(was near-certain before the talent ladder)`
  );

  // Rare-talent audit across the whole league.
  const tierCount = {};
  let elitesAtSmallSchools = 0;
  for (let s = 0; s < 20; s++) {
    TEAMS.forEach((t) => {
      generateRoster(t).forEach((p) => {
        const tier = overallTier(p.overall);
        tierCount[tier] = (tierCount[tier] || 0) + 1;
        if (p.overall >= 90 && t.prestige < 65) elitesAtSmallSchools++;
      });
    });
  }
  console.log('\nLeague talent per season (avg over 20 seasons):');
  Object.entries(tierCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, c]) => console.log(`  ${t.padEnd(9)} ${(c / 20).toFixed(1)} players`));
  console.log(
    `  diamond+ at sub-65-prestige programs: ${(elitesAtSmallSchools / 20).toFixed(2)} per season`
  );
}

// ------------------------------------------------------------------ tournament
function tournamentReport() {
  const r64 = {}; // "1v16" -> {fav, total}
  const spreadGap = {}; // "1v16" -> [rating gaps]
  const champBySeed = {};
  const ffBySeed = {};
  const s16BySeed = {};
  const eliteEightBySeed = {};
  let userChampSeeds = [];

  for (let season = 0; season < SEASONS; season++) {
    g().selectTeam(TEAMS[0].id);
    let guard = 0;
    while (g().phase !== 'DONE' && guard++ < 400) g()._stepDay();
    const st = g();
    const nat = Object.values(st.games).filter((x) => x.phase === 'NATIONAL');

    // Seed of each team in this bracket (regional seed 1-16).
    const seedOf = {};
    nat.forEach((x) => {
      if (x.round === 0) {
        seedOf[x.homeId] = x.seedHome;
        seedOf[x.awayId] = x.seedAway;
      }
    });

    nat.forEach((x) => {
      if (x.round !== 0 || !x.played) return;
      const hi = Math.min(x.seedHome, x.seedAway);
      const lo = Math.max(x.seedHome, x.seedAway);
      const key = `${hi}v${lo}`;
      const rec = (r64[key] ||= { fav: 0, total: 0 });
      rec.total++;
      const favId = x.seedHome === hi ? x.homeId : x.awayId;
      if (x.result.winnerId === favId) rec.fav++;
      // Rating gap between the two, to check against real point spreads.
      const gap =
        teamStrength(st.teamStates[favId]) -
        teamStrength(st.teamStates[x.seedHome === hi ? x.awayId : x.homeId]);
      (spreadGap[key] ||= []).push(gap);
    });

    const bump = (obj, id) => {
      const s = seedOf[id];
      if (s) obj[s] = (obj[s] || 0) + 1;
    };
    nat.forEach((x) => {
      if (!x.played) return;
      if (x.round === 1) bump(s16BySeed, x.result.winnerId); // won R32 -> Sweet 16
      if (x.round === 2) bump(eliteEightBySeed, x.result.winnerId);
      if (x.round === 3) bump(ffBySeed, x.result.winnerId); // won Elite 8 -> Final Four
      if (x.round === 5) bump(champBySeed, x.result.winnerId);
    });
    userChampSeeds.push(seedOf[st.nationalChampionId]);
  }

  console.log(`\n=== FIRST ROUND (${SEASONS} seasons, ${SEASONS * 4} games per line) ===`);
  console.log('matchup   sim     historical   diff  |  sim spread  historical');
  Object.keys(R64_FAVORITE_WIN_PCT).forEach((key) => {
    const rec = r64[key];
    if (!rec) return;
    const sim = rec.fav / rec.total;
    const hist = R64_FAVORITE_WIN_PCT[key];
    const gaps = spreadGap[key];
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const simSpread = avgGap * MARGIN_PER_RATING;
    console.log(
      `${key.padEnd(8)} ${pct(sim)}  ${pct(hist)}     ${sign((sim - hist) * 100).padStart(5)}  |  ` +
        `${simSpread.toFixed(1).padStart(9)}  ${String(R64_TYPICAL_SPREAD[key]).padStart(9)}`
    );
  });

  const dist = (label, obj, hist, total) => {
    console.log(`\n=== ${label} ===`);
    console.log('seed   sim    historical');
    const seeds = [...new Set([...Object.keys(obj), ...Object.keys(hist)])]
      .map(Number)
      .sort((a, b) => a - b);
    seeds.forEach((s) => {
      const sim = (obj[s] || 0) / total;
      const h = hist[s] || 0;
      console.log(`${String(s).padStart(3)}  ${pct(sim)}   ${pct(h)}`);
    });
  };
  dist('NATIONAL CHAMPIONS BY SEED', champBySeed, CHAMPION_SHARE_BY_SEED, SEASONS);
  dist('FINAL FOUR BY SEED', ffBySeed, FINAL_FOUR_SHARE_BY_SEED, SEASONS * 4);

  const worstChamp = Math.max(...userChampSeeds.filter(Boolean));
  const deepSeeds = Object.keys(ffBySeed).map(Number);
  console.log(
    `\nWorst seed to win it all: ${worstChamp} (historical: 8) · ` +
      `worst Final Four seed: ${Math.max(...deepSeeds)} (historical: 11)`
  );
  const s16low = Object.keys(s16BySeed).map(Number).filter((s) => s >= 13);
  console.log(
    `Sweet 16 runs by 13+ seeds: ${s16low.map((s) => `${s}:${s16BySeed[s]}`).join(' ') || 'none'}` +
      ` over ${SEASONS} seasons (historical: rare but real)`
  );
}

// --------------------------------------------------------------------- dynasty
// The offseason is a second, independent path into roster state: instead of
// generating a league it ages one. If the two disagree, the game drifts — a few
// dozen seasons in, the league is either all 90s or all 50s, and every seed line
// converges because team strength SPREAD is what MARGIN_PER_RATING turns into
// point spreads. So: build a league, run a decade of carry-over seasons, and
// check the shape against the freshly generated one it started as.
function dynastyReport(runs = 2, seasons = 10) {
  const duke = TEAMS.find((t) => t.name === 'Duke');
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const sd = (a) => Math.sqrt(avg(a.map((x) => (x - avg(a)) ** 2)));

  const snapshot = () => {
    const st = g();
    const rows = TEAMS.map((t) => ({ p: t.prestige, s: teamStrength(st.teamStates[t.id]) }));
    const band = (lo, hi) => avg(rows.filter((r) => r.p >= lo && r.p < hi).map((r) => r.s));
    const ts = st.teamStates[duke.id];
    const by = Object.fromEntries(ts.players.map((p) => [p.id, p]));
    let elite = 0;
    Object.values(st.teamStates).forEach((t) =>
      t.players.forEach((p) => { if (p.overall >= 90) elite++; })
    );
    return {
      mean: avg(rows.map((r) => r.s)),
      sd: sd(rows.map((r) => r.s)),
      blue: band(90, 101),
      high: band(70, 90),
      small: band(50, 70),
      dukeStart: avg(ts.rotation.starters.map((x) => by[x.id].overall)),
      dukeBench: avg(ts.rotation.bench.map((id) => by[id].overall)),
      elite,
    };
  };

  const fresh = [];
  const aged = [];
  for (let run = 0; run < runs; run++) {
    g().selectTeam(duke.id);
    fresh.push(snapshot());
    for (let s = 0; s < seasons; s++) {
      let guard = 0;
      while (g().phase !== 'DONE' && guard++ < 400) g()._stepDay();
      g().newSeason();
    }
    aged.push(snapshot());
  }

  const keys = ['mean', 'sd', 'blue', 'high', 'small', 'dukeStart', 'dukeBench', 'elite'];
  const row = (label, rows) =>
    label.padEnd(12) + keys.map((k) => avg(rows.map((r) => r[k])).toFixed(1).padStart(10)).join('');
  console.log(`\n=== DYNASTY DRIFT (${runs} leagues, ${seasons} carried-over seasons each) ===`);
  console.log('            ' + keys.map((k) => k.padStart(10)).join(''));
  console.log(row('fresh', fresh));
  console.log(row(`+${seasons} seasons`, aged));
  console.log(
    '\nblue/high/small = mean team strength by prestige band (90+, 70-89, 50-69).\n' +
      'These two rows must stay close. `mean` drifting means RECRUIT_DISCOUNT is off;\n' +
      '`sd` collapsing means the program cycle is too weak to survive four classes\n' +
      'averaging out; `elite` is the league\'s supply of 90+ players.'
  );
}

rosterReport();
tournamentReport();
dynastyReport();
