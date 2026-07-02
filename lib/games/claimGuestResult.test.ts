import { describe, it, expect, vi, beforeEach } from 'vitest';

// #1009 Type A: claim-valideringen + den atomisk-eller-kompenserte
// e-post-flippen (auth + public.users, revert ved halvfeil). Mock kun ved
// systemgrensen (admin-klienten).

vi.mock('server-only', () => ({}));

const { getAdminClientMock } = vi.hoisted(() => ({
  getAdminClientMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: getAdminClientMock,
}));

import { claimGuestEmail, normalizeClaimEmail } from './claimGuestResult';

type FakeOpts = {
  guestRow?: {
    id: string;
    name: string | null;
    email: string;
    is_guest: boolean;
  } | null;
  onRoster?: boolean;
  existingEmailOwner?: { id: string } | null;
  authUpdateError?: { message: string } | null;
  usersUpdateRows?: Array<{ id: string }>;
};

function fakeAdmin(opts: FakeOpts = {}) {
  const guestRow =
    opts.guestRow === undefined
      ? {
          id: 'guest-1',
          name: 'Kari Gjest',
          email: 'gjest+abc@guest.tornygolf.no',
          is_guest: true,
        }
      : opts.guestRow;

  const updateUserById = vi.fn(async () => ({
    data: {},
    error: opts.authUpdateError ?? null,
  }));

  const usersUpdateArgs: Record<string, unknown>[] = [];

  function usersTable() {
    return {
      select: (cols: string) => {
        if (cols.includes('is_guest')) {
          // Mål-oppslaget (eq id → maybeSingle)
          return {
            eq: () => ({ maybeSingle: async () => ({ data: guestRow, error: null }) }),
          };
        }
        // Duplikat-sjekken (ilike email → maybeSingle)
        return {
          ilike: () => ({
            maybeSingle: async () => ({
              data: opts.existingEmailOwner ?? null,
              error: null,
            }),
          }),
        };
      },
      update: (payload: Record<string, unknown>) => {
        usersUpdateArgs.push(payload);
        return {
          eq: () => ({
            select: async () => ({
              data: opts.usersUpdateRows ?? [{ id: 'guest-1' }],
              error: null,
            }),
          }),
        };
      },
    };
  }

  const client = {
    auth: { admin: { updateUserById } },
    from: vi.fn((table: string) => {
      if (table === 'users') return usersTable();
      if (table === 'game_players') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: opts.onRoster === false ? null : { user_id: 'guest-1' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { client, updateUserById, usersUpdateArgs };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeClaimEmail', () => {
  it('trimmer + lowercaser gyldig adresse', () => {
    expect(normalizeClaimEmail('  Kari@Example.COM ')).toBe('kari@example.com');
  });

  it.each([
    ['tom', ''],
    ['uten @', 'kari.example.com'],
    ['plassholder-domenet', 'gjest+x@guest.tornygolf.no'],
  ])('avviser %s', (_label, raw) => {
    expect(normalizeClaimEmail(raw)).toBeNull();
  });
});

describe('claimGuestEmail', () => {
  const OPTS = { gameId: 'game-1', guestUserId: 'guest-1', email: 'kari@example.com' };

  it('happy path: flipper auth + public.users, ingen revert', async () => {
    const fake = fakeAdmin();
    getAdminClientMock.mockReturnValue(fake.client);

    const res = await claimGuestEmail(OPTS);

    expect(res).toEqual({ ok: true, guestName: 'Kari Gjest', alreadyClaimed: false });
    expect(fake.updateUserById).toHaveBeenCalledTimes(1);
    expect(fake.updateUserById).toHaveBeenCalledWith('guest-1', {
      email: 'kari@example.com',
      email_confirm: true,
    });
    expect(fake.usersUpdateArgs).toEqual([{ email: 'kari@example.com' }]);
  });

  it('mål som ikke er gjest → guest_claim_not_guest', async () => {
    const fake = fakeAdmin({
      guestRow: { id: 'guest-1', name: 'X', email: 'x@example.com', is_guest: false },
    });
    getAdminClientMock.mockReturnValue(fake.client);

    expect(await claimGuestEmail(OPTS)).toEqual({
      ok: false,
      error: 'guest_claim_not_guest',
    });
    expect(fake.updateUserById).not.toHaveBeenCalled();
  });

  it('gjest utenfor spillets roster → guest_claim_not_guest', async () => {
    const fake = fakeAdmin({ onRoster: false });
    getAdminClientMock.mockReturnValue(fake.client);

    expect(await claimGuestEmail(OPTS)).toEqual({
      ok: false,
      error: 'guest_claim_not_guest',
    });
    expect(fake.updateUserById).not.toHaveBeenCalled();
  });

  it('adressen tilhører en annen konto → guest_email_taken (beslutning 6)', async () => {
    const fake = fakeAdmin({ existingEmailOwner: { id: 'other-user' } });
    getAdminClientMock.mockReturnValue(fake.client);

    expect(await claimGuestEmail(OPTS)).toEqual({
      ok: false,
      error: 'guest_email_taken',
    });
    expect(fake.updateUserById).not.toHaveBeenCalled();
  });

  it('re-send av samme adresse → ok uten nye flips (idempotent)', async () => {
    const fake = fakeAdmin({
      guestRow: {
        id: 'guest-1',
        name: 'Kari Gjest',
        email: 'kari@example.com',
        is_guest: true,
      },
    });
    getAdminClientMock.mockReturnValue(fake.client);

    expect(await claimGuestEmail(OPTS)).toEqual({
      ok: true,
      guestName: 'Kari Gjest',
      alreadyClaimed: true,
    });
    expect(fake.updateUserById).not.toHaveBeenCalled();
    expect(fake.usersUpdateArgs).toEqual([]);
  });

  it('auth-flip feiler → guest_claim_failed, public.users røres ikke', async () => {
    const fake = fakeAdmin({ authUpdateError: { message: 'duplicate' } });
    getAdminClientMock.mockReturnValue(fake.client);

    expect(await claimGuestEmail(OPTS)).toEqual({
      ok: false,
      error: 'guest_claim_failed',
    });
    expect(fake.usersUpdateArgs).toEqual([]);
  });

  it('public.users-oppdatering 0 rader → auth-flippen reverteres', async () => {
    const fake = fakeAdmin({ usersUpdateRows: [] });
    getAdminClientMock.mockReturnValue(fake.client);

    expect(await claimGuestEmail(OPTS)).toEqual({
      ok: false,
      error: 'guest_claim_failed',
    });
    // Kall 1: flip til ny adresse; kall 2: revert til plassholderen.
    expect(fake.updateUserById).toHaveBeenCalledTimes(2);
    expect(fake.updateUserById).toHaveBeenLastCalledWith('guest-1', {
      email: 'gjest+abc@guest.tornygolf.no',
      email_confirm: true,
    });
  });
});
