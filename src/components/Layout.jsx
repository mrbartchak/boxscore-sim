import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../store/useGame.js';
import { isMuted, setMuted } from '../audio/sfx.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import { formatDate } from '../engine/schedule.js';
import { pollRanks } from '../engine/rankings.js';
import { TeamBadge, RankChip, contrastColor, accentColor } from './common.jsx';
import SeasonView from './SeasonView.jsx';
import RosterView from './RosterView.jsx';
import StatsView from './StatsView.jsx';
import LegacyView from './LegacyView.jsx';

const PHASE_LABEL = {
  REGULAR: 'Regular Season',
  CONF_TOURNEY: 'Conference Tournaments',
  NATIONAL: 'National Tournament',
  DONE: 'Season Complete',
};

const TABS = [
  ['schedule', 'Schedule'],
  ['roster', 'Roster'],
  ['stats', 'Stats & Rankings'],
  ['legacy', 'Legacy'],
];

export default function Layout() {
  const userTeamId = useGame((s) => s.userTeamId);
  const ts = useGame((s) => s.teamStates[s.userTeamId]);
  const currentDate = useGame((s) => s.currentDate);
  const phase = useGame((s) => s.phase);
  const activeView = useGame((s) => s.activeView);
  const setView = useGame((s) => s.setView);
  const seasonNumber = useGame((s) => s.seasonNumber);
  const teamStates = useGame((s) => s.teamStates);

  const team = TEAMS_BY_ID[userTeamId];
  // Recomputed only when a day has actually been simulated.
  const rank = useMemo(() => pollRanks(teamStates)[userTeamId], [teamStates, userTeamId]);

  return (
    <div className="app" style={{
        '--team': team.color,
        '--team-accent': accentColor(team.color),
        '--team-text': contrastColor(team.color),
      }}>
      <header className="topbar">
        {/* Masked, not an <img>: the file is white ink, and the mask lets it be
            painted in the team's color once you're inside a program. */}
        <div className="topbar__logo" role="img" aria-label="Box Score" />

        <div className="topbar__team">
          <TeamBadge teamId={userTeamId} size={40} />
          <div>
            <div className="topbar__name">
              {team.name}
              <RankChip rank={rank} />
            </div>
            <div className="topbar__sub">
              <span className="topbar__record">{ts.record.w}-{ts.record.l}</span>
              <span className="topbar__conf">
                {team.conference}
                <span className="topbar__conf-rec"> ({ts.confRecord.w}-{ts.confRecord.l} conf)</span>
              </span>
            </div>
          </div>
        </div>

        <nav className="tabs">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className={`tab ${activeView === id ? 'is-active' : ''}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="topbar__status">
          <div className="topbar__phase">{PHASE_LABEL[phase]}</div>
          <div className="topbar__date">Season {seasonNumber} · {formatDate(currentDate)}</div>
        </div>

        <SeasonControls phase={phase} />
      </header>

      <main className="content">
        {activeView === 'schedule' && <SeasonView />}
        {activeView === 'roster' && <RosterView />}
        {activeView === 'stats' && <StatsView />}
        {activeView === 'legacy' && <LegacyView />}
      </main>
    </div>
  );
}

// New Season (once the title game is in the books), then the settings menu —
// which is where Abandon Program now lives, behind a two-step confirm since
// there's no persistence and one stray click would wipe the whole save.
function SeasonControls({ phase }) {
  const newSeason = useGame((s) => s.newSeason);
  const stopSim = useGame((s) => s.stopSim);

  return (
    <div className="topbar__actions">
      {phase === 'DONE' && (
        <button className="btn btn--primary" onClick={() => { stopSim(); newSeason(); }}>
          Offseason →
        </button>
      )}
      <SettingsMenu />
    </div>
  );
}

const SPEEDS = [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']];

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [mute, setMute] = useState(isMuted());
  const simSpeed = useGame((s) => s.simSpeed);
  const setSimSpeed = useGame((s) => s.setSimSpeed);
  const fullSim = useGame((s) => s.fullSim);
  const setFullSim = useGame((s) => s.setFullSim);
  const abandonSeason = useGame((s) => s.abandonSeason);
  const stopSim = useGame((s) => s.stopSim);
  const ref = useRef(null);

  // Close on an outside click or Escape; reset the abandon confirm on the way out.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) { setOpen(false); setConfirming(false); } };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setConfirming(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleMute = () => {
    const next = !mute;
    setMute(next);
    setMuted(next);
  };

  return (
    <div className="settings" ref={ref}>
      <button
        className={`btn btn--icon settings__btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen(!open)}
        title="Settings"
        aria-label="Settings"
      >
        ⚙
      </button>

      {open && (
        <div className="settings__menu">
          <div className="settings__row">
            <div>
              <div className="settings__label">Sound</div>
              <div className="settings__hint">Reveal and roster fanfares</div>
            </div>
            <button className={`toggle ${mute ? '' : 'is-on'}`} onClick={toggleMute}>
              {mute ? '🔇 Muted' : '🔊 On'}
            </button>
          </div>

          <div className="settings__row">
            <div>
              <div className="settings__label">Full Sim Games</div>
              <div className="settings__hint">Stop on your games and roll the score</div>
            </div>
            <button className={`toggle ${fullSim ? 'is-on' : ''}`} onClick={() => setFullSim(!fullSim)}>
              {fullSim ? 'On' : 'Off'}
            </button>
          </div>

          <div className="settings__row settings__row--stack">
            <div>
              <div className="settings__label">Sim Speed</div>
              <div className="settings__hint">How fast the calendar advances</div>
            </div>
            <div className="segmented">
              {SPEEDS.map(([id, label]) => (
                <button
                  key={id}
                  className={`segmented__btn ${simSpeed === id ? 'is-on' : ''}`}
                  onClick={() => setSimSpeed(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings__foot">
            {confirming ? (
              <>
                <span className="settings__hint">Abandon this program? The save is gone.</span>
                <div className="settings__confirm">
                  <button className="btn btn--danger" onClick={() => { stopSim(); abandonSeason(); }}>Yes, quit</button>
                  <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              </>
            ) : (
              <button className="btn btn--ghost settings__abandon" onClick={() => setConfirming(true)}>
                Abandon Program
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
