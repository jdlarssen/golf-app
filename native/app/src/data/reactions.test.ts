// #2754: reaksjonene i appen. Lesing kaster ved feil, så «fikk ikke lest» aldri
// kan forveksles med «ingen har reagert». Skriving går samme gang som nettets
// `toggleReaction`: les raden, så slett eller sett inn, og 0 rader er aldri
// suksess (trap 2).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factoryen heises over importene og må bruke require */
import { fetchGameReactions, toggleReaction } from './reactions';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const { queryStub, routeFrom, stepArgs } =
  require('../test/supabaseMock') as typeof import('../test/supabaseMock');

const GAME = 'game-1';
const ME = 'me';
const MATE = 'mate';
const INPUT = { gameId: GAME, userId: ME, targetUserId: MATE, emoji: '🔥' as const };

const found = () => queryStub({ data: { id: 'r1' }, error: null });
const missing = () => queryStub({ data: null, error: null });

describe('fetchGameReactions', () => {
  it('leser spillets rader og samler dem med den delte regelen', async () => {
    const stub = queryStub({
      data: [
        { target_user_id: MATE, emoji: '🔥', user_id: ME },
        { target_user_id: MATE, emoji: '🔥', user_id: 'other' },
      ],
      error: null,
    });
    routeFrom({ reactions: [stub] });

    await expect(fetchGameReactions(GAME, ME)).resolves.toEqual({
      [MATE]: { counts: { '🔥': 2 }, mine: ['🔥'] },
    });
    expect(stepArgs(stub, 'select')).toEqual([['target_user_id, emoji, user_id']]);
    expect(stepArgs(stub, 'eq')).toEqual([['game_id', GAME]]);
  });

  it('kaster ved feil', async () => {
    routeFrom({ reactions: [queryStub({ data: null, error: { message: 'nede' } })] });
    await expect(fetchGameReactions(GAME, ME)).rejects.toThrow('nede');
  });
});

describe('toggleReaction', () => {
  it('setter inn når raden ikke finnes, med egen bruker som giver', async () => {
    const insert = queryStub({ data: [{ id: 'r1' }], error: null });
    routeFrom({ reactions: [missing(), insert] });

    await expect(toggleReaction(INPUT)).resolves.toEqual({ ok: true });
    expect(stepArgs(insert, 'insert')).toEqual([
      [{ game_id: GAME, user_id: ME, target_user_id: MATE, emoji: '🔥' }],
    ]);
    expect(stepArgs(insert, 'select')).toEqual([['id']]);
  });

  it('sletter egen rad når den finnes', async () => {
    const remove = queryStub({ data: [{ id: 'r1' }], error: null });
    routeFrom({ reactions: [found(), remove] });

    await expect(toggleReaction(INPUT)).resolves.toEqual({ ok: true });
    expect(stepArgs(remove, 'delete')).toHaveLength(1);
    expect(stepArgs(remove, 'eq')).toEqual([
      ['id', 'r1'],
      ['user_id', ME],
    ]);
  });

  it('samme reaksjon gitt fra to enheter (23505) er ingen feil', async () => {
    routeFrom({
      reactions: [missing(), queryStub({ data: null, error: { message: 'dup', code: '23505' } })],
    });
    await expect(toggleReaction(INPUT)).resolves.toEqual({ ok: true });
  });

  it('RLS-nekt (42501) gir egen kode, aldri rå Postgres-tekst', async () => {
    routeFrom({
      reactions: [missing(), queryStub({ data: null, error: { message: 'rls', code: '42501' } })],
    });
    await expect(toggleReaction(INPUT)).resolves.toEqual({ ok: false, failure: 'rls_denied' });
  });

  it('andre feil og feilet lesing gir db_error', async () => {
    routeFrom({
      reactions: [missing(), queryStub({ data: null, error: { message: 'nett', code: '' } })],
    });
    await expect(toggleReaction(INPUT)).resolves.toEqual({ ok: false, failure: 'db_error' });

    routeFrom({ reactions: [queryStub({ data: null, error: { message: 'nett' } })] });
    await expect(toggleReaction(INPUT)).resolves.toEqual({ ok: false, failure: 'db_error' });
  });

  it('0 rader er ikke suksess, verken ved sletting eller innsetting', async () => {
    routeFrom({ reactions: [found(), queryStub({ data: [], error: null })] });
    await expect(toggleReaction(INPUT)).resolves.toEqual({ ok: false, failure: 'no_rows' });

    routeFrom({ reactions: [missing(), queryStub({ data: [], error: null })] });
    await expect(toggleReaction(INPUT)).resolves.toEqual({ ok: false, failure: 'no_rows' });
  });
});
