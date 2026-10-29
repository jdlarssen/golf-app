import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
  type QueryResult,
} from '@/tests/serverActionMocks';
import { moveGameChoices } from '@/lib/games/moveGameChoices';

/**
 * #2480: «Flytt og si fra». The gate is `requireAdminOrCreator` (mocked; its
 * own suite covers it). Query order: games.select(status, tee-off) →
 * games.update(scheduled_tee_off_at).eq(status, scheduled).select(id). Who is
 * told lives in `notifyGameMoved` (mocked); here only whether it is called.
 */

const redirectMock = makeRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string }) => redirectMock(arg.href),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag: (...args: unknown[]) => revalidateTagMock(...args) }));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => supabaseMock }));

let isAdmin = false;
vi.mock('@/lib/admin/auth', () => ({
  requireAdminOrCreator: vi.fn(async () => ({ userId: 'org', isAdmin, name: 'Jørgen' })),
}));

const notifyGameMovedMock = vi.fn<(...args: unknown[]) => Promise<{ notified: unknown[] }>>(
  async () => ({ notified: [{ userId: 'marte', shortName: 'Marte' }] }),
);
vi.mock('@/lib/notifications/notifyGameMoved', () => ({
  notifyGameMoved: (...args: unknown[]) => notifyGameMovedMock(...args),
}));

const GAME = 'g1';
// Three days from now, at the round's own time: always in the future.
const soon = moveGameChoices(new Date(Date.now() + 3 * 86_400_000).toISOString()).currentDay;
const later = moveGameChoices(new Date(Date.now() + 4 * 86_400_000).toISOString()).currentDay;

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

async function move(entries: Record<string, string>, queue: QueryResult[]): Promise<string> {
  supabaseMock = buildSupabaseMock(queue);
  const { moveGameAction } = await import('./actions');
  try {
    await moveGameAction(GAME, fd(entries));
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
  throw new Error('expected a redirect');
}

const scheduledAt = (day: string) => ({
  data: { status: 'scheduled', scheduled_tee_off_at: `${day}T07:00:00.000Z` },
  error: null,
});
const updates = () => supabaseMock.__fromCalls.filter((c) => c.method === 'update');

beforeEach(() => {
  vi.clearAllMocks();
  isAdmin = false;
});

describe('moveGameAction', () => {
  it('writes only the new tee-off while scheduled, tells the group and lands on the game', async () => {
    const url = await move({ day: later, time: '10:00', notify: '1' }, [
      scheduledAt(soon),
      { data: [{ id: GAME }], error: null },
    ]);

    expect(url).toBe(`/games/${GAME}?status=moved_told`);
    const iso = updates()[0].args[0] as { scheduled_tee_off_at: string };
    expect(Object.keys(iso)).toEqual(['scheduled_tee_off_at']);
    expect(supabaseMock.__fromCalls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual([
      'status',
      'scheduled',
    ]);
    expect(notifyGameMovedMock).toHaveBeenCalledWith({
      gameId: GAME,
      actorUserId: 'org',
      teeOffAt: iso.scheduled_tee_off_at,
      courseChanged: false,
    });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME}`, { expire: 0 });
  });

  it('with the switch off it moves the round and tells nobody; an admin lands on the desk', async () => {
    isAdmin = true;
    const url = await move({ day: later, time: '10:00' }, [
      scheduledAt(soon),
      { data: [{ id: GAME }], error: null },
    ]);

    expect(url).toBe(`/admin/games/${GAME}?status=moved`);
    expect(updates()).toHaveLength(1);
    expect(notifyGameMovedMock).not.toHaveBeenCalled();
  });

  it('the same time writes nothing and tells nobody', async () => {
    const day = soon;
    const current = scheduledAt(day);
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Oslo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(current.data.scheduled_tee_off_at));

    const url = await move({ day, time, notify: '1' }, [current]);

    expect(url).toBe(`/games/${GAME}`);
    expect(updates()).toHaveLength(0);
    expect(notifyGameMovedMock).not.toHaveBeenCalled();
  });

  it('refuses a time in the past and a day that is not one, before reading anything', async () => {
    const yesterday = moveGameChoices(new Date(Date.now() - 86_400_000).toISOString()).currentDay;
    expect(await move({ day: yesterday, time: '10:00', notify: '1' }, [])).toBe(
      `/games/${GAME}/flytt?error=in_past`,
    );
    expect(await move({ day: '2026-02-30', time: '10:00' }, [])).toBe(`/games/${GAME}/flytt?error=invalid`);
    expect(supabaseMock.__fromCalls).toHaveLength(0);
    expect(notifyGameMovedMock).not.toHaveBeenCalled();
  });

  it('a round that started while the page was open is not moved and nobody is told', async () => {
    // Started before the read …
    expect(
      await move({ day: later, time: '10:00', notify: '1' }, [
        { data: { status: 'active', scheduled_tee_off_at: null }, error: null },
      ]),
    ).toBe(`/games/${GAME}?error=not_editable`);
    expect(updates()).toHaveLength(0);

    // … or between the read and the write: the lock matches no row.
    expect(
      await move({ day: later, time: '10:00', notify: '1' }, [scheduledAt(soon), { data: [], error: null }]),
    ).toBe(`/games/${GAME}?error=not_editable`);
    expect(notifyGameMovedMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
