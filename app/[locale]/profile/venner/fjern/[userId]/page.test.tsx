import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Type C render test (docs/test-discipline.md), ONE test: the confirmation
 * before removing a friend (#2267). Someone who is not your friend sends you
 * back to the friends page before any name is read, so a stranger's id never
 * shows a name; a friend gets the form with their id. The action itself
 * (`removeFriend`) is unchanged and covered by lib/friends/friendActionsCore.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const FRIEND = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));
vi.mock('@/lib/auth/userId', () => ({ getProxyVerifiedUserId: async () => ME }));
vi.mock('@/lib/friends/getFriendIds', () => ({ getFriendIds: async () => [FRIEND] }));
const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({ redirect: (arg: never) => redirectMock(arg) }));
// The page only needs the reference for `<form action=…>`.
vi.mock('../../actions', () => ({ removeFriend: vi.fn() }));

import FjernVennPage from './page';

beforeEach(() => vi.clearAllMocks());

describe('/profile/venner/fjern/[userId] (#2267)', () => {
  it.each([
    { label: 'a stranger goes back unread', target: STRANGER, isFriend: false },
    { label: 'a friend gets the form', target: FRIEND, isFriend: true },
  ])('$label', async ({ target, isFriend }) => {
    adminMock = buildSupabaseMock([
      { data: { name: 'Marte Lie', nickname: null, email: 'marte@example.test' }, error: null },
    ]);
    const params = Promise.resolve({ userId: target });

    if (!isFriend) {
      const err = await FjernVennPage({ params }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RedirectError);
      expect((err as RedirectError).url).toBe('/profile/venner');
      expect(adminMock.from).not.toHaveBeenCalled();
      return;
    }

    const { container } = render(await FjernVennPage({ params }));
    expect(adminMock.__fromCalls).toContainEqual({ table: 'users', method: 'eq', args: ['id', FRIEND] });
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    const hidden = Array.from(container.querySelectorAll('form input[type="hidden"]')).map((el) => [
      (el as HTMLInputElement).name,
      (el as HTMLInputElement).value,
    ]);
    expect(hidden).toEqual([['other_id', FRIEND]]);
    expect(screen.getByTestId('friend-remove-cancel').getAttribute('href')).toBe('/profile/venner');
    expect(container.textContent).not.toContain('marte@example.test');
  });
});
