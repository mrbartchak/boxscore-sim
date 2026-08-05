import { useState } from 'react';
import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID, CONFERENCES } from '../data/teams.js';
import { rankTeams, conferenceStandings, leaderboard } from '../engine/rankings.js';
import { wearsStar } from '../engine/players.js';
import { TeamBadge, TeamName } from './common.jsx';

const SUBTABS = [
  ['rankings', 'Team Rankings'],
  ['standings', 'Conference Standings'],
  ['leaders', 'Player Leaders'],
];

export default function StatsView() {
  const [tab, setTab] = useState('rankings');
  return (
    <div className="stats">
      <div className="subtabs">
        {SUBTABS.map(([id, label]) => (
          <button key={id} className={`subtab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'rankings' && <TeamRankings />}
      {tab === 'standings' && <Standings />}
      {tab === 'leaders' && <Leaders />}
    </div>
  );
}

function TeamRankings() {
  const teamStates = useGame((s) => s.teamStates);
  const userTeamId = useGame((s) => s.userTeamId);
  const ranked = rankTeams(teamStates).slice(0, 25);

  return (
    <div className="panel">
      <h3 className="panel__title">Top 25 · Power Rankings</h3>
      <table className="statgrid statgrid--full">
        <thead>
          <tr><th>#</th><th className="left">Team</th><th>Conf</th><th>Record</th><th>PF</th><th>PA</th><th>Rating</th></tr>
        </thead>
        <tbody>
          {ranked.map(({ ts, rank, rating }) => {
            const team = TEAMS_BY_ID[ts.teamId];
            const gp = ts.record.w + ts.record.l;
            return (
              <tr key={ts.teamId} className={ts.teamId === userTeamId ? 'is-user' : ''}>
                <td className="rank">{rank}</td>
                <td className="left"><span className="teamcell"><TeamBadge teamId={ts.teamId} size={24} /><TeamName teamId={ts.teamId} /></span></td>
                <td className="muted small">{team.conference}</td>
                <td className="strong">{ts.record.w}-{ts.record.l}</td>
                <td>{gp ? (ts.pf / gp).toFixed(1) : '—'}</td>
                <td>{gp ? (ts.pa / gp).toFixed(1) : '—'}</td>
                <td>{rating.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Standings() {
  const teamStates = useGame((s) => s.teamStates);
  const userTeamId = useGame((s) => s.userTeamId);
  const [conf, setConf] = useState(TEAMS_BY_ID[userTeamId].conference);
  const standings = conferenceStandings(teamStates, conf);

  return (
    <div className="panel">
      <div className="panel__toolbar">
        <h3 className="panel__title">Conference Standings</h3>
        <select className="select-input" value={conf} onChange={(e) => setConf(e.target.value)}>
          {CONFERENCES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <table className="statgrid statgrid--full">
        <thead>
          <tr><th>#</th><th className="left">Team</th><th>Conf</th><th>Overall</th><th>Streak</th></tr>
        </thead>
        <tbody>
          {standings.map((ts, i) => (
            <tr key={ts.teamId} className={ts.teamId === userTeamId ? 'is-user' : ''}>
              <td className="rank">{i + 1}</td>
              <td className="left"><span className="teamcell"><TeamBadge teamId={ts.teamId} size={24} /><TeamName teamId={ts.teamId} /></span></td>
              <td className="strong">{ts.confRecord.w}-{ts.confRecord.l}</td>
              <td>{ts.record.w}-{ts.record.l}</td>
              <td className={ts.streak > 0 ? 'pos' : ts.streak < 0 ? 'neg' : ''}>
                {ts.streak === 0 ? '—' : `${ts.streak > 0 ? 'W' : 'L'}${Math.abs(ts.streak)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATS = [['ppg', 'Points'], ['apg', 'Assists'], ['rpg', 'Rebounds']];

function Leaders() {
  const teamStates = useGame((s) => s.teamStates);
  const userTeamId = useGame((s) => s.userTeamId);
  const [stat, setStat] = useState('ppg');
  const rows = leaderboard(teamStates, stat, 25);
  const label = STATS.find((s) => s[0] === stat)[1];

  return (
    <div className="panel">
      <div className="panel__toolbar">
        <h3 className="panel__title">League Leaders</h3>
        <div className="segmented">
          {STATS.map(([id, lbl]) => (
            <button key={id} className={`seg ${stat === id ? 'on' : ''}`} onClick={() => setStat(id)}>{lbl}</button>
          ))}
        </div>
      </div>
      <table className="statgrid statgrid--full">
        <thead>
          <tr><th>#</th><th className="left">Player</th><th className="left">Team</th><th>Pos</th><th>Cl</th><th>GP</th><th>{label.slice(0,3).toUpperCase()}</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.player.id} className={r.teamId === userTeamId ? 'is-user' : ''}>
              <td className="rank">{i + 1}</td>
              <td className="left">
                <span className="playercell">
                  {r.player.name} {wearsStar(r.player) && <span className="star">★</span>}
                </span>
              </td>
              <td className="left"><span className="teamcell"><TeamBadge teamId={r.teamId} size={20} /><span className="small">{TEAMS_BY_ID[r.teamId].abbr}</span></span></td>
              <td><span className="posbadge posbadge--sm">{r.player.position}</span></td>
              <td className="muted small">{r.player.class}</td>
              <td>{r.gp}</td>
              <td className="strong">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
