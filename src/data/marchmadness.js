// Historical NCAA Tournament reference data (1985–2024 — the 64+ team era,
// 40 tournaments, 160 games per first-round seed matchup).
//
// This file is FACTS, not logic. The engine doesn't consult it at runtime: it's
// the calibration target the simulation constants were tuned against, and the
// yardstick `scripts/calibrate.mjs` measures simulated tournaments with. When
// you change a simulation weight, re-run that script and check it still lands
// inside these bands.
//
// Figures are the widely published aggregates and are accurate to about a
// percentage point — precise enough to tune against, not a system of record.

// Share of first-round games won by the higher seed. The 5/12 and 8/9 lines are
// the famous ones: a 12 seed wins better than a third of the time, and the 8/9
// game is a genuine coin flip.
export const R64_FAVORITE_WIN_PCT = {
  '1v16': 0.988, // 158-2 — only UMBC (2018) and Fairleigh Dickinson (2023)
  '2v15': 0.931,
  '3v14': 0.856,
  '4v13': 0.794,
  '5v12': 0.650,
  '6v11': 0.619,
  '7v10': 0.613,
  '8v9': 0.494, // 9 seeds hold a hair's edge
};

// Typical closing point spread for each first-round matchup. These are what the
// simulation's strength→margin mapping is calibrated to reproduce, and the
// cleanest single lever on how chalky the bracket plays.
export const R64_TYPICAL_SPREAD = {
  '1v16': 23.5,
  '2v15': 16.5,
  '3v14': 12.5,
  '4v13': 10.0,
  '5v12': 6.0,
  '6v11': 4.5,
  '7v10': 3.0,
  '8v9': 1.0,
};

// Standard deviation of a college basketball final margin around its spread.
// Consistently ~11 points; this is the number that makes March upsets happen at
// the rate they actually do, and the reason a 20-point favorite still loses.
export const MARGIN_SD_VS_SPREAD = 11.0;

// Share of the 40 national titles won from each seed line. Lowest seed ever to
// cut down the nets: 8 (Villanova, 1985). No seed below 8 has ever won.
export const CHAMPION_SHARE_BY_SEED = {
  1: 0.625, 2: 0.125, 3: 0.100, 4: 0.050, 6: 0.025, 7: 0.025, 8: 0.025,
};

// Share of the 160 Final Four slots by seed line. Nothing below an 11 seed has
// ever reached a Final Four, and no 16 seed has ever won two games.
export const FINAL_FOUR_SHARE_BY_SEED = {
  1: 0.413, 2: 0.194, 3: 0.119, 4: 0.081, 5: 0.050, 6: 0.025,
  7: 0.025, 8: 0.038, 9: 0.006, 10: 0.019, 11: 0.031,
};

// Average combined score of a D1 game. Feeds the sim's possession-free scoring
// model, which splits a total by the simulated margin.
export const TYPICAL_GAME_TOTAL = 145;

// Home-court edge in college basketball, in points. Neutral-site tournament
// games get none of it — one reason seeding matters less in March than a
// team's regular-season record suggests.
export const HOME_COURT_POINTS = 3.2;
