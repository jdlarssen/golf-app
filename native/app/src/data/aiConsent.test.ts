// native/app/src/data/aiConsent.test.ts
// #2561 PR B: appens lesing og skriving av sin egen rad i `ai_consents`.
//
// Skrivingen er en upsert med `.select()` og radtelling: PostgREST svarer uten
// feil på en skriving som traff null rader (felle 2), og et samtykke som ikke
// ble lagret må aldri se lagret ut.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { queryStub, routeFrom, stepArgs } from '../test/supabaseMock';
import { fetchOwnAiConsent, saveAiConsent } from './aiConsent';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const USER = 'user-me';

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchOwnAiConsent', () => {
  it.each([
    ['ja', { granted: true }, true],
    ['nei', { granted: false }, false],
    ['ingen rad', null, null],
  ])('%s', async (_label, row, expected) => {
    routeFrom({ ai_consents: [queryStub({ data: row, error: null })] });

    await expect(fetchOwnAiConsent(USER)).resolves.toBe(expected);
  });

  it('leser bare sin egen rad', async () => {
    const read = queryStub({ data: null, error: null });
    routeFrom({ ai_consents: [read] });

    await fetchOwnAiConsent(USER);

    expect(stepArgs(read, 'eq')).toEqual([['user_id', USER]]);
  });

  it('kaster ved lesefeil, så porten og bryteren aldri gjetter', async () => {
    routeFrom({ ai_consents: [queryStub({ data: null, error: { message: 'boom' } })] });

    await expect(fetchOwnAiConsent(USER)).rejects.toThrow();
  });
});

describe('saveAiConsent', () => {
  it('lagrer svaret som upsert på user_id, og leser raden tilbake', async () => {
    const upsert = queryStub({ data: [{ user_id: USER }], error: null });
    routeFrom({ ai_consents: [upsert] });

    await expect(saveAiConsent(USER, true)).resolves.toEqual({ ok: true });
    expect(stepArgs(upsert, 'upsert')).toEqual([
      [{ user_id: USER, granted: true }, { onConflict: 'user_id' }],
    ]);
    expect(stepArgs(upsert, 'select').length).toBe(1);
  });

  it.each([
    ['null rader tilbake', { data: [], error: null }],
    ['en feil', { data: null, error: { message: 'boom', code: '42501' } }],
  ])('regner %s som ikke lagret', async (_label, result) => {
    routeFrom({ ai_consents: [queryStub(result)] });

    await expect(saveAiConsent(USER, false)).resolves.toEqual({ ok: false });
  });
});
