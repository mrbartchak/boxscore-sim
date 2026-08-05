// Full-screen beats between phases. The season used to slide from the regular
// season into the conference bracket with nothing to mark it; these are the
// moments where the game stops and tells you how you did.

import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import { rankTeams, conferenceStandings } from '../engine/rankings.js';
import { seasonAverages } from '../engine/players.js';
import { TeamBadge, contrastColor } from './common.jsx';

export const ORD = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Leader in a counting stat, as a "Lastname · 18.4 PPG" line.
function leaderOf(players, key) {
  const rows = players
    .map((p) => ({ p, v: seasonAverages(p)?.[key] ?? 0 }))
    .sort((a, b) => b.v - a.v);
  return rows[0];
}

// ---------- End of the regular season ----------
export function SeasonSummary() {
  const teamStates = useGame((s) => s.teamStates);
  const userTeamId = useGame((s) => s.userTeamId);
  const seasonNumber = useGame((s) => s.seasonNumber);
  const dismiss = useGame((s) => s.dismissSeasonSummary);

  const ts = teamStates[userTeamId];
  const team = TEAMS_BY_ID[userTeamId];
  const standings = conferenceStandings(teamStates, team.conference);
  const confFinish = standings.findIndex((x) => x.teamId === userTeamId) + 1;
  const natRank = rankTeams(teamStates).find((x) => x.ts.teamId === userTeamId)?.rank;
  const games = ts.record.w + ts.record.l;

  const scorer = leaderOf(ts.players, 'ppg');
  const passer = leaderOf(ts.players, 'apg');
  const boards = leaderOf(ts.players, 'rpg');

  // The seed the conference tournament will hand you (top 8 make the field).
  const seed = confFinish <= 8 ? confFinish : null;

  return (
    <div className="gate" style={{ '--team': team.color, '--team-text': contrastColor(team.color) }}>
      <div className="gate__card gate__card--wide">
        <div className="gate__eyebrow">Season {seasonNumber} · Regular Season Complete</div>
        <div className="gate__head">
          <TeamBadge teamId={userTeamId} size={58} />
          <h1 className="gate__title">{team.name}</h1>
        </div>

        <div className="gate__stats">
          <GateStat value={`${ts.record.w}-${ts.record.l}`} label="Overall" sub={`${games} games`} />
          <GateStat
            value={ORD(confFinish)}
            label={`${team.conference} Finish`}
            sub={`${ts.confRecord.w}-${ts.confRecord.l} in league`}
          />
          <GateStat value={`#${natRank}`} label="National Rank" sub="of 184 teams" />
          <GateStat
            value={`${(ts.pf / games).toFixed(1)}`}
            label="Points For"
            sub={`${(ts.pa / games).toFixed(1)} allowed`}
          />
        </div>

        <div className="gate__leaders">
          <LeaderLine label="Scoring" row={scorer} unit="PPG" />
          <LeaderLine label="Assists" row={passer} unit="APG" />
          <LeaderLine label="Rebounds" row={boards} unit="RPG" />
        </div>

        <div className="gate__note">
          {seed ? (
            <>
              You've earned the <strong>No. {seed} seed</strong> in the {team.conference} tournament.
              Win it and the automatic bid is yours.
            </>
          ) : (
            <>
              {ORD(confFinish)} place misses the {team.conference} tournament's eight-team field — your
              season ends here unless the committee is feeling generous.
            </>
          )}
        </div>

        <button className="btn btn--primary btn--lg" onClick={dismiss}>
          On to the {team.conference} Tournament →
        </button>
      </div>
    </div>
  );
}

function GateStat({ value, label, sub }) {
  return (
    <div className="gatestat">
      <div className="gatestat__value">{value}</div>
      <div className="gatestat__label">{label}</div>
      {sub && <div className="gatestat__sub">{sub}</div>}
    </div>
  );
}

function LeaderLine({ label, row, unit }) {
  if (!row || !row.v) return null;
  return (
    <div className="leaderline">
      <span className="leaderline__label">{label}</span>
      <span className="leaderline__name">{row.p.name}</span>
      <span className="leaderline__pos">{row.p.position}</span>
      <span className="leaderline__val">{row.v} {unit}</span>
    </div>
  );
}

// ---------- Conference tournament decided ----------
export function ConferenceChampBanner() {
  const champions = useGame((s) => s.champions);
  const userTeamId = useGame((s) => s.userTeamId);
  const dismiss = useGame((s) => s.dismissConfChamp);

  const conf = TEAMS_BY_ID[userTeamId].conference;
  const champId = champions[conf];
  const champ = TEAMS_BY_ID[champId];
  const isUser = champId === userTeamId;
  const team = TEAMS_BY_ID[userTeamId];

  return (
    <div className="gate" style={{ '--team': champ.color, '--team-text': contrastColor(champ.color) }}>
      <div className="gate__card">
        <div className="gate__eyebrow">{conf} Tournament</div>
        <div className="gate__trophy">🏆</div>
        <TeamBadge teamId={champId} size={72} />
        <h1 className="gate__title">{champ.name}</h1>
        <p className="gate__sub">
          {isUser
            ? 'You cut down the nets — the automatic bid is yours.'
            : `${champ.name} takes the ${conf} title and the automatic bid.`}
        </p>

        {/* Deliberately no hint about the user's own fate — that's Selection
            Sunday's reveal, and it lands harder for the wait. */}
        {!isUser && (
          <p className="gate__note">{team.name}'s season now rests with the committee.</p>
        )}

        <button className="btn btn--primary btn--lg" onClick={dismiss}>
          To Selection Sunday →
        </button>
      </div>
    </div>
  );
}
