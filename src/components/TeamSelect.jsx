import { useEffect, useMemo, useState } from 'react';
import { CONFERENCES, TEAMS_BY_ID, TEAMS } from '../data/teams.js';
import { useGame } from '../store/useGame.js';
import { TeamBadge, PrestigeMeter, contrastColor, accentColor } from './common.jsx';

const BY_NAME = (a, b) => a.name.localeCompare(b.name);
const TEAMS_AZ = [...TEAMS].sort(BY_NAME);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const HAS_LETTER = new Set(TEAMS_AZ.map((t) => t.name[0].toUpperCase()));

// Prestige runs 32-95, so these bands cover the league end to end.
const PRESTIGE_BANDS = [
  { id: 'any', label: 'Any prestige' },
  { id: '90', label: '90+ · Blue bloods', min: 90, max: 100 },
  { id: '80', label: '80-89 · Elite', min: 80, max: 89 },
  { id: '70', label: '70-79 · Strong', min: 70, max: 79 },
  { id: '60', label: '60-69 · Solid', min: 60, max: 69 },
  { id: '50', label: '50-59 · Mid-major', min: 50, max: 59 },
  { id: '0', label: 'Under 50 · Long shots', min: 0, max: 49 },
];

// Intro stages: 0 the logo alone, centered → 1 it docks up top, and only once it
// has landed do the name, tagline and button fade in → 2 the league appears.
const STAGE_DELAYS = [1000, 1200];
// Once per page load. Abandoning a program drops you back here, and sitting
// through the title sequence a second time is just a wait.
let introPlayed = false;

export default function TeamSelect() {
  const [stage, setStage] = useState(introPlayed ? 2 : 0);
  const [selected, setSelected] = useState(null);
  const [conf, setConf] = useState(null); // null = the whole league, A-Z
  const [prestige, setPrestige] = useState('any');
  const [query, setQuery] = useState('');
  const selectTeam = useGame((s) => s.selectTeam);
  const team = selected ? TEAMS_BY_ID[selected] : null;

  // Gate on the stage, not the flag: StrictMode mounts twice, and a flag set on
  // the first pass would leave the second pass with the timers cleared and the
  // league stuck behind the title screen forever.
  useEffect(() => {
    if (stage >= 2) return;
    const timers = STAGE_DELAYS.map((ms, i) =>
      setTimeout(() => {
        setStage(i + 1);
        if (i === STAGE_DELAYS.length - 1) introPlayed = true;
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickRandom = () => {
    const t = TEAMS[Math.floor(Math.random() * TEAMS.length)];
    selectTeam(t.id, { random: true });
  };

  // Three shapes for the same list: search results, one conference, or the
  // whole league split into letter sections (the only one with a letter rail).
  const q = query.trim().toLowerCase();
  const { groups, rail, total } = useMemo(() => {
    const band = PRESTIGE_BANDS.find((b) => b.id === prestige);
    let base = TEAMS_AZ;
    if (conf) base = base.filter((t) => t.conference === conf);
    if (band.min != null) base = base.filter((t) => t.prestige >= band.min && t.prestige <= band.max);

    const shape = (rail, groups) => ({ rail, groups, total: base.length });

    if (q) {
      const hits = base.filter(
        (t) => t.name.toLowerCase().includes(q) || t.abbr.toLowerCase().includes(q),
      );
      return {
        rail: false,
        total: hits.length,
        groups: [{ title: `${hits.length} result${hits.length === 1 ? '' : 's'}`, teams: hits }],
      };
    }
    if (conf) return shape(false, [{ title: conf, teams: base }]);

    const letters = [];
    for (const t of base) {
      const letter = t.name[0].toUpperCase();
      const last = letters[letters.length - 1];
      if (last && last.title === letter) last.teams.push(t);
      else letters.push({ title: letter, teams: [t] });
    }
    return shape(true, letters);
  }, [conf, prestige, q]);

  const jumpTo = (letter) => {
    document.getElementById(`az-${letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sections = groups.map(({ title, teams }) => (
    <section key={title} id={`az-${title}`} className="conf">
      <h2 className="conf__title">{title}</h2>
      <div className="conf__grid">
        {teams.map((t) => (
          <button
            key={t.id}
            className={`teamcard ${selected === t.id ? 'is-selected' : ''}`}
            onClick={() => setSelected(t.id)}
            style={{ '--team': t.color, '--team-accent': accentColor(t.color), '--team-text': contrastColor(t.color) }}
          >
            <span className="teamcard__color">{t.abbr}</span>
            <span className="teamcard__info">
              <span className="teamcard__name">{t.name}</span>
              <PrestigeMeter prestige={t.prestige} />
            </span>
          </button>
        ))}
      </div>
    </section>
  ));

  return (
    <div className={`select ${stage < 2 ? 'is-intro' : ''}`}>
      <header className={`select__hero ${stage >= 1 ? 'is-docked' : ''}`}>
        <img className="select__logo" src="/logo-light.svg" alt="Box Score" />
        <h1 className="select__title">Hoops Dynasty</h1>
        <p className="select__tag">
          Take over a program, set your rotation, and sim from November to the national title —
          then do it again next year with the roster you built.
        </p>
        <button className="btn btn--lg select__random" onClick={pickRandom}>🎲 Random Team</button>
      </header>

      <div className="select__body">
        <div className="filterbar">
          <div className="filterbar__filters">
            <button
              className={`filterbtn ${!conf && prestige === 'any' && !q ? 'is-on' : ''}`}
              onClick={() => { setConf(null); setPrestige('any'); setQuery(''); }}
            >
              All Teams
            </button>
            <select
              className="select-input"
              value={conf ?? ''}
              onChange={(e) => setConf(e.target.value || null)}
              aria-label="Filter by conference"
            >
              <option value="">All conferences</option>
              {CONFERENCES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="select-input"
              value={prestige}
              onChange={(e) => setPrestige(e.target.value)}
              aria-label="Filter by prestige"
            >
              {PRESTIGE_BANDS.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </div>

          <div className="select__search">
            <span className="select__searchicon">🔍</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams…"
              aria-label="Search teams"
            />
            {query && (
              <button className="select__searchclear" onClick={() => setQuery('')} aria-label="Clear search">
                ×
              </button>
            )}
          </div>
        </div>

        {total === 0 ? (
          <p className="select__empty">No teams match {q ? `“${query}”` : 'these filters'}.</p>
        ) : rail ? (
          <div className="az">
            <div>{sections}</div>
            <nav className="az__rail">
              {LETTERS.map((l) => (
                <button key={l} className="az__letter" disabled={!HAS_LETTER.has(l)} onClick={() => jumpTo(l)}>
                  {l}
                </button>
              ))}
            </nav>
          </div>
        ) : (
          sections
        )}
      </div>

      {team && (
        <div className="select__bar">
          <div className="select__barinfo">
            <TeamBadge teamId={team.id} size={44} />
            <div>
              <div className="select__barname">{team.name}</div>
              <div className="select__barconf">{team.conference} · Prestige {team.prestige}</div>
            </div>
          </div>
          <button className="btn btn--primary btn--lg" onClick={() => selectTeam(team.id)}>
            Start Season →
          </button>
        </div>
      )}
    </div>
  );
}
