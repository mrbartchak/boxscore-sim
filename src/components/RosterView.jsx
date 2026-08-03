import { useGame } from '../store/useGame.js';
import { playerAverages, CLASS_LABEL } from '../engine/players.js';
import { teamStrength } from '../engine/simulation.js';
import { TEAMS_BY_ID } from '../data/teams.js';

export default function RosterView() {
  const userTeamId = useGame((s) => s.userTeamId);
  const ts = useGame((s) => s.teamStates[s.userTeamId]);
  const toggleStarter = useGame((s) => s.toggleStarter);
  const setStar = useGame((s) => s.setStar);
  const setMinutes = useGame((s) => s.setMinutes);

  const team = TEAMS_BY_ID[userTeamId];
  const { starters, starId } = ts.rotation;

  const totalMin = ts.players.reduce((sum, p) => sum + (ts.rotation.minutes[p.id] || 0), 0);
  const strength = teamStrength(ts);

  // Starters first, then by minutes.
  const ordered = [...ts.players].sort((a, b) => {
    const sa = starters.includes(a.id) ? 1 : 0;
    const sb = starters.includes(b.id) ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return (ts.rotation.minutes[b.id] || 0) - (ts.rotation.minutes[a.id] || 0);
  });

  return (
    <div className="roster">
      <div className="roster__header">
        <div className="roster__summary">
          <SummaryStat label="Team Rating" value={Math.round(strength)} />
          <SummaryStat label="Starters" value={`${starters.length}/5`} warn={starters.length !== 5} />
          <SummaryStat label="Rotation Min" value={`${Math.round(totalMin)}`} hint="normalized to 200" />
          <SummaryStat label="Record" value={`${ts.record.w}-${ts.record.l}`} />
        </div>
        <p className="roster__hint">
          Set your 5 starters, hand out minutes, and pick your star (★ gets a usage boost). Minutes are
          normalized to 200 at tip-off, so it's the <em>ratio</em> that matters.
        </p>
      </div>

      <div className="roster__tablewrap">
        <table className="rostertable">
          <thead>
            <tr>
              <th>Start</th>
              <th>Pos</th>
              <th className="left">Player</th>
              <th>Class</th>
              <th>OVR</th>
              <th>Min</th>
              <th>PPG</th>
              <th>APG</th>
              <th>RPG</th>
              <th>Star</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((p) => {
              const avg = playerAverages(p);
              const isStarter = starters.includes(p.id);
              const min = ts.rotation.minutes[p.id] || 0;
              return (
                <tr key={p.id} className={isStarter ? 'is-starter' : ''}>
                  <td>
                    <button
                      className={`starttoggle ${isStarter ? 'on' : ''}`}
                      onClick={() => toggleStarter(p.id)}
                      title={isStarter ? 'Remove from starting five' : 'Add to starting five'}
                    >
                      {isStarter ? '●' : '○'}
                    </button>
                  </td>
                  <td><span className="pos">{p.position}</span></td>
                  <td className="left">
                    <div className="playername">
                      {p.name}
                      {p.id === starId && <span className="star">★</span>}
                    </div>
                  </td>
                  <td><span className="cls" title={CLASS_LABEL[p.class]}>{p.class}</span></td>
                  <td><OvrBadge ovr={p.overall} /></td>
                  <td>
                    <div className="minstep">
                      <button onClick={() => setMinutes(p.id, min - 2)}>−</button>
                      <span>{min}</span>
                      <button onClick={() => setMinutes(p.id, min + 2)}>+</button>
                    </div>
                  </td>
                  <td className="strong">{avg.ppg}</td>
                  <td>{avg.apg}</td>
                  <td>{avg.rpg}</td>
                  <td>
                    <button
                      className={`startoggle ${p.id === starId ? 'on' : ''}`}
                      onClick={() => setStar(p.id)}
                    >★</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="roster__note">
        {ts.players[0].gp > 0
          ? 'Stats shown are season averages for your team.'
          : 'Stats shown are projected per-game production until the season tips off.'}
      </p>
    </div>
  );
}

function SummaryStat({ label, value, hint, warn }) {
  return (
    <div className={`sumstat ${warn ? 'sumstat--warn' : ''}`}>
      <div className="sumstat__value">{value}</div>
      <div className="sumstat__label">{label}</div>
      {hint && <div className="sumstat__hint">{hint}</div>}
    </div>
  );
}

function OvrBadge({ ovr }) {
  const tier = ovr >= 85 ? 'elite' : ovr >= 75 ? 'good' : ovr >= 65 ? 'ok' : 'low';
  return <span className={`ovr ovr--${tier}`}>{ovr}</span>;
}
