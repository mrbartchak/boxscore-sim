import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import { formatDate } from '../engine/schedule.js';
import { TeamBadge, contrastColor } from './common.jsx';
import SeasonView from './SeasonView.jsx';
import RosterView from './RosterView.jsx';
import StatsView from './StatsView.jsx';

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
];

export default function Layout() {
  const userTeamId = useGame((s) => s.userTeamId);
  const ts = useGame((s) => s.teamStates[s.userTeamId]);
  const currentDate = useGame((s) => s.currentDate);
  const phase = useGame((s) => s.phase);
  const activeView = useGame((s) => s.activeView);
  const setView = useGame((s) => s.setView);

  const team = TEAMS_BY_ID[userTeamId];

  return (
    <div className="app" style={{ '--team': team.color, '--team-text': contrastColor(team.color) }}>
      <header className="topbar">
        <div className="topbar__team">
          <TeamBadge teamId={userTeamId} size={40} />
          <div>
            <div className="topbar__name">{team.name}</div>
            <div className="topbar__sub">
              {team.conference} · {ts.record.w}-{ts.record.l}
              <span className="topbar__conf-rec"> ({ts.confRecord.w}-{ts.confRecord.l} conf)</span>
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
          <div className="topbar__date">{formatDate(currentDate)}</div>
        </div>
      </header>

      <main className="content">
        {activeView === 'schedule' && <SeasonView />}
        {activeView === 'roster' && <RosterView />}
        {activeView === 'stats' && <StatsView />}
      </main>
    </div>
  );
}
