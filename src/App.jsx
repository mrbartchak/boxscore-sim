import { useGame } from './store/useGame.js';
import TeamSelect from './components/TeamSelect.jsx';
import Layout from './components/Layout.jsx';
import RosterReveal from './components/RosterReveal.jsx';
import OffseasonReveal from './components/OffseasonReveal.jsx';
import { SeasonSummary, ConferenceChampBanner } from './components/Interstitials.jsx';
import { TEAMS_BY_ID } from './data/teams.js';
import { TeamBadge } from './components/common.jsx';

export default function App() {
  const phase = useGame((s) => s.phase);
  const champ = useGame((s) => s.nationalChampionId);
  const userTeamId = useGame((s) => s.userTeamId);
  const showReveal = useGame((s) => s.showReveal);
  const showOffseason = useGame((s) => s.showOffseason);
  const showChampBanner = useGame((s) => s.showChampBanner);
  const showSeasonSummary = useGame((s) => s.showSeasonSummary);
  const showConfChamp = useGame((s) => s.showConfChamp);

  if (phase === 'SELECT') return <TeamSelect />;

  // One gate at a time, in the order the season produces them.
  return (
    <>
      <Layout />
      {showReveal && <RosterReveal />}
      {!showReveal && showOffseason && <OffseasonReveal />}
      {!showReveal && !showOffseason && showSeasonSummary && <SeasonSummary />}
      {!showReveal && !showOffseason && !showSeasonSummary && showConfChamp && <ConferenceChampBanner />}
      {champ && showChampBanner && !showReveal && !showOffseason && (
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
          <button className="btn btn--primary" onClick={newSeason}>To the Offseason →</button>
        </div>
      </div>
    </div>
  );
}
