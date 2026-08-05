import { useState, useEffect, useMemo, useRef } from 'react';
import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import { careerAverages, seasonAverages, overallTier, CLASS_LABEL } from '../engine/players.js';
import { DEPARTURE_LABEL } from '../engine/offseason.js';
import { TeamBadge, contrastColor } from './common.jsx';
import { playRevealSfx, playTeamSfx, isMuted, setMuted } from '../audio/sfx.js';
import PlayerCard from './PlayerCard.jsx';

// Higher tiers dwell longer so the class builds to its best signing.
const TIER_DELAY = { base: 560, silver: 700, gold: 880, diamond: 1120, rainbow: 1500 };

const REASON_ICON = { GRADUATED: '🎓', PRO: '🏀', TRANSFER: '🧳' };

// The bridge between seasons: who you lost, then who's walking in the door.
export default function OffseasonReveal() {
  const userTeamId = useGame((s) => s.userTeamId);
  const ts = useGame((s) => s.teamStates[s.userTeamId]);
  const seasonNumber = useGame((s) => s.seasonNumber);
  const offseason = useGame((s) => s.offseason);
  const dismiss = useGame((s) => s.dismissOffseason);

  const team = TEAMS_BY_ID[userTeamId];
  const departures = offseason?.departures ?? [];
  // Best signing last, so the reveal builds instead of peaking on card one.
  // Memoized because the reveal timer keys off it — without this an unrelated
  // re-render (toggling mute mid-reveal) would restart the pending card.
  const incoming = useMemo(
    () => [...(offseason?.incoming ?? [])].sort((a, b) => a.overall - b.overall),
    [offseason]
  );

  // Skip straight to the arrivals if nobody left (possible, if rare).
  const [act, setAct] = useState(departures.length ? 'out' : 'in');
  const [revealed, setRevealed] = useState(0);
  const [mute, setMute] = useState(isMuted());
  const sounded = useRef(0); // highest card index already sounded

  useEffect(() => {
    if (act !== 'in' || revealed >= incoming.length) return;
    const tier = overallTier(incoming[revealed].overall);
    const t = setTimeout(() => setRevealed((r) => r + 1), TIER_DELAY[tier]);
    return () => clearTimeout(t);
  }, [act, revealed, incoming]);

  // Sound the card that just flipped; its rarity picks the fanfare.
  useEffect(() => {
    if (act !== 'in' || revealed === 0 || revealed <= sounded.current) return;
    sounded.current = revealed;
    playRevealSfx(overallTier(incoming[revealed - 1].overall));
  }, [act, revealed, incoming]);

  const toggleMute = () => {
    const next = !mute;
    setMuted(next);
    setMute(next);
  };

  const startArrivals = () => {
    playTeamSfx();
    setAct('in');
  };

  const allShown = revealed >= incoming.length;

  return (
    <div className="reveal offseason" style={{ '--team': team.color, '--team-text': contrastColor(team.color) }}>
      <button
        className="btn btn--icon reveal__mute"
        onClick={toggleMute}
        title={mute ? 'Unmute reveal sounds' : 'Mute reveal sounds'}
      >
        {mute ? '🔇' : '🔊'}
      </button>

      <div className="reveal__inner">
        <div className="reveal__team is-shown">
          <TeamBadge teamId={userTeamId} size={64} />
          <div>
            <div className="reveal__eyebrow">Offseason</div>
            <h1 className="reveal__name">{team.name}</h1>
            <div className="reveal__conf">Season {seasonNumber} is next</div>
          </div>
        </div>

        {act === 'out' ? (
          <>
            <div className="reveal__rostertitle">Moving On</div>
            <div className="offseason__grid">
              {departures.map(({ player, reason }, i) => (
                <div
                  key={player.id}
                  className="offseason__leaving"
                  style={{ animationDelay: `${i * 130}ms` }}
                >
                  <div className={`offseason__reason offseason__reason--${reason.toLowerCase()}`}>
                    <span aria-hidden="true">{REASON_ICON[reason]}</span> {DEPARTURE_LABEL[reason]}
                  </div>
                  <PlayerCard player={player} layout="tile" stats={seasonAverages(player)} />
                </div>
              ))}
            </div>
            <div className="reveal__careernote">
              {departures.length} {departures.length === 1 ? 'player leaves' : 'players leave'} the program ·
              their final season with you
            </div>
            <button className="btn btn--primary btn--lg reveal__start" onClick={startArrivals}>
              Meet the New Class →
            </button>
          </>
        ) : (
          <>
            <div className="reveal__rostertitle">
              Incoming Class {incoming.some((p) => p.class !== 'FR') && <span className="muted">· with transfers</span>}
            </div>
            {incoming.length === 0 ? (
              <p className="muted">Everyone's back — no scholarships came open this year.</p>
            ) : (
              <div className="offseason__grid">
                {incoming.map((p, i) => {
                  if (i >= revealed) {
                    return <div key={p.id} className="reveal__placeholder">{p.position}</div>;
                  }
                  const tier = overallTier(p.overall);
                  return (
                    <div key={p.id} className={`reveal__cardwrap reveal-anim--${tier}`}>
                      <div className={`offseason__tag ${p.class === 'FR' ? '' : 'offseason__tag--transfer'}`}>
                        {p.class === 'FR' ? 'Recruit' : `Transfer · ${CLASS_LABEL[p.class]}`}
                      </div>
                      <PlayerCard player={p} layout="tile" stats={careerAverages(p)} />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="reveal__careernote">
              Freshmen have no college stats yet — what they become is up to the minutes you give them.
            </div>
            <button
              className="btn btn--primary btn--lg reveal__start"
              onClick={dismiss}
              style={{ opacity: allShown ? 1 : 0.35, pointerEvents: allShown ? 'auto' : 'none' }}
            >
              Start Season {seasonNumber} →
            </button>
          </>
        )}

        <ReturningStrip ts={ts} incoming={incoming} />
      </div>
    </div>
  );
}

// The point of the whole screen: the players you keep, a year older.
function ReturningStrip({ ts, incoming }) {
  const incomingIds = new Set(incoming.map((p) => p.id));
  const returning = ts.players
    .filter((p) => !incomingIds.has(p.id))
    .sort((a, b) => b.overall - a.overall);
  if (!returning.length) return null;

  return (
    <div className="offseason__returning">
      <div className="offseason__returningtitle">Returning · {returning.length}</div>
      <div className="offseason__pills">
        {returning.map((p) => {
          const delta = p.lastOverall != null ? p.overall - p.lastOverall : 0;
          return (
            <span key={p.id} className={`retpill retpill--${overallTier(p.overall)}`}>
              <span className="retpill__ovr">{p.overall}</span>
              <span className="retpill__name">{p.name}</span>
              <span className="retpill__cls">{p.class}</span>
              {delta !== 0 && (
                <span className={`retpill__delta ${delta > 0 ? 'is-up' : 'is-down'}`}>
                  {delta > 0 ? `▲${delta}` : `▼${-delta}`}
                </span>
              )}
            </span>
          );
        })}
      </div>
      <div className="offseason__devnote">
        A year of development — minutes played drive how far a player closes on his potential.
      </div>
    </div>
  );
}
