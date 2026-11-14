// native/app/src/data/pushPreferences.test.ts
// #2315 PR B: appens lesing og skriving av sin egen rad i
// `notification_preferences` (migrasjon 0236).
//
// Skrivingen er en upsert med `.select()` og radtelling: PostgREST svarer uten
// feil på en skriving som traff null rader (felle 2), og et valg som ikke ble
// lagret, må aldri se lagret ut. «Rundene dine» er alltid på og sendes aldri.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { queryStub, routeFrom, stepArgs } from '../test/supabaseMock';
import { fetchOwnPushPreferences, savePushPreferences } from './pushPreferences';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const USER = 'user-me';

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchOwnPushPreferences', () => {
  it('leser valgene fra raden', async () => {
    routeFrom({
      notification_preferences: [
        queryStub({ data: { muted_groups: ['friends'], quiet_hours: true }, error: null }),
      ],
    });

    await expect(fetchOwnPushPreferences(USER)).resolves.toEqual({ mutedGroups: ['friends'], quietHours: true });
  });

  it('ingen rad betyr alt på og stille tid av', async () => {
    routeFrom({ notification_preferences: [queryStub({ data: null, error: null })] });

    await expect(fetchOwnPushPreferences(USER)).resolves.toEqual({ mutedGroups: [], quietHours: false });
  });

  it('tar bare med gruppene som kan slås av', async () => {
    routeFrom({
      notification_preferences: [
        queryStub({ data: { muted_groups: ['rounds', 'news', 'signups', 'signups'], quiet_hours: false }, error: null }),
      ],
    });

    await expect(fetchOwnPushPreferences(USER)).resolves.toEqual({ mutedGroups: ['signups'], quietHours: false });
  });

  it('leser bare sin egen rad', async () => {
    const read = queryStub({ data: null, error: null });
    routeFrom({ notification_preferences: [read] });

    await fetchOwnPushPreferences(USER);

    expect(stepArgs(read, 'select')).toEqual([['muted_groups, quiet_hours']]);
    expect(stepArgs(read, 'eq')).toEqual([['user_id', USER]]);
  });

  it('kaster ved lesefeil, så bryterne aldri viser et gjettet valg', async () => {
    routeFrom({ notification_preferences: [queryStub({ data: null, error: { message: 'boom' } })] });

    await expect(fetchOwnPushPreferences(USER)).rejects.toThrow();
  });
});

describe('savePushPreferences', () => {
  it('lagrer hele tilstanden som upsert på user_id, og leser raden tilbake', async () => {
    const upsert = queryStub({ data: [{ user_id: USER }], error: null });
    routeFrom({ notification_preferences: [upsert] });

    await expect(
      savePushPreferences(USER, { mutedGroups: ['signups', 'friends'], quietHours: true }),
    ).resolves.toEqual({ ok: true });
    expect(stepArgs(upsert, 'upsert')).toEqual([
      [{ user_id: USER, muted_groups: ['friends', 'signups'], quiet_hours: true }, { onConflict: 'user_id' }],
    ]);
    expect(stepArgs(upsert, 'select')).toEqual([['user_id']]);
  });

  it('sender aldri «Rundene dine» eller en ukjent gruppe', async () => {
    const upsert = queryStub({ data: [{ user_id: USER }], error: null });
    routeFrom({ notification_preferences: [upsert] });

    await savePushPreferences(USER, { mutedGroups: ['rounds', 'news', 'scorecards'], quietHours: false });

    const [[row]] = stepArgs(upsert, 'upsert') as [[{ muted_groups: string[] }]];
    expect(row.muted_groups).toEqual(['scorecards']);
  });

  it.each([
    ['null rader tilbake', { data: [], error: null }],
    ['en feil', { data: null, error: { message: 'boom', code: '42501' } }],
  ])('regner %s som ikke lagret', async (_label, result) => {
    routeFrom({ notification_preferences: [queryStub(result)] });

    await expect(savePushPreferences(USER, { mutedGroups: [], quietHours: false })).resolves.toEqual({ ok: false });
  });
});
