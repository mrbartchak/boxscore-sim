import { useState, useEffect, useMemo, useRef } from 'react';
import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import { careerAverages, overallTier, CLASS_LABEL } from '../engine/players.js';
import { DEPARTURE_LABEL } from '../engine/offseason.js';
import { TeamBadge, contrastColor, accentColor } from './common.jsx';
import { playRevealSfx, playTeamSfx, isMuted, setMuted } from '../audio/sfx.js';
import PlayerCard from './PlayerCard.jsx';
import RosterView from './RosterView.jsx';

// Pace of the walk down the roster in act one, and of the recruit cards in act
// two — higher tiers dwell longer so the class builds to its best signing.
// Act one is deliberately unhurried: each card is a small verdict on a player
// you coached all season, and it doesn't land if they flick past.
const ROW_DELAY = 1050;
const TIER_DELAY = { base: 560, silver: 700, gold: 880, diamond: 1120, rainbow: 1500 };

const REASON_ICON = { GRADUATED: '🎓', PRO: '🏀', TRANSFER: '🧳' };

// The bridge between seasons, in three acts: what a year did to the team you
// had, who is replacing the players you lost, and the roster you'll coach.
export default function OffseasonReveal() {
  const userTeamId = useGame((s) => s.userTeamId);
  const seasonNumber = useGame((s) => s.seasonNumber);
  const offseason = useGame((s) => s.offseason);
  const dismiss = useGame((s) => s.dismissOffseason);

  const team = TEAMS_BY_ID[userTeamId];
  const report = offseason?.report ?? [];
  // Best signing last, so the reveal builds instead of peaking on card one.
  const incoming = useMemo(
    () => [...(offseason?.incoming ?? [])].sort((a, b) => a.overall - b.overall),
    [offseason]
  );

  const [act, setAct] = useState('development');
  const [mute, setMute] = useState(isMuted());

  const toggleMute = () => {
    const next = !mute;
    setMuted(next);
    setMute(next);
  };

  return (
    <div
      className="reveal offseason"
      style={{
        '--team': team.color,
        '--team-accent': accentColor(team.color),
        '--team-text': contrastColor(team.color),
      }}
    >
      <button
        className="btn btn--icon reveal__mute"
        onClick={toggleMute}
        title={mute ? 'Unmute reveal sounds' : 'Mute reveal sounds'}
      >
        {mute ? '🔇' : '🔊'}
      </button>

      <div className={`reveal__inner ${act === 'roster' ? 'reveal__inner--wide' : ''}`}>
        <div className="reveal__team is-shown">
          <TeamBadge teamId={userTeamId} size={64} />
          <div>
            <div className="reveal__eyebrow">Offseason</div>
            <h1 className="reveal__name">{team.name}</h1>
            <div className="reveal__conf">Season {seasonNumber} is next</div>
          </div>
        </div>

        <ol className="offseason__steps">
          {[
            ['development', 'Your Team'],
            ['recruits', 'Incoming'],
            ['roster', 'Roster'],
          ].map(([id, label], i) => (
            <li key={id} className={`offseason__step ${act === id ? 'is-active' : ''}`}>
              <span className="offseason__stepnum">{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {act === 'development' && (
          <DevelopmentAct report={report} onDone={() => setAct('recruits')} />
        )}
        {act === 'recruits' && (
          <RecruitAct incoming={incoming} onDone={() => setAct('roster')} />
        )}
        {act === 'roster' && (
          <>
            <div className="reveal__rostertitle">Your Roster · Season {seasonNumber}</div>
            <p className="offseason__rosternote">
              Set your lineup before tip-off. Minutes drive development, so the rotation you pick
              now is the team you'll have in three years.
            </p>
            <div className="offseason__rosterwrap">
              <RosterView />
            </div>
            <button className="btn btn--primary btn--lg reveal__start" onClick={dismiss}>
              Start Season {seasonNumber} →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Act one: what a year did to the team you had ----------
//
// The whole roster is on screen from the first frame, exactly as it finished the
// season. Then it resolves one player at a time, top of the depth chart down:
// the rating flips, the card jumps in proportion to the jump it just made, and
// anyone leaving fades out under the reason they're gone.
function DevelopmentAct({ report, onDone }) {
  const [step, setStep] = useState(0);
  const sounded = useRef(0);

  useEffect(() => {
    if (step >= report.length) return;
    const t = setTimeout(() => setStep((n) => n + 1), ROW_DELAY);
    return () => clearTimeout(t);
  }, [step, report.length]);

  // Crossing into a new tier is the moment worth hearing; a big jump inside one
  // gets a smaller cue, and everything else passes quietly.
  useEffect(() => {
    if (step === 0 || step <= sounded.current) return;
    sounded.current = step;
    const row = report[step - 1];
    if (!row?.after) return;
    const gain = row.after.overall - row.before.overall;
    const tierBefore = overallTier(row.before.overall);
    const tierAfter = overallTier(row.after.overall);
    if (gain > 0 && tierAfter !== tierBefore) playRevealSfx(tierAfter);
    else if (gain >= 4) playRevealSfx('silver');
  }, [step, report]);

  const done = step >= report.length;
  const left = report.filter((r) => r.reason).length;

  return (
    <>
      <div className="reveal__rostertitle">Last Season's Roster · A Year Later</div>
      <div className="offseason__grid offseason__grid--dev">
        {report.map((row, i) => (
          <DevelopmentCard key={row.before.id} row={row} resolved={i < step} />
        ))}
      </div>
      <div className="reveal__careernote">
        {done ? `${left} leaving · ${report.length - left} returning` : 'Reviewing the roster…'}
      </div>
      <div className="offseason__actions">
        {!done && (
          <button className="btn" onClick={() => setStep(report.length)}>Skip ahead</button>
        )}
        <button
          className="btn btn--primary btn--lg"
          onClick={onDone}
          style={{ opacity: done ? 1 : 0.35, pointerEvents: done ? 'auto' : 'none' }}
        >
          Meet the New Class →
        </button>
      </div>
    </>
  );
}

function DevelopmentCard({ row, resolved }) {
  const { before, after, reason } = row;
  const gain = after ? after.overall - before.overall : 0;
  // Show who he was until his turn comes round, then who he became.
  const player = resolved && after ? after : before;

  const tierBefore = overallTier(before.overall);
  const tierAfter = after ? overallTier(after.overall) : tierBefore;
  const tierUp = resolved && gain > 0 && tierAfter !== tierBefore;

  const state = !resolved ? 'pending' : reason ? 'out' : gain > 0 ? 'up' : gain < 0 ? 'down' : 'flat';
  // Bigger jumps pop harder; a tier crossing gets the full card animation.
  const pop = 1 + Math.min(Math.abs(gain), 8) * 0.035;

  return (
    <div
      className={[
        'devcard',
        `devcard--${state}`,
        resolved && 'is-resolved',
        tierUp && 'devcard--tierup',
        tierUp && `reveal-anim--${tierAfter}`,
      ].filter(Boolean).join(' ')}
      style={{ '--pop': pop }}
    >
      <div className={`devcard__tag ${reason ? `devcard__tag--${reason.toLowerCase()}` : ''}`}>
        {resolved && reason ? (
          <>
            <span aria-hidden="true">{REASON_ICON[reason]}</span> {DEPARTURE_LABEL[reason]}
          </>
        ) : (
          CLASS_LABEL[player.class]
        )}
      </div>

      <div className="devcard__body">
        <PlayerCard player={player} layout="tile" stats={careerAverages(player)} />
        {/* The number the whole screen exists to show, thrown over the card. */}
        {resolved && !reason && gain !== 0 && (
          <span className={`devcard__jump is-${state}`}>
            {gain > 0 ? `+${gain}` : gain}
          </span>
        )}
      </div>

      <div className="devcard__foot">
        {!resolved ? (
          <span className="devcard__waiting">{before.overall} OVR</span>
        ) : reason ? (
          <span className="devcard__gone">Left at {before.overall} OVR</span>
        ) : (
          <>
            <span className="devcard__from">{before.overall}</span>
            <span className="devcard__arrow">→</span>
            <span className={`devcard__delta is-${state}`}>
              {gain > 0 ? `▲ ${gain}` : gain < 0 ? `▼ ${-gain}` : 'no change'}
            </span>
            {tierUp && <span className="devcard__tierup">{tierAfter}!</span>}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Act two: who's walking in the door ----------
function RecruitAct({ incoming, onDone }) {
  const [revealed, setRevealed] = useState(0);
  const sounded = useRef(0);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    playTeamSfx();
  }, []);

  useEffect(() => {
    if (revealed >= incoming.length) return;
    const tier = overallTier(incoming[revealed].overall);
    const t = setTimeout(() => setRevealed((r) => r + 1), TIER_DELAY[tier]);
    return () => clearTimeout(t);
  }, [revealed, incoming]);

  useEffect(() => {
    if (revealed === 0 || revealed <= sounded.current) return;
    sounded.current = revealed;
    playRevealSfx(overallTier(incoming[revealed - 1].overall));
  }, [revealed, incoming]);

  const done = revealed >= incoming.length;

  return (
    <>
      <div className="reveal__rostertitle">
        Incoming Class
        {incoming.some((p) => p.class !== 'FR') && <span className="muted"> · with transfers</span>}
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
        onClick={onDone}
        style={{ opacity: done ? 1 : 0.35, pointerEvents: done ? 'auto' : 'none' }}
      >
        See Your Roster →
      </button>
    </>
  );
}
