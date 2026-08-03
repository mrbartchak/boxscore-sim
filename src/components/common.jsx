import { TEAMS_BY_ID } from '../data/teams.js';

// Choose readable text color for a given background hex.
export function contrastColor(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111' : '#fff';
}

// Colored team badge showing the abbreviation.
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
      }}
      title={team.name}
    >
      {seed != null && <span className="badge__seed">{seed}</span>}
      {team.abbr}
    </div>
  );
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
