import { useState } from 'react';
import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import { conferenceStandings } from '../engine/rankings.js';
import {
  NATIONAL_ROUND_NAMES,
  REGIONS,
  confRoundNames,
  confTourneyFormat,
  formatRounds,
  seedEntryRound,
} from '../engine/tournament.js';
import { fieldSize } from '../data/conferenceTournaments.js';
import { TeamBadge, useScoreRoll } from './common.jsx';
import { ORD } from './Interstitials.jsx';
import SelectionSunday from './SelectionSunday.jsx';

// ---------- Simulation controls shared by both tournament screens ----------
function TourneyControls({ complete }) {
  const simulating = useGame((s) => s.simulating);
  const simulateRound = useGame((s) => s.simulateRound);
  const simulateTournament = useGame((s) => s.simulateTournament);
  const stopSim = useGame((s) => s.stopSim);

  if (complete) return <span className="tctl__done">Tournament complete</span>;
  return (
    <div className="tctl">
      {simulating ? (
        <button className="btn btn--danger" onClick={stopSim}>■ Stop</button>
      ) : (
        <>
          <button className="btn" onClick={simulateRound}>▶ Simulate Round</button>
          <button className="btn btn--primary" onClick={simulateTournament}>▶▶ Simulate Tournament</button>
        </>
      )}
    </div>
  );
}

// A 64-team bracket is taller than the window, and the two bottom regions sit
// well below the controls at the top — so the controls come along, docked to the
// bottom of the viewport, with a jump straight to whichever game is yours.
function TourneyDock({ complete, myGameId }) {
  const jump = () => {
    const el = myGameId && document.getElementById(`bg-${myGameId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  return (
    <div className="tdock">
      {myGameId && (
        <button className="btn tdock__find" onClick={jump} title="Scroll to your matchup">
          ◎ My Game
        </button>
      )}
      <TourneyControls complete={complete} />
    </div>
  );
}

// The user's live game: the one still to be played, or the last one they played.
function userGameId(games, userTeamId) {
  const mine = games
    .filter((g) => g.homeId === userTeamId || g.awayId === userTeamId)
    .sort((a, b) => a.round - b.round);
  if (!mine.length) return null;
  return (mine.find((g) => !g.played) ?? mine[mine.length - 1]).id;
}

// Where the user stands in a bracket, from their own games. Returns the line
// the status bar prints plus a state class — the thing that was hardest to see.
function userStatus(games, userTeamId, roundNames) {
  const mine = games
    .filter((g) => g.homeId === userTeamId || g.awayId === userTeamId)
    .sort((a, b) => a.round - b.round);
  if (!mine.length) return null;

  const played = mine.filter((g) => g.played);
  const lost = played.find((g) => g.result.winnerId !== userTeamId);
  const next = mine.find((g) => !g.played);
  const wins = played.length - (lost ? 1 : 0);

  if (lost) {
    const oppId = lost.homeId === userTeamId ? lost.awayId : lost.homeId;
    const my = lost.homeId === userTeamId ? lost.result.homePts : lost.result.awayPts;
    const their = lost.homeId === userTeamId ? lost.result.awayPts : lost.result.homePts;
    return {
      state: 'out',
      headline: `Eliminated in the ${roundNames[lost.round]}`,
      detail: `Lost ${my}–${their} to ${TEAMS_BY_ID[oppId].name}`,
      wins,
    };
  }
  if (next) {
    const oppId = next.homeId === userTeamId ? next.awayId : next.homeId;
    return {
      state: 'alive',
      headline: `Up next · ${roundNames[next.round]}`,
      detail: oppId ? `vs ${TEAMS_BY_ID[oppId].name}` : 'Opponent to be decided',
      wins,
    };
  }
  return {
    state: 'won',
    headline: 'Champions 🏆',
    detail: `${wins}-0 through the bracket`,
    wins,
  };
}

// The status bar reads off played games, so it would announce the result while
// the matchup below is still counting up to it.
function StatusBar({ status, children }) {
  const held = useGame((s) => !!s.reveal);
  if (!status) return null;
  return (
    <div className={`tstatus tstatus--${status.state} ${held ? 'is-held' : ''}`}>
      <div className="tstatus__main">
        <div className="tstatus__headline">{status.headline}</div>
        <div className="tstatus__detail">{status.detail}</div>
      </div>
      {children}
    </div>
  );
}

// ---------- Conference tournament ----------
export function ConferenceTournamentView() {
  const games = useGame((s) => s.games);
  const teamStates = useGame((s) => s.teamStates);
  const userTeamId = useGame((s) => s.userTeamId);
  const conf = TEAMS_BY_ID[userTeamId].conference;

  const confGames = Object.values(games).filter(
    (g) => g.phase === 'CONF_TOURNEY' && g.conference === conf
  );
  const rounds = [];
  confGames.forEach((g) => (rounds[g.round] ||= []).push(g));
  // Byes mean a round is not the same height as the one beside it; `bracketPos`
  // is the order that keeps each game next to the one it feeds.
  rounds.forEach((r) => r.sort((a, b) => a.bracketPos - b.bracketPos));
  const complete = confGames.length > 0 && confGames.every((g) => g.played);

  const ts = teamStates[userTeamId];
  const standings = conferenceStandings(teamStates, conf);
  const confFinish = standings.findIndex((x) => x.teamId === userTeamId) + 1;

  // The bracket is whatever shape this conference actually plays.
  const entries = confTourneyFormat(conf, standings.length);
  const field = fieldSize(entries);
  const roundNames = confRoundNames(formatRounds(entries));
  const opensIn = seedEntryRound(entries, confFinish);
  const status = userStatus(confGames, userTeamId, roundNames);

  return (
    <div className="tourney">
      <div className="tourney__bar">
        <div>
          <h2 className="tourney__title">{conf} Tournament</h2>
          <div className="tourney__sub">
            {ts.record.w}-{ts.record.l} overall · {ORD(confFinish)} in the {conf}
            {confFinish <= field && <> · No. {confFinish} seed</>}
            {opensIn > 0 && <> · opens in the {roundNames[opensIn]}</>}
          </div>
        </div>
        <TourneyControls complete={complete} />
      </div>

      <StatusBar status={status} />

      {!status && (
        <p className="muted">
          {ORD(confFinish)} place missed the {field}-team field — you're watching this one.
        </p>
      )}

      <div className="bracket">
        {rounds.map((round, r) => (
          <div key={r} className="bracket__round">
            <div className="bracket__roundname">{roundNames[r]}</div>
            {round.map((g) => <Matchup key={g.id} game={g} userTeamId={userTeamId} />)}
          </div>
        ))}
      </div>

      <TourneyDock complete={complete} myGameId={userGameId(confGames, userTeamId)} />
    </div>
  );
}

// ---------- National tournament ----------
export function NationalTournamentView() {
  const games = useGame((s) => s.games);
  const userTeamId = useGame((s) => s.userTeamId);
  const nationalField = useGame((s) => s.nationalField) || [];
  const phase = useGame((s) => s.phase);

  const nationalGames = Object.values(games).filter((g) => g.phase === 'NATIONAL');
  const started = phase === 'DONE' || nationalGames.some((g) => g.played);
  const [entered, setEntered] = useState(started);

  const madeIt = nationalField.includes(userTeamId);
  const firstGame = nationalGames.find(
    (g) => g.round === 0 && (g.homeId === userTeamId || g.awayId === userTeamId)
  );
  const userRegion = firstGame ? firstGame.region : null;
  const region = firstGame ? REGIONS[userRegion] : null;
  const regionSeed = firstGame
    ? (firstGame.homeId === userTeamId ? firstGame.seedHome : firstGame.seedAway)
    : null;

  if (!entered && !started) return <SelectionSunday onEnter={() => setEntered(true)} />;

  const status = madeIt ? userStatus(nationalGames, userTeamId, NATIONAL_ROUND_NAMES) : null;

  return (
    <div className="tourney">
      <div className="tourney__bar">
        <h2 className="tourney__title">National Championship</h2>
        <TourneyControls complete={phase === 'DONE'} />
      </div>

      {status ? (
        <StatusBar status={status}>
          <div className="tstatus__seed">
            <TeamBadge teamId={userTeamId} size={34} seed={regionSeed} />
            <div>
              <div className="tstatus__seedline">No. {regionSeed} seed</div>
              <div className="tstatus__detail">{region} Region</div>
            </div>
          </div>
        </StatusBar>
      ) : (
        <div className="tstatus tstatus--out">
          <div className="tstatus__main">
            <div className="tstatus__headline">Watching from home</div>
            <div className="tstatus__detail">Your team didn't make the field this year.</div>
          </div>
        </div>
      )}

      <NationalBracket games={nationalGames} userTeamId={userTeamId} userRegion={userRegion} />

      <TourneyDock complete={phase === 'DONE'} myGameId={userGameId(nationalGames, userTeamId)} />
    </div>
  );
}

function NationalBracket({ games, userTeamId, userRegion }) {
  const byRegion = [[], [], [], []];
  let ffA, ffB, champ;
  games.forEach((g) => {
    if (g.region != null) byRegion[g.region].push(g);
    else if (g.round === 5) champ = g;
    else if (g.ffRegions?.[0] === 0) ffA = g;
    else ffB = g;
  });

  const block = (r, mirror) => (
    <RegionBlock
      games={byRegion[r]}
      label={REGIONS[r]}
      userTeamId={userTeamId}
      isUserRegion={r === userRegion}
      mirror={mirror}
    />
  );

  return (
    <div className="natbracket">
      <div className="natbracket__side">
        {block(0, false)}
        {block(1, false)}
      </div>

      <div className="natbracket__center">
        <div className="natbracket__ff">
          <div className="bracket__roundname">Final Four</div>
          {ffA && <Matchup game={ffA} userTeamId={userTeamId} />}
        </div>
        <div className="natbracket__champ">
          <div className="bracket__roundname">Championship 🏆</div>
          {champ && <Matchup game={champ} userTeamId={userTeamId} big />}
        </div>
        <div className="natbracket__ff">
          {ffB && <Matchup game={ffB} userTeamId={userTeamId} />}
        </div>
      </div>

      <div className="natbracket__side">
        {block(2, true)}
        {block(3, true)}
      </div>
    </div>
  );
}

const REGION_ROUNDS = ['R64', 'R32', 'S16', 'E8'];

function RegionBlock({ games, label, userTeamId, isUserRegion, mirror }) {
  const rounds = [];
  games.forEach((g) => (rounds[g.round] ||= []).push(g));
  const cols = rounds.map((round, r) => (
    <div key={r} className="bracket__round bracket__round--tight">
      <div className="bracket__roundname bracket__roundname--mini">{REGION_ROUNDS[r]}</div>
      {round.map((g) => <Matchup key={g.id} game={g} userTeamId={userTeamId} compact />)}
    </div>
  ));

  return (
    <div className={`region ${mirror ? 'region--mirror' : ''} ${isUserRegion ? 'region--user' : ''}`}>
      <div className="region__label">
        {label}
        {isUserRegion && <span className="region__you">Your region</span>}
      </div>
      <div className="region__cols">{mirror ? [...cols].reverse() : cols}</div>
    </div>
  );
}

// ---------- Shared matchup rendering ----------
export function Matchup({ game, userTeamId, compact, big }) {
  const homeWon = game.played && game.result.winnerId === game.homeId;
  const awayWon = game.played && game.result.winnerId === game.awayId;
  const reveal = useGame((s) => s.reveal);

  // This is the game the rolling one feeds: hold its incoming slot at TBD until
  // the reveal is over, so the winner doesn't turn up a round to the right and
  // give the score away. The whole matchup then reads as unplayed, which it is.
  const pendingSlot = reveal?.nextGameId === game.id ? reveal.nextSlot : null;
  const homeId = pendingSlot === 'home' ? null : game.homeId;
  const awayId = pendingSlot === 'away' ? null : game.awayId;
  const isUsers = homeId === userTeamId || awayId === userTeamId;

  // Only the user's own game rolls, and only while the sim is holding for it.
  const rolling = reveal?.gameId === game.id;
  const roll = useScoreRoll(
    game.played ? game.result.homePts : 0,
    game.played ? game.result.awayPts : 0,
    rolling,
    game.played && game.result.winnerId === userTeamId,
  );
  // Until the digits land, the bracket has to look like the game hasn't been
  // played — the outcome frame and the W/L marks would both give it away.
  const settled = game.played && (!rolling || roll.landed);

  // The user's own games get an outcome frame: green if they advanced, red if
  // this is where the run ended, and a live marker if it hasn't been played.
  const outcome = !isUsers
    ? ''
    : !settled
      ? 'matchup--next'
      : game.result.winnerId === userTeamId
        ? 'matchup--won'
        : 'matchup--lost';

  return (
    <div
      id={`bg-${game.id}`}
      className={[
        'matchup',
        compact && 'matchup--compact',
        big && 'matchup--big',
        isUsers && 'matchup--mine',
        outcome,
        rolling && roll.landed && (game.result.winnerId === userTeamId ? 'matchup--pop' : 'matchup--flash'),
      ].filter(Boolean).join(' ')}
    >
      <BracketRow
        teamId={homeId} seed={pendingSlot === 'home' ? null : game.seedHome} played={settled}
        pts={game.played ? (rolling ? roll.a : game.result.homePts) : null} won={homeWon}
        user={homeId === userTeamId} rolling={rolling && !roll.landed}
      />
      <BracketRow
        teamId={awayId} seed={pendingSlot === 'away' ? null : game.seedAway} played={settled}
        pts={game.played ? (rolling ? roll.b : game.result.awayPts) : null} won={awayWon}
        user={awayId === userTeamId} rolling={rolling && !roll.landed}
      />
    </div>
  );
}

function BracketRow({ teamId, seed, pts, won, played, user, rolling }) {
  return (
    <div
      className={[
        'brow',
        played && (won ? 'brow--won' : 'brow--lost'),
        user && 'brow--user',
        rolling && 'brow--rolling',
      ].filter(Boolean).join(' ')}
    >
      <span className="brow__seed">{seed ?? ''}</span>
      {teamId ? <TeamBadge teamId={teamId} size={18} /> : <span className="badge badge--empty" />}
      <span className="brow__name">{teamId ? TEAMS_BY_ID[teamId].abbr : 'TBD'}</span>
      {played && <span className={`brow__wl ${won ? 'is-w' : 'is-l'}`}>{won ? 'W' : 'L'}</span>}
      <span className="brow__pts">{pts ?? ''}</span>
    </div>
  );
}
