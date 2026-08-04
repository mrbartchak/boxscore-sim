import { overallTier, CLASS_LABEL, archetypeOf } from '../engine/players.js';
import { ATTRIBUTES, ATTR_SHORT, ATTR_LABEL } from '../data/archetypes.js';

// Player card whose color mirrors the overall tier.
// `stats` is a {ppg,apg,rpg} object, or null to show dashes.
// layout: 'wide' (reveal) or 'tile' (roster grid).
// `showAttributes` adds the six-attribute breakdown (roster view only — the
// reveal stays about the name, the tier and the archetype).
export default function PlayerCard({
  player,
  stats,
  isStar,
  onToggleStar,
  rootProps = {},
  className = '',
  layout = 'wide',
  showAttributes = false,
}) {
  const tier = overallTier(player.overall);
  const arch = archetypeOf(player);
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

  const attributes = showAttributes && (
    <div className="pcard__attrs">
      {ATTRIBUTES.map((a) => (
        <div className="pcard__attr" key={a} title={`${ATTR_LABEL[a]}: ${player.attrs[a]}`}>
          <div className="pcard__attrtop">
            <span className="pcard__attrlab">{ATTR_SHORT[a]}</span>
            <span className="pcard__attrval">{player.attrs[a]}</span>
          </div>
          <div className="pcard__attrbar">
            {/* 25 is the attribute floor, so scale from there or everything looks half-full */}
            <i style={{ width: `${Math.max(0, ((player.attrs[a] - 25) / 74) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );

  if (layout === 'tile') {
    return (
      <div className={`pcard pcard--tile pcard--${tier} ${className}`} {...rootProps}>
        <div className="pcard__toprow">
          <span className="pcard__ovr pcard__ovr--sm">{player.overall}</span>
          <span className="pos">{player.position}</span>
          <span className="pcard__cls" title={CLASS_LABEL[player.class]}>{player.class}</span>
          {star}
        </div>
        <div className="pcard__name">
          {player.name}
          {isStar && <span className="star pcard__star">★</span>}
        </div>
        <div className="pcard__arch" title={arch.blurb}>{arch.label}</div>
        {attributes}
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
        <div className="pcard__arch" title={arch.blurb}>{arch.label}</div>
      </div>
      {attributes}
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
