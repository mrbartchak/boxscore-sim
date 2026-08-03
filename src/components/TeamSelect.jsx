import { useState } from 'react';
import { teamsByConference, TEAMS_BY_ID } from '../data/teams.js';
import { useGame } from '../store/useGame.js';
import { TeamBadge, PrestigeMeter, contrastColor } from './common.jsx';

const CONF_GROUPS = teamsByConference();

export default function TeamSelect() {
  const [selected, setSelected] = useState(null);
  const selectTeam = useGame((s) => s.selectTeam);
  const team = selected ? TEAMS_BY_ID[selected] : null;

  return (
    <div className="select">
      <header className="select__hero">
        <div className="select__badge">🏀</div>
        <h1>College Hoops Dynasty</h1>
        <p>Pick a program to lead. Powerhouses come stacked — mid-majors, you'll have to build it.</p>
      </header>

      <div className="select__conferences">
        {CONF_GROUPS.map(({ conference, teams }) => (
          <section key={conference} className="conf">
            <h2 className="conf__title">{conference}</h2>
            <div className="conf__grid">
              {teams.map((t) => (
                <button
                  key={t.id}
                  className={`teamcard ${selected === t.id ? 'is-selected' : ''}`}
                  onClick={() => setSelected(t.id)}
                  style={{ '--team': t.color, '--team-text': contrastColor(t.color) }}
                >
                  <TeamBadge teamId={t.id} size={40} />
                  <div className="teamcard__info">
                    <span className="teamcard__name">{t.name}</span>
                    <PrestigeMeter prestige={t.prestige} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {team && (
        <div className="select__bar">
          <div className="select__barinfo">
            <TeamBadge teamId={team.id} size={44} />
            <div>
              <div className="select__barname">{team.name}</div>
              <div className="select__barconf">{team.conference} · Prestige {team.prestige}</div>
            </div>
          </div>
          <button className="btn btn--primary btn--lg" onClick={() => selectTeam(team.id)}>
            Start Season →
          </button>
        </div>
      )}
    </div>
  );
}
