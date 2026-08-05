// Render every screen of the game through Vite's SSR pipeline. This won't
// exercise effects or CSS, but it does catch crashes and missing data on the
// phase gates, which is most of what a click-through would find.
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const root = '/Users/matthewbartchak/Documents/Code/web-apps/college-basketball-sim';
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

const { useGame } = await vite.ssrLoadModule('/src/store/useGame.js');
const { TEAMS } = await vite.ssrLoadModule('/src/data/teams.js');
const App = (await vite.ssrLoadModule('/src/App.jsx')).default;

const g = () => useGame.getState();
let fails = 0;

function render(label, expect = []) {
  let html;
  try {
    html = renderToString(createElement(App));
  } catch (e) {
    fails++;
    console.log(`  CRASH  ${label}: ${e.message}`);
    return;
  }
  const missing = expect.filter((t) => !html.includes(t));
  if (missing.length) {
    fails++;
    console.log(`  MISS   ${label}: expected ${JSON.stringify(missing)}`);
  } else {
    console.log(`  ok     ${label}  (${(html.length / 1024).toFixed(0)}kb)`);
  }
}

const duke = TEAMS.find((t) => t.name === 'Duke');

console.log('\nSEASON 1');
render('team select', ['Pick your program']);
g().selectTeam(duke.id);
render('roster reveal', ['Now coaching', 'Duke', 'Your Starting Five']);
useGame.setState({ showReveal: false });
render('regular season calendar', ['cal-cell', 'Simulate']);

// Run to the end of the regular season.
let guard = 0;
while (g().phase === 'REGULAR' && guard++ < 400) g()._stepDay();
render('season summary gate', ['Regular Season Complete', 'National Rank', 'Conference Tournament'.slice(0, 10)]);
useGame.setState({ showSeasonSummary: false });
render('conference bracket', ['Tournament', 'bracket']);

guard = 0;
while (g().phase === 'CONF_TOURNEY' && guard++ < 60) g()._stepDay();
render('conference champion gate', ['Tournament', 'Selection Sunday']);
useGame.setState({ showConfChamp: false });
render('selection sunday', ['Selection Sunday']);

// Enter the bracket by simulating into it (the view flips once games are played).
guard = 0;
while (g().phase === 'NATIONAL' && guard++ < 60) g()._stepDay();
render('final bracket + champion', ['natbracket', 'champ-card']);
useGame.setState({ showChampBanner: false });
render('completed bracket', ['natbracket', 'Championship']);

console.log('\nOFFSEASON → SEASON 2');
g().newSeason();
const off = g().offseason;
render('offseason reveal', ['Offseason', off.departures.length ? 'Moving On' : 'Incoming Class']);
useGame.setState({ showOffseason: false });
render('season 2 calendar', ['Season 2']);

// A team that misses the tournament takes different branches everywhere.
console.log('\nWEAK PROGRAM (misses the field)');
const worst = TEAMS.reduce((a, t) => (t.prestige < a.prestige ? t : a));
g().selectTeam(worst.id);
useGame.setState({ showReveal: false });
guard = 0;
while (g().phase !== 'DONE' && guard++ < 400) {
  g()._stepDay();
  if (g().showSeasonSummary) { render('summary (weak)', ['Regular Season Complete']); useGame.setState({ showSeasonSummary: false }); }
  if (g().showConfChamp) { render('conf champ (weak)', ['Tournament']); useGame.setState({ showConfChamp: false }); }
}
useGame.setState({ showChampBanner: false });
const inField = g().nationalField.includes(worst.id);
render(`national view (in field: ${inField})`, ['natbracket']);

await vite.close();
console.log(fails ? `\n${fails} FAILURES` : '\nevery screen renders');
process.exit(fails ? 1 : 0);
