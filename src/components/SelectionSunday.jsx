import { useEffect, useState } from 'react';
import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import { REGIONS } from '../engine/tournament.js';
import { TeamBadge, contrastColor, accentColor } from './common.jsx';
import { playRevealSfx, playTeamSfx } from '../audio/sfx.js';

// The bracket goes up one piece at a time: the field, then your region, then the
// number next to your name. Waiting for that number is the whole point of the
// day, so it lands last and on its own.
const BEATS = { field: 1500, region: 1400 };

export default function SelectionSunday({ onEnter }) {
  const userTeamId = useGame((s) => s.userTeamId);
  const nationalField = useGame((s) => s.nationalField) || [];
  const games = useGame((s) => s.games);
  const skipToOffseason = useGame((s) => s.skipToOffseason);

  const team = TEAMS_BY_ID[userTeamId];
  const madeIt = nationalField.includes(userTeamId);
  const overallSeed = madeIt ? nationalField.indexOf(userTeamId) + 1 : null;

  const firstGame = Object.values(games).find(
    (g) => g.phase === 'NATIONAL' && g.round === 0 &&
      (g.homeId === userTeamId || g.awayId === userTeamId)
  );
  const region = firstGame ? REGIONS[firstGame.region] : null;
  const seed = firstGame
    ? (firstGame.homeId === userTeamId ? firstGame.seedHome : firstGame.seedAway)
    : null;
  const oppId = firstGame
    ? (firstGame.homeId === userTeamId ? firstGame.awayId : firstGame.homeId)
    : null;
  const oppSeed = firstGame
    ? (firstGame.homeId === userTeamId ? firstGame.seedAway : firstGame.seedHome)
    : null;

  // waiting → (in the field ? region → seed : out)
  const [act, setAct] = useState('waiting');

  useEffect(() => {
    if (act === 'waiting') {
      const t = setTimeout(() => setAct(madeIt ? 'region' : 'out'), BEATS.field);
      return () => clearTimeout(t);
    }
    if (act === 'region') {
      playTeamSfx();
      const t = setTimeout(() => setAct('seed'), BEATS.region);
      return () => clearTimeout(t);
    }
    if (act === 'seed') {
      // The better the seed, the bigger the noise it makes.
      playRevealSfx(seed <= 2 ? 'rainbow' : seed <= 4 ? 'diamond' : seed <= 8 ? 'gold' : 'silver');
    }
  }, [act, madeIt, seed]);

  return (
    <div
      className="selection"
      style={{
        '--team': team.color,
        '--team-accent': accentColor(team.color),
        '--team-text': contrastColor(team.color),
      }}
    >
      <div className="selection__card">
        <div className={`selection__logo ${act === 'waiting' ? 'is-waiting' : ''}`}>🏀</div>
        <h2>Selection Sunday</h2>

        {act === 'waiting' && (
          <p className="selection__waiting">The committee is announcing the 64-team field…</p>
        )}

        {act === 'out' && (
          <div className="selection__reveal">
            <p className="selection__out">{team.name} missed the field.</p>
            <p className="muted">
              No dance this year. You can watch it play out, or go straight to next season's roster.
            </p>
            <div className="selection__actions">
              <button className="btn btn--lg" onClick={onEnter}>Watch the Tournament</button>
              <button className="btn btn--primary btn--lg" onClick={skipToOffseason}>
                Skip to Offseason →
              </button>
            </div>
          </div>
        )}

        {(act === 'region' || act === 'seed') && (
          <div className="selection__reveal">
            <p className="selection__in">You're in the Big Dance!</p>
            <div className="selection__region-big">{region} Region</div>

            {act === 'seed' ? (
              <>
                <div className="seedcard">
                  <div className="seedcard__num">{seed}</div>
                  <div className="seedcard__side">
                    <TeamBadge teamId={userTeamId} size={44} />
                    <div>
                      <div className="seedcard__team">{team.name}</div>
                      <div className="seedcard__meta">No. {overallSeed} overall</div>
                    </div>
                  </div>
                </div>
                <div className="selection__opener">
                  Opens against <strong>No. {oppSeed} {TEAMS_BY_ID[oppId]?.name ?? 'TBD'}</strong>
                </div>
                <button className="btn btn--primary btn--lg" onClick={onEnter}>
                  Enter the Tournament →
                </button>
              </>
            ) : (
              <div className="seedcard seedcard--pending">
                <div className="seedcard__num">?</div>
                <div className="seedcard__side muted">Seeding…</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
