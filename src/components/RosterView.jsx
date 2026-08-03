import { useState } from 'react';
import { useGame } from '../store/useGame.js';
import { teamStrength, rotationMinutes } from '../engine/simulation.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import PlayerCard from './PlayerCard.jsx';

const BENCH_LABELS = ['6th Man', '7th Man', '8th Man', '9th Man', '10th Man'];

export default function RosterView() {
  const userTeamId = useGame((s) => s.userTeamId);
  const ts = useGame((s) => s.teamStates[s.userTeamId]);
  const setStar = useGame((s) => s.setStar);
  const swapLineup = useGame((s) => s.swapLineup);

  const [dragSlot, setDragSlot] = useState(null);
  const [overSlot, setOverSlot] = useState(null);

  const byId = Object.fromEntries(ts.players.map((p) => [p.id, p]));
  const mins = rotationMinutes(ts);
  const strength = teamStrength(ts);
  const starPlayer = byId[ts.rotation.starId];

  const handleDrop = (slot) => (e) => {
    e.preventDefault();
    const from = dragSlot || e.dataTransfer.getData('text/plain');
    if (from && from !== slot) swapLineup(from, slot);
    setDragSlot(null);
    setOverSlot(null);
  };

  const slotProps = (slot) => ({
    onDragOver: (e) => { e.preventDefault(); if (overSlot !== slot) setOverSlot(slot); },
    onDragLeave: () => setOverSlot((s) => (s === slot ? null : s)),
    onDrop: handleDrop(slot),
  });

  const cardDragProps = (slot) => ({
    draggable: true,
    onDragStart: (e) => { setDragSlot(slot); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', slot); },
    onDragEnd: () => { setDragSlot(null); setOverSlot(null); },
  });

  const renderSlot = (slot, label, player) => (
    <div
      className={`slot ${overSlot === slot ? 'is-over' : ''} ${dragSlot === slot ? 'is-source' : ''}`}
      {...slotProps(slot)}
    >
      <div className="slot__label">
        <span className="slot__role">{label}</span>
        <span className="slot__min">{mins[player.id]} min</span>
      </div>
      <PlayerCard
        player={player}
        isStar={player.id === ts.rotation.starId}
        onToggleStar={() => setStar(player.id)}
        rootProps={cardDragProps(slot)}
        className={dragSlot === slot ? 'is-dragging' : ''}
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
      </div>

      <div className="lineup">
        <section className="lineup__col">
          <h3 className="lineup__title">Starters</h3>
          <div className="lineup__slots">
            {ts.rotation.starters.map((s) => renderSlot(`S:${s.pos}`, s.pos, byId[s.id]))}
          </div>
        </section>

        <section className="lineup__col">
          <h3 className="lineup__title">Bench</h3>
          <div className="lineup__slots">
            {ts.rotation.bench.map((id, i) => renderSlot(`B:${i}`, BENCH_LABELS[i], byId[id]))}
          </div>
        </section>
      </div>

      <p className="roster__note">
        {ts.players[0].gp > 0
          ? 'Stats shown are season averages for your team.'
          : 'Stats shown are projected per-game production until the season tips off.'}
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
