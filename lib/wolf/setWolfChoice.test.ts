import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertMock = vi.fn();
const getUserMock = vi.fn();
const revalidateTagMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: () => ({
    auth: { getUser: getUserMock },
    from: () => ({ upsert: upsertMock }),
  }),
}));

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

import { setWolfChoice } from './setWolfChoice';

beforeEach(() => {
  upsertMock.mockReset();
  getUserMock.mockReset();
  revalidateTagMock.mockReset();
});

function mockAuthed(userId: string) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } } });
}

describe('setWolfChoice — validering før DB', () => {
  it('avviser ikke-autentisert bruker', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const result = await setWolfChoice({
      gameId: 'g',
      holeNumber: 1,
      wolfUserId: 'wolf',
      choice: 'lone',
      partnerUserId: null,
    });

    expect(result).toEqual({ ok: false, error: 'not_authenticated' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('avviser hole_number utenfor 1-18', async () => {
    mockAuthed('wolf');

    const result = await setWolfChoice({
      gameId: 'g',
      holeNumber: 0,
      wolfUserId: 'wolf',
      choice: 'lone',
      partnerUserId: null,
    });

    expect(result).toEqual({ ok: false, error: 'invalid_hole' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('avviser hole_number 19', async () => {
    mockAuthed('wolf');

    const result = await setWolfChoice({
      gameId: 'g',
      holeNumber: 19,
      wolfUserId: 'wolf',
      choice: 'lone',
      partnerUserId: null,
    });

    expect(result).toEqual({ ok: false, error: 'invalid_hole' });
  });

  it('avviser ugyldig choice-verdi', async () => {
    mockAuthed('wolf');

    const result = await setWolfChoice({
      gameId: 'g',
      holeNumber: 1,
      wolfUserId: 'wolf',
      // @ts-expect-error — tester defensiv validering
      choice: 'stableford',
      partnerUserId: null,
    });

    expect(result).toEqual({ ok: false, error: 'invalid_choice' });
  });

  it('partner uten partner_user_id → partner_required', async () => {
    mockAuthed('wolf');

    const result = await setWolfChoice({
      gameId: 'g',
      holeNumber: 1,
      wolfUserId: 'wolf',
      choice: 'partner',
      partnerUserId: null,
    });

    expect(result).toEqual({ ok: false, error: 'partner_required' });
  });

  it('lone med partner_user_id → partner_must_be_null', async () => {
    mockAuthed('wolf');

    const result = await setWolfChoice({
      gameId: 'g',
      holeNumber: 1,
      wolfUserId: 'wolf',
      choice: 'lone',
      partnerUserId: 'p',
    });

    expect(result).toEqual({ ok: false, error: 'partner_must_be_null' });
  });

  it('blind med partner_user_id → partner_must_be_null', async () => {
    mockAuthed('wolf');

    const result = await setWolfChoice({
      gameId: 'g',
      holeNumber: 1,
      wolfUserId: 'wolf',
      choice: 'blind',
      partnerUserId: 'p',
    });

    expect(result).toEqual({ ok: false, error: 'partner_must_be_null' });
  });

  it('partner = wolf → partner_cannot_be_wolf', async () => {
    mockAuthed('wolf');

    const result = await setWolfChoice({
      gameId: 'g',
      holeNumber: 1,
      wolfUserId: 'wolf',
      choice: 'partner',
      partnerUserId: 'wolf',
    });

    expect(result).toEqual({ ok: false, error: 'partner_cannot_be_wolf' });
  });
});

describe('setWolfChoice — DB-interaksjon', () => {
  it('happy path: partner → upserter med entered_by + revaliderer game-tag', async () => {
    mockAuthed('wolf-1');
    upsertMock.mockResolvedValue({ error: null });

    const result = await setWolfChoice({
      gameId: 'g-42',
      holeNumber: 5,
      wolfUserId: 'wolf-1',
      choice: 'partner',
      partnerUserId: 'p-1',
    });

    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(
      {
        game_id: 'g-42',
        hole_number: 5,
        wolf_user_id: 'wolf-1',
        choice: 'partner',
        partner_user_id: 'p-1',
        entered_by: 'wolf-1',
      },
      { onConflict: 'game_id,hole_number' },
    );
    expect(revalidateTagMock).toHaveBeenCalledWith('game-g-42', 'max');
  });

  it('lone-valg lagrer null partner', async () => {
    mockAuthed('wolf-1');
    upsertMock.mockResolvedValue({ error: null });

    const result = await setWolfChoice({
      gameId: 'g',
      holeNumber: 9,
      wolfUserId: 'wolf-1',
      choice: 'lone',
      partnerUserId: null,
    });

    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ choice: 'lone', partner_user_id: null }),
      expect.any(Object),
    );
  });

  it('entered_by settes til auth.uid() selv om wolf_user_id er annen (admin override)', async () => {
    mockAuthed('admin-user');
    upsertMock.mockResolvedValue({ error: null });

    await setWolfChoice({
      gameId: 'g',
      holeNumber: 1,
      wolfUserId: 'wolf-1',
      choice: 'lone',
      partnerUserId: null,
    });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        wolf_user_id: 'wolf-1',
        entered_by: 'admin-user',
      }),
      expect.any(Object),
    );
  });

  it('Postgres-feil → rls_denied (uten å lekke detaljer)', async () => {
    mockAuthed('wolf-1');
    upsertMock.mockResolvedValue({
      error: { message: 'new row violates row-level security policy' },
    });

    const result = await setWolfChoice({
      gameId: 'g',
      holeNumber: 1,
      wolfUserId: 'wolf-1',
      choice: 'lone',
      partnerUserId: null,
    });

    expect(result).toEqual({ ok: false, error: 'rls_denied' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
