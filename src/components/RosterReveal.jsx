import { useState, useEffect } from 'react';
import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import { TeamBadge, contrastColor } from './common.jsx';
import PlayerCard from './PlayerCard.jsx';

// Full-screen reveal shown right after a team is chosen: the program (with a
// short suspense beat if the pick was random), then the roster cards stagger in.
export default function RosterReveal() {
  const userTeamId = useGame((s) => s.userTeamId);
  const ts = useGame((s) => s.teamStates[s.userTeamId]);
  const revealRandom = useGame((s) => s.revealRandom);
  const dismiss = useGame((s) => s.dismissReveal);

  const team = TEAMS_BY_ID[userTeamId];
  // With a random pick, hold on the "?" for a beat before revealing the team.
  const [teamShown, setTeamShown] = useState(!revealRandom);

  useEffect(() => {
    if (!revealRandom) return;
    const t = setTimeout(() => setTeamShown(true), 1100);
    return () => clearTimeout(t);
  }, [revealRandom]);

  const players = [...ts.players].sort((a, b) => b.overall - a.overall);

  return (
    <div className="reveal" style={{ '--team': team.color, '--team-text': contrastColor(team.color) }}>
      <div className="reveal__inner">
        <div className={`reveal__team ${teamShown ? 'is-shown' : ''}`}>
          {teamShown ? (
            <>
              <TeamBadge teamId={userTeamId} size={72} />
              <div>
                <div className="reveal__eyebrow">{revealRandom ? 'Your program is…' : 'Now coaching'}</div>
                <h1 className="reveal__name">{team.name}</h1>
                <div className="reveal__conf">{team.conference}</div>
              </div>
            </>
          ) : (
            <div className="reveal__mystery">?</div>
          )}
        </div>

        {teamShown && (
          <>
            <div className="reveal__rostertitle">Meet your roster</div>
            <div className="reveal__cards">
              {players.map((p, i) => (
                <div key={p.id} className="reveal__cardwrap" style={{ animationDelay: `${0.15 + i * 0.09}s` }}>
                  <PlayerCard player={p} isStar={p.id === ts.rotation.starId} />
                </div>
              ))}
            </div>
            <button className="btn btn--primary btn--lg reveal__start" onClick={dismiss}>
              Start Season →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
