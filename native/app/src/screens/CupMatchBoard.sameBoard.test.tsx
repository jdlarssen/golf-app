// #2752: ruta sender tavla til andres ferdige kamper bare det tavla leser
// (`cupBoardRows`), siden den ikke skal gi mer enn nettets tavle. Her låses den andre
// halvdelen: tavla blir den samme uten feltene. Begynner resultatet, tavla eller noe
// som tegnes å lese et felt som er fjernet, blir denne rød, og feltet må inn igjen med
// en grunn. Hver kamptype en cup har, med ekte motor og ekte tegning.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { cleanup, render, screen } from '@testing-library/react-native';
import { cupBoardRows, type GameRow, type PlayerRow } from '../../../../lib/games/gameBundleRows';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { toBundle } from '../data/gameBundle';
import { toRoster } from '../lib/roster';
import { computeGameLeaderboard } from '../lib/scoringContext';
import { hasSoloBoard, soloBoardFor } from '../lib/soloBoard';
import { hasTeamBoard, teamBoardFor } from '../lib/teamBoard';
import { foldLocalScores } from '../lib/teamPlay';
import { LeaderboardBody } from './Leaderboard';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../session', () => ({ useSession: () => ({ userId: 'tilskuer' }) }));

const U = ['spiller-1', 'spiller-2', 'spiller-3', 'spiller-4'];
const STAMP = '2026-11-02T08:00:00+00:00';
const HOLES = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: 4,
  par_ladies: 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));
const TEE = {
  name: 'Gul',
  length_meters: 5800,
  slope_mens: 125,
  course_rating_mens: '71.2',
  par_total_mens: 72,
  slope_ladies: 120,
  course_rating_ladies: '70',
  par_total_ladies: 72,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

type Case = {
  mode: GameMode;
  config: Record<string, unknown>;
  players: [number, 1 | 2][];
  scored: number[];
  holes?: [number, number];
  segment?: string;
  source?: string;
  withdrawn?: number;
  missingCard?: number;
};

const PAIRS: [number, 1 | 2][] = [
  [0, 1],
  [1, 1],
  [2, 2],
  [3, 2],
];
const TEAM = { team_size: 2, teams_count: 2 };

const fullGame = (c: Case): GameRow => ({
  id: 'kamp',
  name: 'Kamp',
  status: 'finished',
  game_mode: c.mode,
  mode_config: { kind: c.mode, ...c.config },
  course_id: 'bane',
  tee_box_id: 'tee',
  require_peer_approval: true,
  scheduled_tee_off_at: STAMP,
  hole_segment: c.segment ?? 'full',
  source_game_id: c.source ?? null,
  created_by: U[0],
  score_visibility: 'reveal',
  tournament_id: 'cup',
  league_round_id: null,
  foursomes_side1_tee_starter_user_id: U[0],
  foursomes_side2_tee_starter_user_id: U[2],
  patsome_tee_starters: [{ team_number: 1, tee_starter_user_id: U[0] }],
  side_tournament_enabled: false,
  side_ld_count: 0,
  side_ctp_count: 0,
  side_disabled_categories: [],
  hcp_allowance_pct: 100,
  hcp_max_strokes: null,
  spectate_token: 'lenke',
  round_report: 'Referatet',
  courses: { name: 'Bane', course_holes: HOLES },
  tee_boxes: TEE,
});

const fullPlayer = (c: Case, index: number, team: 1 | 2): PlayerRow => {
  const delivered = index !== c.missingCard;
  return {
    user_id: U[index],
    team_number: team,
    flight_number: 1,
    course_handicap: 10 + index * 5,
    tee_gender: 'mens',
    accepted_at: STAMP,
    submitted_at: delivered ? STAMP : null,
    submitted_by_user_id: delivered ? U[index] : null,
    approved_at: delivered ? STAMP : null,
    approved_by_user_id: delivered ? U[(index + 1) % 4] : null,
    marker_user_id: U[(index + 1) % 4],
    rejection_reason: 'grunnen',
    withdrawn_at: index === c.withdrawn ? STAMP : null,
    withdrawn_by_user_id: index === c.withdrawn ? U[0] : null,
    result_summary: { kind: 'matchplay', margin: '3&2', outcome: team === 1 ? 'win' : 'loss' } as never,
    users: { name: `Spiller ${index + 1}`, nickname: null, is_guest: index === 1 },
  };
};

function board(c: Case, stripped: boolean) {
  const rows = { game: fullGame(c), players: c.players.map(([i, team]) => fullPlayer(c, i, team)) };
  const { game, players } = stripped ? cupBoardRows(rows.game, rows.players) : rows;
  const bundle = toBundle(game, players, { segmentSibling: null, sourceGameName: null });
  const [from, to] = c.holes ?? [1, 18];
  const raw = c.scored.flatMap((i) =>
    Array.from({ length: to - from + 1 }, (_, n) => ({
      id: `kamp:${U[i]}:${from + n}`,
      gameId: 'kamp',
      userId: U[i],
      holeNumber: from + n,
      strokes: 4 + ((i + from + n) % 3),
      putts: null,
      enteredBy: U[i],
      clientUpdatedAt: '',
      serverUpdatedAt: null,
    })),
  );
  const scores = foldLocalScores(raw, toRoster(bundle.players), bundle.game.gameMode as GameMode);
  return {
    bundle,
    scores,
    outcome: computeGameLeaderboard(bundle, scores, {}),
    soloBoard: hasSoloBoard(bundle.game) ? soloBoardFor({ bundle, scores, userId: 'tilskuer' }) : null,
    teamBoard: hasTeamBoard(bundle.game) ? teamBoardFor({ bundle, scores, userId: 'tilskuer', teeShots: null }) : null,
  };
}

async function drawn(model: ReturnType<typeof board>): Promise<string> {
  await render(
    <LeaderboardBody
      bundle={model.bundle}
      scores={model.scores}
      soloBoard={model.soloBoard}
      teamBoard={model.teamBoard}
    />,
  );
  const tree = JSON.stringify(screen.toJSON());
  await cleanup();
  return tree;
}

const CASES: [string, Case][] = [
  ['single', { mode: 'singles_matchplay', config: { team_size: 1 }, players: [[0, 1], [1, 2]], scored: [0, 1] }],
  ['fourball', { mode: 'fourball_matchplay', config: { ...TEAM, allowance_pct: 85 }, players: PAIRS, scored: [0, 1, 2, 3] }],
  ['foursomes', { mode: 'foursomes_matchplay', config: TEAM, players: PAIRS, scored: [0, 2] }],
  ['greensome, hull 1–9', { mode: 'greensome_matchplay', config: TEAM, players: PAIRS, scored: [0, 2], holes: [1, 9], segment: 'front9' }],
  ['best ball, hull 10–18', { mode: 'best_ball', config: { ...TEAM, allowance_pct: 85 }, players: PAIRS, scored: [0, 1, 2, 3], holes: [10, 18], segment: 'back9' }],
  ['best ball, en har trukket seg', { mode: 'best_ball', config: { ...TEAM, allowance_pct: 85 }, players: PAIRS, scored: [0, 2, 3], withdrawn: 1 }],
  ['fourball, en har trukket seg', { mode: 'fourball_matchplay', config: { ...TEAM, allowance_pct: 85 }, players: PAIRS, scored: [0, 2, 3], withdrawn: 1 }],
  ['fourball, et kort mangler', { mode: 'fourball_matchplay', config: { ...TEAM, allowance_pct: 85 }, players: PAIRS, scored: [0, 1, 2, 3], missingCard: 3 }],
  ['avledet single, hull 10–18', { mode: 'singles_matchplay', config: { team_size: 1 }, players: [[0, 1], [2, 2]], scored: [0, 2], holes: [10, 18], segment: 'back9', source: 'verten' }],
];

describe('tavla er den samme uten feltene ruta fjerner', () => {
  it.each(CASES)('%s', async (_name, c) => {
    const full = board(c, false);
    const stripped = board(c, true);

    // Ellers kunne to tomme tavler vært like.
    expect(full.outcome.ok).toBe(true);
    expect(JSON.stringify(stripped.outcome)).toBe(JSON.stringify(full.outcome));
    expect(JSON.stringify(stripped.soloBoard)).toBe(JSON.stringify(full.soloBoard));
    expect(JSON.stringify(stripped.teamBoard)).toBe(JSON.stringify(full.teamBoard));

    const tree = await drawn(full);
    expect(tree).toContain('Spiller');
    expect(await drawn(stripped)).toBe(tree);
  });
});

describe('cupBoardRows', () => {
  const c = CASES[5][1];
  const { game, players } = cupBoardRows(fullGame(c), c.players.map(([i, team]) => fullPlayer(c, i, team)));

  it('tar med det tavla leser', () => {
    expect(game).toMatchObject({ id: 'kamp', status: 'finished', game_mode: 'best_ball', hole_segment: 'full' });
    expect(game.courses?.course_holes).toHaveLength(18);
    expect(game.tee_boxes?.name).toBe('Gul');
    expect(players[0]).toMatchObject({ user_id: U[0], team_number: 1, course_handicap: 10, tee_gender: 'mens' });
    expect(players[0].users?.name).toBe('Spiller 1');
  });

  it('sier at noen har trukket seg, men ikke når eller hvem som gjorde det', () => {
    expect(players[0].withdrawn_at).toBeNull();
    expect(players[1].withdrawn_at).not.toBeNull();
    expect(JSON.stringify(players)).not.toContain('2026-11-02');
    expect(players[1].withdrawn_by_user_id).toBeNull();
  });

  it('har ikke med gjesteflagget, utslagene eller noe om levering', () => {
    expect(JSON.stringify({ game, players })).not.toContain('grunnen');
    expect(players[1].users?.is_guest).toBeNull();
    expect(game.foursomes_side1_tee_starter_user_id).toBeNull();
    expect(game.patsome_tee_starters).toBeNull();
    expect(players[0]).toMatchObject({ submitted_at: null, approved_at: null, marker_user_id: null, result_summary: null });
  });
});
