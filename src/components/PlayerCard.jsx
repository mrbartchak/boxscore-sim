import { overallTier, CLASS_LABEL } from '../engine/players.js';

// Player card whose color mirrors the overall tier.
// `stats` is a {ppg,apg,rpg} object, or null to show dashes.
// layout: 'wide' (reveal) or 'tile' (roster grid).
export default function PlayerCard({
  player,
  stats,
  isStar,
  onToggleStar,
  rootProps = {},
  className = '',
  layout = 'wide',
}) {
  const tier = overallTier(player.overall);
  const d = (v) => (stats ? v : '—');

  const star = onToggleStar && (
    <button
      className={`startoggle ${isStar ? 'on' : ''}`}
      onClick={onToggleStar}
      title={isStar ? 'Star player' : 'Make star player (usage boost)'}
      draggable={false}
    >
      ★
    </button>
  );

  if (layout === 'tile') {
    return (
      <div className={`pcard pcard--tile pcard--${tier} ${className}`} {...rootProps}>
        <div className="pcard__toprow">
          <span className="pcard__ovr pcard__ovr--sm">{player.overall}</span>
          <span className="pos">{player.position}</span>
          {star}
        </div>
        <div className="pcard__name">
          {player.name}
          {isStar && <span className="star pcard__star">★</span>}
        </div>
        <div className="pcard__meta"><span title={CLASS_LABEL[player.class]}>{CLASS_LABEL[player.class]}</span></div>
        <div className="pcard__stats pcard__stats--tile">
          <Stat label="PPG" value={d(stats?.ppg)} strong />
          <Stat label="APG" value={d(stats?.apg)} />
          <Stat label="REB" value={d(stats?.rpg)} />
        </div>
      </div>
    );
  }

  return (
    <div className={`pcard pcard--${tier} ${className}`} {...rootProps}>
      <div className="pcard__ovr">{player.overall}</div>
      <div className="pcard__main">
        <div className="pcard__name">
          {player.name}
          {isStar && <span className="star pcard__star">★</span>}
        </div>
        <div className="pcard__meta">
          <span className="pcard__pos">{player.position}</span>
          <span>·</span>
          <span title={CLASS_LABEL[player.class]}>{player.class}</span>
        </div>
      </div>
      <div className="pcard__stats">
        <Stat label="PPG" value={d(stats?.ppg)} strong />
        <Stat label="APG" value={d(stats?.apg)} />
        <Stat label="REB" value={d(stats?.rpg)} />
      </div>
    </div>
  );
}

function Stat({ label, value, strong }) {
  return (
    <div className="pcard__stat">
      <div className={`pcard__statval ${strong ? 'strong' : ''}`}>{value}</div>
      <div className="pcard__statlab">{label}</div>
    </div>
  );
}
