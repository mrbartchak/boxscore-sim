import { useGame } from '../store/useGame.js';
import ScheduleView from './ScheduleView.jsx';
import { ConferenceTournamentView, NationalTournamentView } from './TournamentView.jsx';

// The main "schedule" tab swaps its content with the season phase: the calendar
// during the regular season, then the tournament brackets.
export default function SeasonView() {
  const phase = useGame((s) => s.phase);
  if (phase === 'REGULAR') return <ScheduleView />;
  if (phase === 'CONF_TOURNEY') return <ConferenceTournamentView />;
  return <NationalTournamentView />; // NATIONAL or DONE
}
