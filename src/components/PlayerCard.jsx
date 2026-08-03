import { playerAverages, overallTier, CLASS_LABEL } from '../engine/players.js';

// Wide player card whose color mirrors the player's overall tier.
export default function PlayerCard({ player, isStar, onToggleStar, rootProps = {}, className = '' }) {
  const tier = overallTier(player.overall);
  const avg = playerAverages(player);

  return (
    <div className={`pcard pcard--${tier} ${className}`} {...rootProps}>
      <div className="pcard__ovr">
        <span className="pcard__ovrnum">{player.overall}</span>
      </div>

      <div className="pcard__main">
        <div className="pcard__name">
          {player.name}
          {isStar && <span className="star pcard__star">★</span>}
        </div>
        <div className="pcard__meta">
          <span className="pcard__pos">{player.position}</span>
          <span className="pcard__dot">·</span>
          <span title={CLASS_LABEL[player.class]}>{player.class}</span>
        </div>
      </div>

      <div className="pcard__stats">
        <Stat label="PPG" value={avg.ppg} strong />
        <Stat label="APG" value={avg.apg} />
        <Stat label="REB" value={avg.rpg} />
      </div>

      {onToggleStar && (
        <button
          className={`pcard__starbtn ${isStar ? 'on' : ''}`}
          onClick={onToggleStar}
          title={isStar ? 'Star player' : 'Make star player (usage boost)'}
          draggable={false}
        >
          ★
        </button>
      )}
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
