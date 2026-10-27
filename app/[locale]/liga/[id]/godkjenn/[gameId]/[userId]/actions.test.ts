import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, makeLocaleRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * #2661: the marker page's two answers. The rule is `mayApproveAsMarker`
 * behind `markerReviewAccess` (tested there); the write, notice and finish
 * are the cores' (tested there). Here: the gate is asked on every post, a
 * card from another league or one that no longer waits writes nothing, the
 * named marker's approval carries `markerUserId` into the write, the
 * receipt only promises the table when the flight finished, and a rejection
 * passes the reason on.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'nb' }));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));

let server: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => server }));
let admin: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin }));

const markerReviewAccess = vi.fn();
vi.mock('@/lib/league/markerReviewAccess', () => ({
  markerReviewAccess: (...args: unknown[]) => markerReviewAccess(...args),
}));
const approveScorecardCore = vi.fn();
const rejectScorecardCore = vi.fn();
vi.mock('@/lib/games/reviewScorecardCore', () => ({
  approveScorecardCore: (...args: unknown[]) => approveScorecardCore(...args),
  rejectScorecardCore: (...args: unknown[]) => rejectScorecardCore(...args),
}));

import { approveAsMarker, rejectAsMarker } from './actions';

const PAGE = '/liga/l1/godkjenn/g1/anders';
const review = (over: Record<string, unknown> = {}) => ({
  ok: true,
  role: 'marker',
  flight: { leagueId: 'l1' },
  game: { gameMode: 'stableford' },
  state: 'pending',
  ...over,
});
const lastRedirect = () => {
  const arg = redirectMock.mock.calls.at(-1)?.[0];
  return typeof arg === 'string' ? arg : arg?.href;
};

beforeEach(() => {
  vi.clearAllMocks();
  server = buildSupabaseMock([]);
  (server.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { user: { id: 'mia' } } });
  admin = buildSupabaseMock([{ data: { status: 'finished' } }]);
  approveScorecardCore.mockResolvedValue({ ok: true, alreadyDone: false });
  rejectScorecardCore.mockResolvedValue({ ok: true, alreadyDone: false });
});

describe('approveAsMarker', () => {
  it.each([
    ['the gate refuses', { ok: false, reason: 'forbidden' }, 'forbidden'],
    ['the card is in another league', review({ flight: { leagueId: 'other' } }), 'forbidden'],
    ['the card no longer waits', review({ state: 'approved' }), 'not_pending'],
  ])('%s: nothing is written', async (_label, answer, error) => {
    markerReviewAccess.mockResolvedValue(answer);
    await expect(approveAsMarker('l1', 'g1', 'anders')).rejects.toBeInstanceOf(RedirectError);
    expect({ redirect: lastRedirect(), wrote: approveScorecardCore.mock.calls.length }).toEqual({
      redirect: `${PAGE}?error=${error}`,
      wrote: 0,
    });
  });

  it('the named marker approves through the core, the write must name them, and the round counts', async () => {
    markerReviewAccess.mockResolvedValue(review());
    await expect(approveAsMarker('l1', 'g1', 'anders')).rejects.toBeInstanceOf(RedirectError);
    expect(approveScorecardCore.mock.calls[0][0]).toMatchObject({
      gameId: 'g1',
      approverUserId: 'mia',
      playerUserId: 'anders',
      approverRole: 'peer',
      delivererMayApprove: false,
      markerUserId: 'mia',
    });
    expect(markerReviewAccess).toHaveBeenCalledWith('mia', 'g1', 'anders');
    expect(lastRedirect()).toBe(`${PAGE}?status=approved`);
  });

  it('the organiser approves in the marker’s stead; a flight still waiting gets its own receipt', async () => {
    markerReviewAccess.mockResolvedValue(review({ role: 'organizer' }));
    admin = buildSupabaseMock([{ data: { status: 'active' } }, { data: [{ user_id: 'kari' }] }]);
    await expect(approveAsMarker('l1', 'g1', 'anders')).rejects.toBeInstanceOf(RedirectError);
    expect(approveScorecardCore.mock.calls[0][0]).toMatchObject({ approverRole: 'organizer', markerUserId: undefined });
    expect(lastRedirect()).toBe(`${PAGE}?status=approved_waiting`);
  });

  it('a flight whose finish failed, with nothing left to approve, promises nothing', async () => {
    markerReviewAccess.mockResolvedValue(review());
    admin = buildSupabaseMock([{ data: { status: 'active' } }, { data: [] }]);
    await expect(approveAsMarker('l1', 'g1', 'anders')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`${PAGE}?status=approved_only`);
  });

  it('a failed write says so', async () => {
    markerReviewAccess.mockResolvedValue(review());
    approveScorecardCore.mockResolvedValue({ ok: false, reason: 'not_pending' });
    await expect(approveAsMarker('l1', 'g1', 'anders')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`${PAGE}?error=db`);
  });
});

describe('rejectAsMarker', () => {
  it('a refused gate writes nothing', async () => {
    markerReviewAccess.mockResolvedValue({ ok: false, reason: 'forbidden' });
    const form = new FormData();
    form.set('player_user_id', 'anders');
    await expect(rejectAsMarker('l1', 'g1', form)).rejects.toBeInstanceOf(RedirectError);
    expect({ redirect: lastRedirect(), wrote: rejectScorecardCore.mock.calls.length }).toEqual({
      redirect: `${PAGE}?error=forbidden`,
      wrote: 0,
    });
  });

  it('sends the card back with the reason', async () => {
    markerReviewAccess.mockResolvedValue(review());
    const form = new FormData();
    form.set('player_user_id', 'anders');
    form.set('reason', 'Hull 4 var 5 slag');
    await expect(rejectAsMarker('l1', 'g1', form)).rejects.toBeInstanceOf(RedirectError);
    expect(rejectScorecardCore.mock.calls[0][0]).toMatchObject({
      gameId: 'g1',
      gameMode: 'stableford',
      rejecterUserId: 'mia',
      playerUserId: 'anders',
      rawReason: 'Hull 4 var 5 slag',
    });
    expect(lastRedirect()).toBe(`${PAGE}?status=rejected`);
  });
});
