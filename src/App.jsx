import { useGame } from './store/useGame.js';
import TeamSelect from './components/TeamSelect.jsx';
import Layout from './components/Layout.jsx';
import RosterReveal from './components/RosterReveal.jsx';
import { TEAMS_BY_ID } from './data/teams.js';
import { TeamBadge } from './components/common.jsx';

export default function App() {
  const phase = useGame((s) => s.phase);
  const champ = useGame((s) => s.nationalChampionId);
  const userTeamId = useGame((s) => s.userTeamId);
  const showReveal = useGame((s) => s.showReveal);
  const showChampBanner = useGame((s) => s.showChampBanner);

  if (phase === 'SELECT') return <TeamSelect />;

  return (
    <>
      <Layout />
      {showReveal && <RosterReveal />}
      {champ && showChampBanner && !showReveal && (
        <ChampionBanner champId={champ} userTeamId={userTeamId} />
      )}
    </>
  );
}

function ChampionBanner({ champId, userTeamId }) {
  const newSeason = useGame((s) => s.newSeason);
  const dismiss = useGame((s) => s.dismissChampBanner);
  const team = TEAMS_BY_ID[champId];
  const isUser = champId === userTeamId;
  return (
    <div className="champ-overlay">
      <div className="champ-card">
        <div className="champ-trophy">🏆</div>
        <TeamBadge teamId={champId} size={72} />
        <h1>{team.name}</h1>
        <p>{isUser ? 'You cut down the nets — National Champions!' : `${team.name} wins the national title.`}</p>
        <div className="champ-actions">
          <button className="btn" onClick={dismiss}>View Final Bracket</button>
          <button className="btn btn--primary" onClick={newSeason}>New Season →</button>
        </div>
      </div>
    </div>
  );
}
