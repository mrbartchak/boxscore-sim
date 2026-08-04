import { useState } from 'react';
import { useGame } from '../store/useGame.js';
import { teamStrength, rotationMinutes } from '../engine/simulation.js';
import { seasonAverages } from '../engine/players.js';
import PlayerCard from './PlayerCard.jsx';

const BENCH_LABELS = ['6th Man', '7th Man', '8th Man', '9th Man', '10th Man'];

export default function RosterView() {
  const ts = useGame((s) => s.teamStates[s.userTeamId]);
  const setStar = useGame((s) => s.setStar);
  const swapLineup = useGame((s) => s.swapLineup);

  const [dragSlot, setDragSlot] = useState(null);
  const [overSlot, setOverSlot] = useState(null);

  const byId = Object.fromEntries(ts.players.map((p) => [p.id, p]));
  const mins = rotationMinutes(ts);
  const strength = teamStrength(ts);
  const starPlayer = byId[ts.rotation.starId];
  const hasSeason = ts.players.some((p) => p.gp > 0);

  const handleDrop = (slot) => (e) => {
    e.preventDefault();
    const from = dragSlot || e.dataTransfer.getData('text/plain');
    if (from && from !== slot) swapLineup(from, slot);
    setDragSlot(null);
    setOverSlot(null);
  };

  // Starter slots carry a position; bench slots don't, so reserves never show a
  // fit penalty (matching how teamStrength scores them).
  const renderSlot = (slot, label, player, slotPosition) => (
    <div
      key={slot}
      className={`slot ${overSlot === slot ? 'is-over' : ''} ${dragSlot === slot ? 'is-source' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (overSlot !== slot) setOverSlot(slot); }}
      onDragLeave={() => setOverSlot((s) => (s === slot ? null : s))}
      onDrop={handleDrop(slot)}
    >
      <div className="slot__label">
        <span className="slot__role">{label}</span>
        <span className="slot__min">{mins[player.id]}m</span>
      </div>
      <PlayerCard
        player={player}
        layout="tile"
        slotPosition={slotPosition}
        stats={seasonAverages(player)}
        isStar={player.id === ts.rotation.starId}
        onToggleStar={() => setStar(player.id)}
        className={dragSlot === slot ? 'is-dragging' : ''}
        rootProps={{
          draggable: true,
          onDragStart: (e) => { setDragSlot(slot); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', slot); },
          onDragEnd: () => { setDragSlot(null); setOverSlot(null); },
        }}
      />
    </div>
  );

  return (
    <div className="roster">
      <div className="roster__header">
        <div className="roster__summary">
          <SummaryStat label="Team Rating" value={Math.round(strength)} />
          <SummaryStat label="Star Player" value={starPlayer?.name.split(' ').slice(-1)[0]} sub={`${starPlayer?.overall} OVR`} />
          <SummaryStat label="Record" value={`${ts.record.w}-${ts.record.l}`} />
          <SummaryStat label="Conf" value={`${ts.confRecord.w}-${ts.confRecord.l}`} />
        </div>
        <p className="roster__hint">
          Drag any player onto another slot to swap them. Starters split the most minutes; bench minutes fall
          off from your 6th man down to your 10th. Tap ★ to set your star (a usage boost).
        </p>
        <p className="roster__hint">
          Players start out of position are rated for the spot they're filling, not their natural one — a
          Floor General slid to the two loses most of what makes him good. Sometimes it works the other way.
          Watch Team Rating as you shuffle.
        </p>
      </div>

      <section className="starters">
        <h3 className="starters__title">Starting Five</h3>
        <div className="lineup__row">
          {ts.rotation.starters.map((s) => renderSlot(`S:${s.pos}`, s.pos, byId[s.id], s.pos))}
        </div>
      </section>

      <section className="benchsec">
        <h3 className="benchsec__title">Bench</h3>
        <div className="lineup__row">
          {ts.rotation.bench.map((id, i) => renderSlot(`B:${i}`, BENCH_LABELS[i], byId[id]))}
        </div>
      </section>

      <p className="roster__note">
        {hasSeason
          ? 'Stats shown are this season\'s averages so far.'
          : 'Season stats appear once games are played (shown as dashes until then).'}
      </p>
    </div>
  );
}

function SummaryStat({ label, value, sub }) {
  return (
    <div className="sumstat">
      <div className="sumstat__value">{value}</div>
      <div className="sumstat__label">{label}</div>
      {sub && <div className="sumstat__hint">{sub}</div>}
    </div>
  );
}
