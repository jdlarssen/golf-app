import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * The web wrappers around the team cores (#2840). The gates and the writes are
 * tested in `lib/games/teamRegistrationCore.test.ts` and
 * `lib/games/teamDashboardCore.test.ts`; what stays here is the web's own part:
 * the honeypot, the checks before the auth gate, the redirects to /login and
 * /complete-profile with the right `next` (#1344), and that each action hands
 * its core the verified user id, never one from the input.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'nb' }));

let serverMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));
vi.mock('@/lib/admin/rateLimit', () => ({
  getClientIp: async () => '203.0.113.7',
}));

const core = {
  submitTeamRegistrationCore: vi.fn(),
  acceptTeamInviteCore: vi.fn(),
  declineTeamInviteCore: vi.fn(),
  removeTeamMemberCore: vi.fn(),
  resendTeamInviteCore: vi.fn(),
  transferCaptaincyCore: vi.fn(),
  attachToCaptainTeamCore: vi.fn(),
  addTeamMemberCore: vi.fn(),
};
vi.mock('@/lib/games/teamRegistrationCore', () => ({
  submitTeamRegistrationCore: (...a: unknown[]) => core.submitTeamRegistrationCore(...a),
  acceptTeamInviteCore: (...a: unknown[]) => core.acceptTeamInviteCore(...a),
  declineTeamInviteCore: (...a: unknown[]) => core.declineTeamInviteCore(...a),
}));
vi.mock('@/lib/games/teamDashboardCore', () => ({
  removeTeamMemberCore: (...a: unknown[]) => core.removeTeamMemberCore(...a),
  resendTeamInviteCore: (...a: unknown[]) => core.resendTeamInviteCore(...a),
  transferCaptaincyCore: (...a: unknown[]) => core.transferCaptaincyCore(...a),
  attachToCaptainTeamCore: (...a: unknown[]) => core.attachToCaptainTeamCore(...a),
  addTeamMemberCore: (...a: unknown[]) => core.addTeamMemberCore(...a),
}));

import {
  acceptTeamInvite,
  addTeamMember,
  attachToCaptainTeam,
  declineTeamInvite,
  removeTeamMember,
  resendTeamInvite,
  submitTeamRegistration,
  transferCaptaincy,
} from './teamActions';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const FRIEND_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const SHORT_ID = 'abc12345';
const BASE_NEXT = `/signup/${SHORT_ID}`;
const TEAM_NEXT = `/signup/${SHORT_ID}/team`;

function signedIn(profileCompleted = true): void {
  serverMock = buildSupabaseMock([
    { data: { profile_completed_at: profileCompleted ? '2026-01-01T00:00:00Z' : null }, error: null },
  ]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: USER_ID, email: 'kaptein@example.com' } },
  });
}

function signedOut(): void {
  serverMock = buildSupabaseMock([]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { user: null } });
}

const submitInput = { shortId: SHORT_ID, teamName: 'Birdie-jegerne', memberIds: [FRIEND_ID] };

beforeEach(() => {
  vi.clearAllMocks();
  signedIn();
  for (const fn of Object.values(core)) fn.mockResolvedValue({ ok: true });
});

describe('submitTeamRegistration', () => {
  it('honeypot filled → ok without the core', async () => {
    const result = await submitTeamRegistration({ ...submitInput, website: 'http://bot.example' });
    expect(result.ok).toBe(true);
    expect(core.submitTeamRegistrationCore).not.toHaveBeenCalled();
  });

  it('a bad short id or team name answers before the auth gate', async () => {
    signedOut();
    expect(await submitTeamRegistration({ ...submitInput, shortId: 'NOPE' })).toEqual({
      ok: false,
      error: 'game_not_found',
    });
    expect(await submitTeamRegistration({ ...submitInput, teamName: 'AB' })).toEqual({
      ok: false,
      error: 'team_name_invalid',
    });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(core.submitTeamRegistrationCore).not.toHaveBeenCalled();
  });

  it('signed out → /login, back to the signup page', async () => {
    signedOut();
    await expect(submitTeamRegistration(submitInput)).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith(expect.objectContaining({ href: `/login?next=${BASE_NEXT}` }));
    expect(core.submitTeamRegistrationCore).not.toHaveBeenCalled();
  });

  it('profile not complete → /complete-profile, back to the signup page', async () => {
    signedIn(false);
    await expect(submitTeamRegistration(submitInput)).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/complete-profile?next=${BASE_NEXT}` }),
    );
  });

  it('hands the core the session user, the member ids and the client IP, and returns its answer', async () => {
    core.submitTeamRegistrationCore.mockResolvedValue({ ok: false, error: 'teammate_not_friend' });
    expect(await submitTeamRegistration(submitInput)).toEqual({ ok: false, error: 'teammate_not_friend' });
    expect(core.submitTeamRegistrationCore).toHaveBeenCalledWith(
      USER_ID,
      { shortId: SHORT_ID, teamName: 'Birdie-jegerne', memberIds: [FRIEND_ID] },
      { ip: '203.0.113.7' },
    );
  });

  it("the core's profile_incomplete becomes the same redirect", async () => {
    core.submitTeamRegistrationCore.mockResolvedValue({ ok: false, error: 'profile_incomplete' });
    await expect(submitTeamRegistration(submitInput)).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/complete-profile?next=${BASE_NEXT}` }),
    );
  });
});

describe('#1344: the team page actions keep the /team context', () => {
  const actions = [
    ['acceptTeamInvite', () => acceptTeamInvite(REQUEST_ID, SHORT_ID)],
    ['declineTeamInvite', () => declineTeamInvite(REQUEST_ID, SHORT_ID)],
    ['removeTeamMember', () => removeTeamMember(REQUEST_ID, SHORT_ID)],
    ['resendTeamInvite', () => resendTeamInvite(REQUEST_ID, SHORT_ID)],
    ['transferCaptaincy', () => transferCaptaincy(REQUEST_ID, SHORT_ID)],
    ['attachToCaptainTeam', () => attachToCaptainTeam('inv-1', SHORT_ID)],
    ['addTeamMember', () => addTeamMember(SHORT_ID, FRIEND_ID)],
  ] as const;

  it.each(actions)('%s signed out → /login with /team in next', async (_name, run) => {
    signedOut();
    await expect(run()).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith(expect.objectContaining({ href: `/login?next=${TEAM_NEXT}` }));
  });

  it.each(actions)('%s without a profile → /complete-profile with /team in next', async (_name, run) => {
    signedIn(false);
    await expect(run()).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/complete-profile?next=${TEAM_NEXT}` }),
    );
  });

  it.each(actions)('%s with a bad short id → not_found, no core', async (name) => {
    const bad = 'NOPE';
    const run = {
      acceptTeamInvite: () => acceptTeamInvite(REQUEST_ID, bad),
      declineTeamInvite: () => declineTeamInvite(REQUEST_ID, bad),
      removeTeamMember: () => removeTeamMember(REQUEST_ID, bad),
      resendTeamInvite: () => resendTeamInvite(REQUEST_ID, bad),
      transferCaptaincy: () => transferCaptaincy(REQUEST_ID, bad),
      attachToCaptainTeam: () => attachToCaptainTeam('inv-1', bad),
      addTeamMember: () => addTeamMember(bad, FRIEND_ID),
    }[name];
    expect(await run()).toEqual({ ok: false, error: 'not_found' });
    for (const fn of Object.values(core)) expect(fn).not.toHaveBeenCalled();
  });
});

describe('each action hands its core the session user', () => {
  it('accept, decline, remove, resend and transfer pass the request id', async () => {
    await acceptTeamInvite(REQUEST_ID, SHORT_ID);
    signedIn();
    await declineTeamInvite(REQUEST_ID, SHORT_ID);
    signedIn();
    await removeTeamMember(REQUEST_ID, SHORT_ID);
    signedIn();
    await resendTeamInvite(REQUEST_ID, SHORT_ID);
    signedIn();
    await transferCaptaincy(REQUEST_ID, SHORT_ID);
    const input = { shortId: SHORT_ID, requestId: REQUEST_ID };
    expect(core.acceptTeamInviteCore).toHaveBeenCalledWith(USER_ID, input);
    expect(core.declineTeamInviteCore).toHaveBeenCalledWith(USER_ID, input);
    expect(core.removeTeamMemberCore).toHaveBeenCalledWith(USER_ID, input);
    expect(core.resendTeamInviteCore).toHaveBeenCalledWith(USER_ID, input);
    expect(core.transferCaptaincyCore).toHaveBeenCalledWith(USER_ID, input);
  });

  it("attach passes the caller's own client for befriend_inviter, and returns team_unknown as is", async () => {
    core.attachToCaptainTeamCore.mockResolvedValue({ ok: false, error: 'team_unknown' });
    expect(await attachToCaptainTeam('inv-1', SHORT_ID)).toEqual({ ok: false, error: 'team_unknown' });
    expect(core.attachToCaptainTeamCore).toHaveBeenCalledWith(
      USER_ID,
      { shortId: SHORT_ID, invitationId: 'inv-1' },
      { userClient: serverMock },
    );
  });

  it('addTeamMember passes the friend and the row to replace', async () => {
    core.addTeamMemberCore.mockResolvedValue({ ok: false, error: 'team_full' });
    expect(await addTeamMember(SHORT_ID, FRIEND_ID, REQUEST_ID)).toEqual({ ok: false, error: 'team_full' });
    expect(core.addTeamMemberCore).toHaveBeenCalledWith(USER_ID, {
      shortId: SHORT_ID,
      friendId: FRIEND_ID,
      replaceRequestId: REQUEST_ID,
    });
  });
});
