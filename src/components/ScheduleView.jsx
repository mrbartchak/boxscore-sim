import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import { formatDate } from '../engine/schedule.js';
import { wearsStar } from '../engine/players.js';
import { pollRanks } from '../engine/rankings.js';
import { TeamBadge, TeamName, RankChip, accentColor, useScoreRoll } from './common.jsx';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthOf(iso) {
  const d = new Date(iso + 'T00:00:00');
  return { year: d.getFullYear(), month: d.getMonth() };
}

export default function ScheduleView() {
  const userTeamId = useGame((s) => s.userTeamId);
  const games = useGame((s) => s.games);
  const currentDate = useGame((s) => s.currentDate);
  const simulating = useGame((s) => s.simulating);
  const simulateTo = useGame((s) => s.simulateTo);
  const simulateSeason = useGame((s) => s.simulateSeason);
  const simulateRegularSeason = useGame((s) => s.simulateRegularSeason);
  const stopSim = useGame((s) => s.stopSim);
  const teamStates = useGame((s) => s.teamStates);
  const reveal = useGame((s) => s.reveal);

  const ranks = useMemo(() => pollRanks(teamStates), [teamStates]);

  const [visible, setVisible] = useState(monthOf(currentDate));
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailDate, setDetailDate] = useState(currentDate);

  // Follow the current date's month while simulating.
  useEffect(() => {
    setVisible(monthOf(currentDate));
    setDetailDate(currentDate);
  }, [currentDate]);

  // Map of the user's games keyed by date.
  const userGamesByDate = useMemo(() => {
    const m = {};
    Object.values(games).forEach((g) => {
      if (g.homeId === userTeamId || g.awayId === userTeamId) m[g.date] = g;
    });
    return m;
  }, [games, userTeamId]);

  const userGames = useMemo(
    () => Object.values(userGamesByDate).sort((a, b) => a.date.localeCompare(b.date)),
    [userGamesByDate]
  );

  const nextGame = userGames.find((g) => !g.played && g.date > currentDate);

  // Play runs to the end of the season unless a specific date is picked.
  const handleSim = () => {
    if (selectedDate && selectedDate > currentDate) simulateTo(selectedDate);
    else simulateSeason();
    setSelectedDate(null);
  };

  return (
    <div className="schedule">
      <div className="schedule__main">
        <CalendarToolbar
          visible={visible}
          setVisible={setVisible}
          simulating={simulating}
          onSim={handleSim}
          onStop={stopSim}
          onSimNext={() => nextGame && simulateTo(nextGame.date)}
          onFinishSeason={simulateRegularSeason}
          hasNext={!!nextGame}
          selectedDate={selectedDate}
        />
        <Calendar
          visible={visible}
          currentDate={currentDate}
          userTeamId={userTeamId}
          userGamesByDate={userGamesByDate}
          reveal={reveal}
          ranks={ranks}
          selectedDate={selectedDate}
          detailDate={detailDate}
          onSelect={(date, hasFutureGame) => {
            setDetailDate(date);
            if (date > currentDate) setSelectedDate(date);
          }}
        />
      </div>

      <SidePanel
        userTeamId={userTeamId}
        userGames={userGames}
        detailDate={detailDate}
        userGamesByDate={userGamesByDate}
        currentDate={currentDate}
        revealing={!!reveal && reveal.date === detailDate}
      />
    </div>
  );
}

function CalendarToolbar({ visible, setVisible, simulating, onSim, onStop, onSimNext, onFinishSeason, hasNext, selectedDate }) {
  const step = (delta) => {
    let m = visible.month + delta;
    let y = visible.year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setVisible({ year: y, month: m });
  };
  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar__month">
        <button className="btn btn--icon" onClick={() => step(-1)}>‹</button>
        <h2>{MONTHS[visible.month]} {visible.year}</h2>
        <button className="btn btn--icon" onClick={() => step(1)}>›</button>
      </div>
      <div className="cal-toolbar__actions">
        {/* Play runs the calendar to the end of the season; while it's running
            you can stop, or skip the rest of the way in one jump. */}
        {simulating ? (
          <>
            <button className="btn btn--danger" onClick={onStop}>■ Stop</button>
            <button className="btn btn--strong" onClick={onFinishSeason} title="Jump to the end of the regular season">
              ⏩ Complete Regular Season
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onSimNext} disabled={!hasNext}>Next Game</button>
            <button className="btn btn--primary" onClick={onSim}>
              ▶ {selectedDate ? `Sim to ${formatDate(selectedDate)}` : 'Simulate'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Calendar({ visible, currentDate, userTeamId, userGamesByDate, reveal, ranks, selectedDate, detailDate, onSelect }) {
  const { year, month } = visible;
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(iso);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="calendar">
      <div className="calendar__dow">
        {DOW.map((d, i) => <div key={i} className="calendar__dowcell">{d}</div>)}
      </div>
      <div className="calendar__grid">
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} className="cal-cell cal-cell--empty" />;
          const g = userGamesByDate[iso];
          const isCurrent = iso === currentDate;
          const isSelected = iso === selectedDate;
          const isDetail = iso === detailDate;
          const day = Number(iso.slice(8));
          // Paint the whole day in the opponent's colors, so a glance down the
          // month reads as "who am I playing" without any squinting.
          const opp = g ? TEAMS_BY_ID[g.homeId === userTeamId ? g.awayId : g.homeId] : null;
          const won = g?.played && g.result.winnerId === userTeamId;
          // A win pops the whole day card once the digits land; a loss just sits there.
          const revealing = !!reveal && reveal.date === iso;
          return (
            <button
              key={i}
              style={opp ? { '--opp': opp.color, '--opp-ink': accentColor(opp.color) } : undefined}
              className={[
                'cal-cell',
                isCurrent && 'is-current',
                isSelected && 'is-selected',
                isDetail && !isCurrent && 'is-detail',
                g && 'has-game',
                opp && 'has-opp',
                g?.played && (won ? 'is-win' : 'is-loss'),
                revealing && 'is-revealing',
                revealing && won && 'is-revealwin',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelect(iso, !!g && !g.played)}
            >
              <span className="cal-cell__day">{day}</span>
              {g && <GameChip game={g} userTeamId={userTeamId} opp={opp} rank={ranks[opp?.id]} revealing={revealing} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GameChip({ game, userTeamId, opp, rank, revealing }) {
  const isHome = game.homeId === userTeamId;
  const prefix = game.neutral ? 'vs' : isHome ? 'vs' : '@';
  const r = game.result;
  const won = game.played && r.winnerId === userTeamId;

  return (
    <span className="cal-cell__game">
      <span className="cal-cell__opp">
        <span className="cal-cell__prefix">{prefix}</span>
        <span className="cal-cell__abbr">{opp ? opp.abbr : 'TBD'}</span>
        <RankChip rank={rank} className="rankchip--sm" />
      </span>
      {opp && <span className="cal-cell__team">{opp.name}</span>}
      {game.played && (
        revealing ? (
          <ScoreRoll mine={isHome ? r.homePts : r.awayPts} theirs={isHome ? r.awayPts : r.homePts} won={won} />
        ) : (
          <span className={`chip ${won ? 'chip--w' : 'chip--l'}`}>
            <span className="chip__wl">{won ? 'W' : 'L'}</span>
            <span className="chip__score">
              {isHome ? r.homePts : r.awayPts}-{isHome ? r.awayPts : r.homePts}
            </span>
          </span>
        )
      )}
    </span>
  );
}

// Counts both scores up to the final, then says whether you won.
function ScoreRoll({ mine, theirs, won }) {
  const { a, b, landed } = useScoreRoll(mine, theirs, true, won);
  const cls = landed ? `chip ${won ? 'chip--w' : 'chip--l'} chip--flash` : 'chip chip--rolling';
  return (
    <span className={cls}>
      <span className="chip__wl">{landed ? (won ? 'W' : 'L') : '·'}</span>
      <span className="chip__score">{a}-{b}</span>
    </span>
  );
}

function SidePanel({ userTeamId, userGames, detailDate, userGamesByDate, currentDate, revealing }) {
  const detailGame = userGamesByDate[detailDate];
  const recent = userGames.filter((g) => g.played).slice(-6).reverse();
  const upcoming = userGames.filter((g) => !g.played).slice(0, 6);

  return (
    <aside className="sidepanel">
      {/* This slot keeps its height whatever the selected day holds, so the
          panels underneath don't jump every time the cursor moves off a game. */}
      <DayPanel
        game={detailGame}
        date={detailDate}
        userTeamId={userTeamId}
        nextGame={upcoming[0]}
        currentDate={currentDate}
        revealing={revealing}
      />

      <section className="panel">
        <h3 className="panel__title">Upcoming</h3>
        {upcoming.length === 0 && <p className="muted">No games scheduled.</p>}
        {upcoming.map((g) => (
          <GameRow key={g.id} game={g} userTeamId={userTeamId} />
        ))}
      </section>

      <section className="panel">
        <h3 className="panel__title">Recent Results</h3>
        {recent.length === 0 && <p className="muted">Season hasn't tipped off yet.</p>}
        {recent.map((g) => (
          <GameRow key={g.id} game={g} userTeamId={userTeamId} />
        ))}
      </section>
    </aside>
  );
}

function GameRow({ game, userTeamId }) {
  const isHome = game.homeId === userTeamId;
  const oppId = isHome ? game.awayId : game.homeId;
  const won = game.played && game.result.winnerId === userTeamId;
  return (
    <div className="gamerow">
      <span className="gamerow__date">{formatDate(game.date)}</span>
      <span className="gamerow__loc">{game.neutral ? 'N' : isHome ? 'vs' : '@'}</span>
      {oppId ? <TeamBadge teamId={oppId} size={22} /> : <span className="muted">TBD</span>}
      <span className="gamerow__opp"><TeamName teamId={oppId} /></span>
      {game.played ? (
        <span className={`pill ${won ? 'pill--w' : 'pill--l'}`}>
          {won ? 'W' : 'L'} {isHome ? game.result.homePts : game.result.awayPts}-{isHome ? game.result.awayPts : game.result.homePts}
        </span>
      ) : (
        <span className="pill pill--muted">
          {game.phase !== 'REGULAR' ? 'Tourney' : game.conference ? 'Conf' : 'Non-conf'}
        </span>
      )}
    </div>
  );
}

// The day slot: a box score if the selected day has a finished game, a preview
// if it has one coming, and the next game up if it has neither.
function DayPanel({ game, date, userTeamId, nextGame, currentDate, revealing }) {
  if (game && game.played) return <BoxScore game={game} userTeamId={userTeamId} revealing={revealing} />;

  const upcoming = game || nextGame;
  const isHome = upcoming && upcoming.homeId === userTeamId;
  const oppId = upcoming && (isHome ? upcoming.awayId : upcoming.homeId);
  const opp = oppId ? TEAMS_BY_ID[oppId] : null;

  return (
    <section className="panel daypanel">
      <div className="daypanel__head">
        <span className="daypanel__date">{formatDate(date)}</span>
        <span className="muted small">
          {game ? 'Scheduled' : date > currentDate ? 'No game' : 'No game played'}
        </span>
      </div>

      {upcoming ? (
        <div className="daypanel__preview">
          <div className="daypanel__label">{game ? 'On this date' : 'Next up'}</div>
          <div className="daypanel__matchup">
            <span className="daypanel__loc">{upcoming.neutral ? 'vs' : isHome ? 'vs' : '@'}</span>
            <TeamBadge teamId={oppId} size={40} />
            <div className="daypanel__opp">
              <div className="daypanel__oppname">{opp?.name}</div>
              <div className="muted small">{opp?.conference}</div>
            </div>
          </div>
          <div className="daypanel__when">
            {formatDate(upcoming.date)} ·{' '}
            {upcoming.phase !== 'REGULAR' ? 'Tournament' : upcoming.conference ? 'Conference game' : 'Non-conference'}
          </div>
        </div>
      ) : (
        <p className="muted daypanel__empty">Nothing left on the schedule.</p>
      )}
    </section>
  );
}

function BoxScore({ game, userTeamId, revealing }) {
  const isHome = game.homeId === userTeamId;
  const oppId = isHome ? game.awayId : game.homeId;
  const box = isHome ? game.result.homeBox : game.result.awayBox;
  const my = isHome ? game.result.homePts : game.result.awayPts;
  const their = isHome ? game.result.awayPts : game.result.homePts;
  const won = game.result.winnerId === userTeamId;

  const ts = useGame((s) => s.teamStates[userTeamId]);
  const byId = Object.fromEntries(ts.players.map((p) => [p.id, p]));
  const rows = [...box].sort((a, b) => b.pts - a.pts).filter((b) => b.min > 0);

  return (
    <section className="panel boxscore">
      {/* The panel would otherwise print the final while the calendar chip is
          still spinning for it. */}
      <div className={`boxscore__head ${revealing ? 'is-held' : ''}`}>
        <span className={`pill ${won ? 'pill--w' : 'pill--l'}`}>{won ? 'WIN' : 'LOSS'}</span>
        <span className="boxscore__score">{my}–{their}</span>
        <span className="boxscore__opp">{game.neutral ? 'vs' : isHome ? 'vs' : '@'} <TeamName teamId={oppId} /></span>
      </div>
      <table className="statgrid">
        <thead>
          <tr><th>Player</th><th>MIN</th><th>PTS</th><th>AST</th><th>REB</th></tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const p = byId[b.playerId];
            return (
              <tr key={b.playerId}>
                <td className="statgrid__name">
                  {p?.name} {p && wearsStar(p, ts.rotation.starId) && <span className="star">★</span>}
                </td>
                <td>{b.min}</td>
                <td className="strong">{b.pts}</td>
                <td>{b.ast}</td>
                <td>{b.reb}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
