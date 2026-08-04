import { overallTier, CLASS_LABEL, archetypeOf, effectiveOverall } from '../engine/players.js';

// Player card whose color mirrors the overall tier.
// `stats` is a {ppg,apg,rpg} object, or null to show dashes.
// layout: 'wide' (reveal) or 'tile' (roster grid).
// `slotPosition` is the lineup spot he's filling; when it isn't his natural
// position the card shows what he's actually worth there.
//
// The six underlying attributes are deliberately NOT displayed. They drive
// everything, but working out which archetypes fit together is the game.
export default function PlayerCard({
  player,
  stats,
  isStar,
  onToggleStar,
  rootProps = {},
  className = '',
  layout = 'wide',
  slotPosition,
}) {
  const tier = overallTier(player.overall);
  const arch = archetypeOf(player);
  const d = (v) => (stats ? v : '—');

  // Tier colour and the big number stay tied to his natural rating, so a card
  // doesn't change identity mid-drag; the fit badge carries the consequence.
  const fit = effectiveOverall(player, slotPosition);
  const fitDelta = fit - player.overall;

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

  const fitBadge = fitDelta !== 0 && (
    <span
      className={`pcard__fit ${fitDelta > 0 ? 'is-up' : 'is-down'}`}
      title={
        `${player.name} is a natural ${player.position}. Playing ${slotPosition}, ` +
        `he's worth ${fit} — ${fitDelta > 0 ? 'a better' : 'a worse'} fit by ` +
        `${Math.abs(fitDelta)}.`
      }
    >
      {fit} at {slotPosition}
    </span>
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
        <div className="pcard__archrow">
          <span className="pcard__arch" title={arch.blurb}>{arch.label}</span>
          {fitBadge}
        </div>
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
        <div className="pcard__archrow">
          <span className="pcard__arch" title={arch.blurb}>{arch.label}</span>
          {fitBadge}
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
