import { useState, useEffect, useRef } from 'react';
import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import { careerAverages, overallTier, POSITIONS } from '../engine/players.js';
import { TeamBadge, contrastColor } from './common.jsx';
import { playRevealSfx, playTeamSfx, isMuted, setMuted } from '../audio/sfx.js';
import PlayerCard from './PlayerCard.jsx';

// Higher tiers dwell longer so the reveal builds to the best player.
const TIER_DELAY = { base: 620, silver: 760, gold: 920, diamond: 1150, rainbow: 1500 };

export default function RosterReveal() {
  const userTeamId = useGame((s) => s.userTeamId);
  const ts = useGame((s) => s.teamStates[s.userTeamId]);
  const revealRandom = useGame((s) => s.revealRandom);
  const dismiss = useGame((s) => s.dismissReveal);

  const team = TEAMS_BY_ID[userTeamId];
  const byId = Object.fromEntries(ts.players.map((p) => [p.id, p]));
  // Always PG → C, so the lineup reads like a starting five being announced.
  const starters = POSITIONS.map((pos) => byId[ts.rotation.starters.find((s) => s.pos === pos).id]);

  const [teamShown, setTeamShown] = useState(!revealRandom);
  const [revealed, setRevealed] = useState(0);
  const [mute, setMute] = useState(isMuted());
  // Effects re-run on re-render (and twice under StrictMode); these make each
  // cue fire exactly once.
  const sounded = useRef(0); // highest card index already sounded
  const teamSounded = useRef(false);

  useEffect(() => {
    if (!revealRandom) return;
    const t = setTimeout(() => setTeamShown(true), 1100);
    return () => clearTimeout(t);
  }, [revealRandom]);

  useEffect(() => {
    if (!teamShown || revealed >= starters.length) return;
    const nextTier = overallTier(starters[revealed].overall);
    const t = setTimeout(() => setRevealed((r) => r + 1), TIER_DELAY[nextTier]);
    return () => clearTimeout(t);
  }, [teamShown, revealed, starters]);

  useEffect(() => {
    if (!teamShown || teamSounded.current) return;
    teamSounded.current = true;
    playTeamSfx();
  }, [teamShown]);

  // Sound the card that just flipped; its rarity picks the fanfare.
  useEffect(() => {
    if (!teamShown || revealed === 0 || revealed <= sounded.current) return;
    sounded.current = revealed;
    playRevealSfx(overallTier(starters[revealed - 1].overall));
  }, [teamShown, revealed, starters]);

  const toggleMute = () => {
    const next = !mute;
    setMuted(next);
    setMute(next);
  };

  const allShown = revealed >= starters.length;

  return (
    <div className="reveal" style={{ '--team': team.color, '--team-text': contrastColor(team.color) }}>
      <button
        className="btn btn--icon reveal__mute"
        onClick={toggleMute}
        title={mute ? 'Unmute reveal sounds' : 'Mute reveal sounds'}
      >
        {mute ? '🔇' : '🔊'}
      </button>
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
            <div className="reveal__rostertitle">Your Starting Five</div>
            <div className="reveal__cards">
              {starters.map((p, i) => {
                if (i >= revealed) return <div key={p.id} className="reveal__placeholder">{POSITIONS[i]}</div>;
                const tier = overallTier(p.overall);
                return (
                  <div key={p.id} className={`reveal__cardwrap reveal-anim--${tier}`}>
                    <PlayerCard player={p} layout="tile" stats={careerAverages(p)} starId={ts.rotation.starId} />
                  </div>
                );
              })}
            </div>
            <div className="reveal__careernote">Career averages · freshmen have no prior stats</div>
            <button
              className="btn btn--primary btn--lg reveal__start"
              onClick={dismiss}
              style={{ opacity: allShown ? 1 : 0.35, pointerEvents: allShown ? 'auto' : 'none' }}
            >
              Start Season →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
