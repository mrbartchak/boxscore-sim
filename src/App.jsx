import { useGame } from './store/useGame.js';
import TeamSelect from './components/TeamSelect.jsx';
import Layout from './components/Layout.jsx';
import { TEAMS_BY_ID } from './data/teams.js';
import { TeamBadge } from './components/common.jsx';

export default function App() {
  const phase = useGame((s) => s.phase);
  const champ = useGame((s) => s.nationalChampionId);
  const userTeamId = useGame((s) => s.userTeamId);

  if (phase === 'SELECT') return <TeamSelect />;

  return (
    <>
      <Layout />
      {champ && <ChampionBanner champId={champ} userTeamId={userTeamId} />}
    </>
  );
}

function ChampionBanner({ champId, userTeamId }) {
  const team = TEAMS_BY_ID[champId];
  const isUser = champId === userTeamId;
  return (
    <div className="champ-overlay">
      <div className="champ-card">
        <div className="champ-trophy">🏆</div>
        <TeamBadge teamId={champId} size={72} />
        <h1>{team.name}</h1>
        <p>{isUser ? 'You cut down the nets — National Champions!' : `${team.name} wins the national title.`}</p>
      </div>
    </div>
  );
}
