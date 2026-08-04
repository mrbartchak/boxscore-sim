import { useState } from 'react';
import { useGame } from '../store/useGame.js';
import { TEAMS_BY_ID } from '../data/teams.js';
import { rankTeams, conferenceStandings } from '../engine/rankings.js';
import { seasonAverages } from '../engine/players.js';
import { NATIONAL_ROUND_NAMES, CONF_ROUND_NAMES, REGIONS } from '../engine/tournament.js';
import { TeamBadge, TeamName } from './common.jsx';

const ORD = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

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

// ---------- Season overview shown before the conference tournament ----------
function SeasonOverview() {
  const teamStates = useGame((s) => s.teamStates);
  const userTeamId = useGame((s) => s.userTeamId);
  const ts = teamStates[userTeamId];
  const conf = TEAMS_BY_ID[userTeamId].conference;

  const confFinish = conferenceStandings(teamStates, conf).findIndex((x) => x.teamId === userTeamId) + 1;
  const natRank = rankTeams(teamStates).find((x) => x.ts.teamId === userTeamId)?.rank;
  const scorer = [...ts.players]
    .map((p) => ({ p, ppg: seasonAverages(p)?.ppg ?? 0 }))
    .sort((a, b) => b.ppg - a.ppg)[0];

  return (
    <section className="overview">
      <h2 className="overview__title">Regular Season Complete</h2>
      <div className="overview__stats">
        <SummaryStat label="Record" value={`${ts.record.w}-${ts.record.l}`} />
        <SummaryStat label={`${conf} Finish`} value={ORD(confFinish)} sub={`${ts.confRecord.w}-${ts.confRecord.l}`} />
        <SummaryStat label="National Rank" value={`#${natRank}`} />
        <SummaryStat label="Leading Scorer" value={scorer.p.name.split(' ').slice(-1)[0]} sub={`${scorer.ppg} PPG`} />
      </div>
    </section>
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

// ---------- Conference tournament ----------
export function ConferenceTournamentView() {
  const games = useGame((s) => s.games);
  const userTeamId = useGame((s) => s.userTeamId);
  const conf = TEAMS_BY_ID[userTeamId].conference;

  const confGames = Object.values(games).filter((g) => g.phase === 'CONF_TOURNEY' && g.conference === conf);
  const rounds = [];
  confGames.forEach((g) => (rounds[g.round] ||= []).push(g));
  const complete = confGames.length > 0 && confGames.every((g) => g.played);

  return (
    <div className="tourney">
      <SeasonOverview />
      <div className="tourney__bar">
        <h2 className="tourney__title">{conf} Tournament</h2>
        <TourneyControls complete={complete} />
      </div>
      <div className="bracket">
        {rounds.map((round, r) => (
          <div key={r} className="bracket__round">
            <div className="bracket__roundname">{CONF_ROUND_NAMES[r]}</div>
            {round.map((g) => <Matchup key={g.id} game={g} userTeamId={userTeamId} />)}
          </div>
        ))}
      </div>
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
  const overallSeed = madeIt ? nationalField.indexOf(userTeamId) + 1 : null;
  const firstGame = nationalGames.find(
    (g) => g.round === 0 && (g.homeId === userTeamId || g.awayId === userTeamId)
  );
  const region = firstGame ? REGIONS[firstGame.region] : null;
  const regionSeed = firstGame ? (firstGame.homeId === userTeamId ? firstGame.seedHome : firstGame.seedAway) : null;

  if (!entered && !started) {
    return (
      <div className="selection">
        <div className="selection__card">
          <div className="selection__logo">🏀</div>
          <h2>Selection Sunday</h2>
          {madeIt ? (
            <>
              <p className="selection__in">You're in the Big Dance!</p>
              <div className="selection__seedrow">
                <TeamBadge teamId={userTeamId} size={56} seed={regionSeed} />
                <div>
                  <div className="selection__seed">No. {regionSeed} seed</div>
                  <div className="selection__region">{region} Region · Overall #{overallSeed}</div>
                </div>
              </div>
              <button className="btn btn--primary btn--lg" onClick={() => setEntered(true)}>
                Enter Tournament →
              </button>
            </>
          ) : (
            <>
              <p className="selection__out">Your team missed the 64-team field this year.</p>
              <p className="muted">Tough break — there's always next season. You can still watch it play out.</p>
              <button className="btn btn--lg" onClick={() => setEntered(true)}>Watch the Tournament →</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="tourney">
      <div className="tourney__bar">
        <h2 className="tourney__title">National Championship</h2>
        <TourneyControls complete={phase === 'DONE'} />
      </div>
      <NationalBracket games={nationalGames} userTeamId={userTeamId} />
    </div>
  );
}

function NationalBracket({ games, userTeamId }) {
  const byRegion = [[], [], [], []];
  let ffA, ffB, champ;
  games.forEach((g) => {
    if (g.region != null) byRegion[g.region].push(g);
    else if (g.round === 5) champ = g;
    else if (g.ffRegions?.[0] === 0) ffA = g;
    else ffB = g;
  });

  return (
    <div className="natbracket">
      <div className="natbracket__side">
        <RegionBlock games={byRegion[0]} label={REGIONS[0]} userTeamId={userTeamId} />
        <RegionBlock games={byRegion[1]} label={REGIONS[1]} userTeamId={userTeamId} />
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
        <RegionBlock games={byRegion[2]} label={REGIONS[2]} userTeamId={userTeamId} mirror />
        <RegionBlock games={byRegion[3]} label={REGIONS[3]} userTeamId={userTeamId} mirror />
      </div>
    </div>
  );
}

function RegionBlock({ games, label, userTeamId, mirror }) {
  const rounds = [];
  games.forEach((g) => (rounds[g.round] ||= []).push(g));
  const cols = rounds.map((round, r) => (
    <div key={r} className="bracket__round bracket__round--tight">
      {round.map((g) => <Matchup key={g.id} game={g} userTeamId={userTeamId} compact />)}
    </div>
  ));

  return (
    <div className={`region ${mirror ? 'region--mirror' : ''}`}>
      <div className="region__label">{label}</div>
      <div className="region__cols">{mirror ? [...cols].reverse() : cols}</div>
    </div>
  );
}

// ---------- Shared matchup rendering ----------
export function Matchup({ game, userTeamId, compact, big }) {
  const homeWon = game.played && game.result.winnerId === game.homeId;
  const awayWon = game.played && game.result.winnerId === game.awayId;
  return (
    <div className={`matchup ${compact ? 'matchup--compact' : ''} ${big ? 'matchup--big' : ''}`}>
      <BracketRow teamId={game.homeId} seed={game.seedHome} pts={game.played ? game.result.homePts : null} won={homeWon} user={game.homeId === userTeamId} />
      <BracketRow teamId={game.awayId} seed={game.seedAway} pts={game.played ? game.result.awayPts : null} won={awayWon} user={game.awayId === userTeamId} />
    </div>
  );
}

function BracketRow({ teamId, seed, pts, won, user }) {
  return (
    <div className={`brow ${won ? 'brow--won' : ''} ${user ? 'brow--user' : ''}`}>
      <span className="brow__seed">{seed ?? ''}</span>
      {teamId ? <TeamBadge teamId={teamId} size={18} /> : <span className="badge badge--empty" />}
      <span className="brow__name">{teamId ? TEAMS_BY_ID[teamId].abbr : 'TBD'}</span>
      <span className="brow__pts">{pts ?? ''}</span>
    </div>
  );
}
