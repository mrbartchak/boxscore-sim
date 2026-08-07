// The program's rafters. Three banners hang from a beam in the team's colors —
// one per thing worth hanging one for — and the record book runs underneath.
// Everything here reads `store.history`, which is banked one row at a time as
// each season's title game goes final.

import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID } from '../data/teams.js';

// Which seasons earn a spot on each banner. Order runs left to right the way a
// gym reads it: the biggest banner first.
const BANNERS = [
  { key: 'natChamp', title: 'Tournament Champions', icon: '🏆' },
  { key: 'confChamp', title: 'Conference Champions', icon: '🏅' },
  { key: 'semiFinalist', title: 'Semi Finalists', icon: '🎯' },
];

export default function LegacyView() {
  const history = useGame((s) => s.history);
  const userTeamId = useGame((s) => s.userTeamId);
  const seasonNumber = useGame((s) => s.seasonNumber);
  const team = TEAMS_BY_ID[userTeamId];

  return (
    <div className="legacy">
      <div className="legacy__rafters">
        {BANNERS.map(({ key, title, icon }) => (
          <Banner
            key={key}
            title={title}
            sub={key === 'confChamp' ? team.conference : team.name}
            icon={icon}
            abbr={team.abbr}
            seasons={history.filter((h) => h[key]).map((h) => h.season)}
          />
        ))}
      </div>

      <div className="panel">
        <div className="panel__toolbar">
          <h3 className="panel__title">Season by Season</h3>
          <span className="muted small">
            {history.length
              ? `${history.length} season${history.length === 1 ? '' : 's'} in the books`
              : `Season ${seasonNumber} in progress`}
          </span>
        </div>

        {history.length === 0 ? (
          <p className="legacy__empty">
            Nothing hangs in the rafters yet. Finish a season and it lands here —
            win one and it goes up top.
          </p>
        ) : (
          <table className="statgrid statgrid--full legacy__table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Overall</th>
                <th>Record</th>
                <th>Conference</th>
                <th>Seed</th>
                <th className="left">Finish</th>
                <th>Conf</th>
                <th>Natl</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((h) => (
                <tr key={h.season} className={h.natChamp ? 'is-champ' : ''}>
                  <td className="strong">{h.season}</td>
                  <td>{h.overall}</td>
                  <td className="strong">{h.record.w}-{h.record.l}</td>
                  <td className="muted">{h.confRecord.w}-{h.confRecord.l}</td>
                  <td className="muted">{h.seed ? `No. ${h.seed}` : '—'}</td>
                  <td className={`left ${h.madeField ? '' : 'muted'}`}>
                    <span className={`finish ${finishClass(h)}`}>{h.finish}</span>
                  </td>
                  <td>{h.confChamp ? <span className="star">🏅</span> : <span className="faint">—</span>}</td>
                  <td>{h.natChamp ? <span className="star">🏆</span> : <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Only the finishes a program would actually brag about get colored.
function finishClass(h) {
  if (h.natChamp) return 'finish--title';
  if (h.semiFinalist) return 'finish--deep';
  return '';
}

function Banner({ title, sub, icon, abbr, seasons }) {
  const hung = seasons.length > 0;
  return (
    <div className={`banner ${hung ? '' : 'is-empty'}`}>
      <div className="banner__hook" />
      <div className="banner__cloth">
        <div className="banner__abbr">{abbr}</div>
        <div className="banner__icon">{icon}</div>
        <div className="banner__title">{title}</div>
        <div className="banner__sub">{sub}</div>
        <div className="banner__years">
          {hung ? (
            seasons.map((s) => (
              <span key={s} className="banner__year">Season {s}</span>
            ))
          ) : (
            <span className="banner__none">Not yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
