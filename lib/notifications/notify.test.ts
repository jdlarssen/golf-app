import { describe, it, expect, vi, beforeEach } from 'vitest';

// Admin-client mock — kontrolleres per test via insertMock/userSelectMock.
const insertMock = vi.fn<(...args: unknown[]) => Promise<{ error: unknown }>>();
const userSelectMock = vi.fn<
  (...args: unknown[]) => Promise<{ data: { last_seen_at: string | null } | null }>
>();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'notifications') {
        return { insert: insertMock };
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ single: userSelectMock }),
          }),
        };
      }
      throw new Error(`unexpected from(${table}) call`);
    },
  }),
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

import { shouldSendMailFallback, OFF_APP_THRESHOLD_MS } from './notify';

beforeEach(() => {
  insertMock.mockReset();
  userSelectMock.mockReset();
  revalidateTagMock.mockReset();
  // Default: fungerende admin-insert + aktiv bruker (fresh last_seen_at).
  insertMock.mockResolvedValue({ error: null });
  userSelectMock.mockResolvedValue({
    data: { last_seen_at: new Date().toISOString() },
  });
});

describe('shouldSendMailFallback', () => {
  it('returnerer true når last_seen_at er null (aldri vært i appen)', () => {
    expect(shouldSendMailFallback(null)).toBe(true);
  });

  it('returnerer true når last_seen_at er eldre enn terskel', () => {
    const oldDate = new Date(Date.now() - OFF_APP_THRESHOLD_MS - 1000);
    expect(shouldSendMailFallback(oldDate.toISOString())).toBe(true);
  });

  it('returnerer false når last_seen_at er nyere enn terskel', () => {
    const recent = new Date(Date.now() - 60 * 1000); // 1 min siden
    expect(shouldSendMailFallback(recent.toISOString())).toBe(false);
  });

  it('returnerer true når last_seen_at er ugyldig ISO', () => {
    expect(shouldSendMailFallback('not-a-date')).toBe(true);
  });
});

describe('notify (validation-rekkefølge)', () => {
  // Phase 1-review-funn (#172): `parseNotificationPayload` MÅ kjøre før
  // insert. Uten denne testen var rekkefølgen kun implisitt — en bug-fix
  // som flyttet validering bak insert hadde sluppet gjennom.

  it('valid payload → parseNotificationPayload passerer, admin.insert kalles', async () => {
    const { notify } = await import('./notify');

    const result = await notify({
      userId: '00000000-0000-0000-0000-000000000001',
      kind: 'invite',
      payload: {
        game_id: '00000000-0000-0000-0000-000000000002',
        game_name: 'Vinter-cup',
        invited_by_name: 'Jørgen',
      },
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      user_id: '00000000-0000-0000-0000-000000000001',
      kind: 'invite',
      payload: expect.objectContaining({ invited_by_name: 'Jørgen' }),
    });
    expect(revalidateTagMock).toHaveBeenCalledWith(
      'notifications-00000000-0000-0000-0000-000000000001',
      'max',
    );
    expect(result.shouldAlsoSendMail).toBe(false); // aktiv bruker
  });

  it('malformed payload (manglende felt) → kaster FØR insert kalles', async () => {
    const { notify } = await import('./notify');

    await expect(
      notify({
        userId: '00000000-0000-0000-0000-000000000001',
        kind: 'scorecard_submitted',
        // Mangler påkrevde game_id, game_name, player_name — Zod kaster.
        payload: { game_id: 'not-a-uuid' } as never,
      }),
    ).rejects.toThrow();

    // Load-bearing: insert MÅ aldri kjøres på malformed input. Hvis denne
    // assertion-en feiler, har valideringen blitt flyttet bak insert.
    expect(insertMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('insert-error → returnerer shouldAlsoSendMail: false (fail-closed)', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    insertMock.mockResolvedValueOnce({ error: { message: 'permission denied' } });

    const { notify } = await import('./notify');

    const result = await notify({
      userId: '00000000-0000-0000-0000-000000000001',
      kind: 'invite',
      payload: {
        game_id: '00000000-0000-0000-0000-000000000002',
        game_name: 'Vinter-cup',
        invited_by_name: 'Jørgen',
      },
    });

    expect(result.shouldAlsoSendMail).toBe(false);
    expect(revalidateTagMock).not.toHaveBeenCalled();
    expect(consoleErr).toHaveBeenCalledWith(
      '[notifications] insert failed',
      expect.objectContaining({ message: 'permission denied' }),
    );
    consoleErr.mockRestore();
  });
});
