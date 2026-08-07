import { useEffect, useState } from 'react';
import { TEAMS_BY_ID } from '../data/teams.js';
import { REVEAL_ROLL_MS } from '../store/useGame.js';
import { playResultSfx } from '../audio/sfx.js';

// Both scores climb from zero to their finals together, easing out so they slow
// into the number rather than snapping to it. `landed` is what the W/L flash
// waits on — the result is the payoff, so nothing may give it away early, and
// the win/loss sting fires on the same frame the digits stop.
export function useScoreRoll(a, b, active, won) {
  const [state, setState] = useState({ a, b, landed: !active });

  useEffect(() => {
    if (!active) {
      setState({ a, b, landed: true });
      return;
    }
    let raf;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / REVEAL_ROLL_MS);
      if (p >= 1) {
        setState({ a, b, landed: true });
        // One chain of frames per activation (the cleanup cancels any other),
        // so this fires exactly once per game.
        playResultSfx(won);
        return;
      }
      const eased = 1 - Math.pow(1 - p, 3);
      setState({ a: Math.round(a * eased), b: Math.round(b * eased), landed: false });
      raf = requestAnimationFrame(step);
    };
    setState({ a: 0, b: 0, landed: false });
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, active]);

  return state;
}

const rgb = (hex) => {
  const c = hex.replace('#', '');
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
};

// Perceived brightness, 0-1.
function luminance(hex) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Choose readable text color for a given background hex.
export function contrastColor(hex) {
  return luminance(hex) > 0.6 ? '#111' : '#fff';
}

// A lightened version of a team's color, for anything drawn AS the color rather
// than filled with it — text, borders, the band across a calendar day.
//
// Half of Division I wears navy or black, which on this app's near-black
// background is invisible: Duke's #001A57 headline reads as a smudge. Rather
// than override those programs' colors, this keeps the hue and pushes the
// brightness up until it separates from the background. Fills still use the real
// color, so a team still looks like itself — only the ink gets brighter.
export function accentColor(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (l >= 0.42) return hex; // already bright enough to read

  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h *= 60;
  if (h < 0) h += 360;
  // Near-greys (black-clad programs) have no hue to preserve, so they land on a
  // light neutral instead of an invented color.
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return `hsl(${Math.round(h)} ${Math.round(Math.min(s, 0.85) * 100)}% 64%)`;
}

// Colored team badge showing the abbreviation. Dark badges get a bright rim in
// the same hue so they don't dissolve into the page.
export function TeamBadge({ teamId, size = 34, seed }) {
  const team = TEAMS_BY_ID[teamId];
  if (!team) return <div className="badge badge--empty" style={{ width: size, height: size }} />;
  return (
    <div
      className="badge"
      style={{
        width: size,
        height: size,
        background: team.color,
        color: contrastColor(team.color),
        fontSize: size * 0.3,
        '--rim': accentColor(team.color),
      }}
      title={`${team.name} · ${team.conference}`}
    >
      {seed != null && <span className="badge__seed">{seed}</span>}
      {team.abbr}
    </div>
  );
}

// Poll ranking, shown only for the top 25 — everyone else is simply unranked.
export function RankChip({ rank, className = '' }) {
  if (!rank) return null;
  return <span className={`rankchip ${className}`}>{rank}</span>;
}

export function TeamName({ teamId, showConf = false }) {
  const team = TEAMS_BY_ID[teamId];
  if (!team) return <span className="muted">TBD</span>;
  return (
    <span className="teamname">
      {team.name}
      {showConf && <span className="teamname__conf"> · {team.conference}</span>}
    </span>
  );
}

// Prestige rendered as a 5-tier strength meter.
export function PrestigeMeter({ prestige }) {
  const filled = Math.round((prestige / 100) * 5);
  return (
    <span className="prestige" title={`Prestige ${prestige}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`prestige__pip ${i < filled ? 'on' : ''}`} />
      ))}
    </span>
  );
}

export function record(ts) {
  return `${ts.record.w}-${ts.record.l}`;
}
