import { describe, it, expect, vi, beforeEach } from 'vitest';

// #1009 Type A: valideringsregler + atomic-or-compensated-løpet i
// createGuestUser/createGuestPlayer. Mock kun ved systemgrensen
// (admin-klienten) — kompensasjonslogikken er testens poeng.

vi.mock('server-only', () => ({}));

const { getAdminClientMock } = vi.hoisted(() => ({
  getAdminClientMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: getAdminClientMock,
}));

import {
  parseGuestProfile,
  createGuestUser,
  createGuestPlayer,
  isGuestPlaceholderEmail,
  guestTeeToTeeGender,
  guestTeeToUserGender,
  guestTeeToLevel,
  GUEST_EMAIL_DOMAIN,
} from './createGuestPlayer';

// ── Fake admin-klient ────────────────────────────────────────────────────────
// Kun de tre veiene helperen bruker: auth.admin.createUser/deleteUser,
// users-update-kjeden og game_players-insert.

type FakeOpts = {
  createUserFails?: boolean;
  usersUpdateRows?: Array<{ id: string }>;
  gamePlayersInsertError?: { message: string } | null;
};

function fakeAdmin(opts: FakeOpts = {}) {
  const createUser = vi.fn(async () =>
    opts.createUserFails
      ? { data: { user: null }, error: { message: 'boom' } }
      : { data: { user: { id: 'guest-uuid-1' } }, error: null },
  );
  const deleteUser = vi.fn(async () => ({ data: {}, error: null }));

  const usersUpdatePayloads: Record<string, unknown>[] = [];
  const usersSelect = vi.fn(async () => ({
    data: opts.usersUpdateRows ?? [{ id: 'guest-uuid-1' }],
    error: null,
  }));
  const usersEq = vi.fn(() => ({ select: usersSelect }));
  const usersUpdate = vi.fn((payload: Record<string, unknown>) => {
    usersUpdatePayloads.push(payload);
    return { eq: usersEq };
  });

  const gpInsertPayloads: Record<string, unknown>[] = [];
  const gpInsert = vi.fn(async (payload: Record<string, unknown>) => {
    gpInsertPayloads.push(payload);
    return { error: opts.gamePlayersInsertError ?? null };
  });

  const client = {
    auth: { admin: { createUser, deleteUser } },
    from: vi.fn((table: string) => {
      if (table === 'users') return { update: usersUpdate };
      if (table === 'game_players') return { insert: gpInsert };
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { client, createUser, deleteUser, usersUpdatePayloads, gpInsertPayloads, gpInsert };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseGuestProfile', () => {
  it('godtar navn + komma-desimal hcp + tee', () => {
    const res = parseGuestProfile({ name: ' Kari Gjest ', hcp: '18,4', tee: 'D' });
    expect(res).toEqual({
      ok: true,
      profile: { name: 'Kari Gjest', hcpIndex: 18.4, tee: 'D' },
    });
  });

  it('ledende «+» gir plusshandicap lagret negativt', () => {
    const res = parseGuestProfile({ name: 'Proff', hcp: '+2', tee: 'M' });
    expect(res).toEqual({ ok: true, profile: { name: 'Proff', hcpIndex: -2, tee: 'M' } });
  });

  it.each([
    ['tomt navn', { name: '  ', hcp: '10', tee: 'M' }, 'guest_invalid_name'],
    ['for langt navn', { name: 'x'.repeat(81), hcp: '10', tee: 'M' }, 'guest_invalid_name'],
    ['tom hcp', { name: 'A', hcp: '', tee: 'M' }, 'guest_invalid_hcp'],
    ['ikke-numerisk hcp', { name: 'A', hcp: 'abc', tee: 'M' }, 'guest_invalid_hcp'],
    ['hcp over 54', { name: 'A', hcp: '54,1', tee: 'M' }, 'guest_invalid_hcp'],
    ['plusshandicap under -10', { name: 'A', hcp: '+10,1', tee: 'M' }, 'guest_invalid_hcp'],
    ['negativt fortegn direkte', { name: 'A', hcp: '-5', tee: 'M' }, 'guest_invalid_hcp'],
    ['ugyldig tee', { name: 'A', hcp: '10', tee: 'X' }, 'guest_invalid_tee'],
  ])('avviser %s', (_label, raw, expected) => {
    expect(parseGuestProfile(raw)).toEqual({ ok: false, error: expected });
  });

  it('grensene 54,0 og +10 er gyldige', () => {
    expect(parseGuestProfile({ name: 'A', hcp: '54,0', tee: 'M' })).toMatchObject({ ok: true });
    expect(parseGuestProfile({ name: 'A', hcp: '+10', tee: 'M' })).toMatchObject({
      ok: true,
      profile: { hcpIndex: -10 },
    });
  });
});

describe('tee-mapping', () => {
  it.each([
    ['M', 'mens', 'mens', 'normal'],
    ['D', 'ladies', 'ladies', 'normal'],
    ['J', 'juniors', null, 'junior'],
  ] as const)('%s → tee_gender %s / gender %s / level %s', (tee, teeGender, gender, level) => {
    expect(guestTeeToTeeGender(tee)).toBe(teeGender);
    expect(guestTeeToUserGender(tee)).toBe(gender);
    expect(guestTeeToLevel(tee)).toBe(level);
  });
});

describe('isGuestPlaceholderEmail', () => {
  it('matcher plassholder-domenet, ikke ekte adresser', () => {
    expect(isGuestPlaceholderEmail(`gjest+abc@${GUEST_EMAIL_DOMAIN}`)).toBe(true);
    expect(isGuestPlaceholderEmail('kari@example.com')).toBe(false);
    expect(isGuestPlaceholderEmail('kari@tornygolf.no')).toBe(false);
  });
});

const PROFILE = { name: 'Kari Gjest', hcpIndex: 18.4, tee: 'D' as const };

describe('createGuestUser', () => {
  it('happy path: createUser → users-update med is_guest + profile_completed_at', async () => {
    const fake = fakeAdmin();
    getAdminClientMock.mockReturnValue(fake.client);

    const res = await createGuestUser(PROFILE, { retryDelayMs: 0 });

    expect(res).toMatchObject({ ok: true, userId: 'guest-uuid-1' });
    if (!res.ok) throw new Error('unreachable');
    expect(res.placeholderEmail).toMatch(
      new RegExp(`^gjest\\+[0-9a-f-]{36}@${GUEST_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`),
    );
    expect(fake.createUser).toHaveBeenCalledWith({
      email: res.placeholderEmail,
      email_confirm: true,
    });
    expect(fake.usersUpdatePayloads[0]).toMatchObject({
      name: 'Kari Gjest',
      hcp_index: 18.4,
      gender: 'ladies',
      level: 'normal',
      is_guest: true,
    });
    // profile_completed_at MÅ settes — publish-/start-gatene og
    // orphan-sweeperen nekter/sletter ellers (se helper-docstring).
    expect(fake.usersUpdatePayloads[0]!.profile_completed_at).toBeTruthy();
    expect(fake.deleteUser).not.toHaveBeenCalled();
  });

  it('createUser-feil → guest_auth_create_failed uten kompensasjon', async () => {
    const fake = fakeAdmin({ createUserFails: true });
    getAdminClientMock.mockReturnValue(fake.client);

    const res = await createGuestUser(PROFILE, { retryDelayMs: 0 });

    expect(res).toEqual({ ok: false, error: 'guest_auth_create_failed' });
    expect(fake.deleteUser).not.toHaveBeenCalled();
  });

  it('users-update 0 rader (alle forsøk) → kompenserende deleteUser', async () => {
    const fake = fakeAdmin({ usersUpdateRows: [] });
    getAdminClientMock.mockReturnValue(fake.client);

    const res = await createGuestUser(PROFILE, { retryDelayMs: 0 });

    expect(res).toEqual({ ok: false, error: 'guest_profile_update_failed' });
    expect(fake.deleteUser).toHaveBeenCalledWith('guest-uuid-1');
  });
});

describe('createGuestPlayer', () => {
  it('happy path: roster-rad med tee_gender + accepted_at, team/flight null', async () => {
    const fake = fakeAdmin();
    getAdminClientMock.mockReturnValue(fake.client);

    const res = await createGuestPlayer('game-1', PROFILE, { retryDelayMs: 0 });

    expect(res).toMatchObject({ ok: true, userId: 'guest-uuid-1' });
    expect(fake.gpInsertPayloads[0]).toMatchObject({
      game_id: 'game-1',
      user_id: 'guest-uuid-1',
      team_number: null,
      flight_number: null,
      course_handicap: null,
      tee_gender: 'ladies',
    });
    // En gjest kan aldri selv bekrefte — accepted_at settes ved opprettelse.
    expect(fake.gpInsertPayloads[0]!.accepted_at).toBeTruthy();
  });

  it('roster-insert-feil → kompenserende deleteUser (cascade rydder users-raden)', async () => {
    const fake = fakeAdmin({ gamePlayersInsertError: { message: 'rls says no' } });
    getAdminClientMock.mockReturnValue(fake.client);

    const res = await createGuestPlayer('game-1', PROFILE, { retryDelayMs: 0 });

    expect(res).toEqual({ ok: false, error: 'guest_roster_insert_failed' });
    expect(fake.deleteUser).toHaveBeenCalledWith('guest-uuid-1');
  });

  it('feilet bruker-opprettelse når aldri roster-insertet', async () => {
    const fake = fakeAdmin({ createUserFails: true });
    getAdminClientMock.mockReturnValue(fake.client);

    const res = await createGuestPlayer('game-1', PROFILE, { retryDelayMs: 0 });

    expect(res).toEqual({ ok: false, error: 'guest_auth_create_failed' });
    expect(fake.gpInsert).not.toHaveBeenCalled();
  });
});
