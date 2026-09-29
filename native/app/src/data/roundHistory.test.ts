// #2256: spørringen bak runde-lista. Type A mot supabase-mocken.
//
// Filtrene ER kontrakten: de speiler `/profile/historikk` (ferdige spill, ikke
// avledede, bare egne rader og egne slag). En runde som sniker seg inn eller
// faller ut her, gir bag-taggen et annet tall enn webben — så testen leser
// kjede-leddene som ble sendt, ikke bare svaret.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const ME = 'user-me';

type Mocks = typeof import('../test/supabaseMock');
type RoundHistory = typeof import('./roundHistory');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function subject(): RoundHistory {
  return require('./roundHistory') as RoundHistory;
}

function playerRow(gameId: string, scheduledTeeOffAt: string | null, gameMode = 'solo_strokeplay') {
  return {
    game_id: gameId,
    result_summary: null,
    games: {
      id: gameId,
      scheduled_tee_off_at: scheduledTeeOffAt,
      ended_at: null,
      game_mode: gameMode,
    },
  };
}

describe('fetchRoundHistory', () => {
  useFreshModules();

  it('reads only finished, non-derived games of the player, and only own non-null strokes', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const players = queryStub({ data: [playerRow('g1', '2026-05-01T08:00:00.000Z')], error: null });
    const scores = queryStub({ data: [{ game_id: 'g1', strokes: 5 }], error: null });
    routeFrom({ game_players: [players], scores: [scores] });

    const rounds = await subject().fetchRoundHistory(ME);

    expect(stepArgs(players, 'eq')).toEqual([
      ['user_id', ME],
      ['games.status', 'finished'],
    ]);
    expect(stepArgs(players, 'is')).toEqual([['games.source_game_id', null]]);
    expect(stepArgs(scores, 'eq')).toEqual([['user_id', ME]]);
    expect(stepArgs(scores, 'in')).toEqual([['game_id', ['g1']]]);
    expect(stepArgs(scores, 'not')).toEqual([['strokes', 'is', null]]);
    // Sidevis (#1894): ordnet på en unik kolonne, ellers kan sider overlappe.
    expect(stepArgs(scores, 'order')).toEqual([['id']]);
    expect(rounds).toEqual([
      expect.objectContaining({ gameId: 'g1', year: 2026, holeCount: 1 }),
    ]);
  });

  it('with a year, keeps that year’s rounds and fetches strokes for them alone', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const players = queryStub({
      data: [
        playerRow('last-year', '2025-12-31T23:30:00.000Z'),
        playerRow('this-year', '2026-01-01T00:10:00.000Z'),
        playerRow('undated', null),
      ],
      error: null,
    });
    const scores = queryStub({ data: [], error: null });
    routeFrom({ game_players: [players], scores: [scores] });

    const rounds = await subject().fetchRoundHistory(ME, { year: 2026 });

    expect(rounds.map((r) => r.gameId)).toEqual(['this-year']);
    expect(stepArgs(scores, 'in')).toEqual([['game_id', ['this-year']]]);
  });

  it('asks for no strokes when there is no round to fetch them for', async () => {
    const { queryStub, routeFrom } = mocks();
    // Ingen `scores`-stub: en spørring mot den ville kastet i mocken.
    routeFrom({ game_players: [queryStub({ data: [playerRow('old', '2024-06-01T08:00:00.000Z')], error: null })] });

    expect(await subject().fetchRoundHistory(ME, { year: 2026 })).toEqual([]);
  });

  it('throws when the game list cannot be read', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({ game_players: [queryStub({ data: null, error: { message: 'nede' } })] });

    await expect(subject().fetchRoundHistory(ME)).rejects.toThrow('nede');
  });

  it('throws when the strokes cannot be read', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      game_players: [queryStub({ data: [playerRow('g1', '2026-05-01T08:00:00.000Z')], error: null })],
      scores: [queryStub({ data: null, error: { message: 'tidsavbrudd' } })],
    });

    await expect(subject().fetchRoundHistory(ME)).rejects.toThrow('tidsavbrudd');
  });
});
