'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getClientIp } from '@/lib/admin/rateLimit';
import { TEAM_NAME_MAX, TEAM_NAME_MIN } from '@/lib/games/registration';
import {
  acceptTeamInviteCore,
  declineTeamInviteCore,
  submitTeamRegistrationCore,
  type AcceptDeclineResult as CoreAcceptDeclineResult,
  type TeamRegistrationError as CoreTeamRegistrationError,
  type TeamRegistrationResult as CoreTeamRegistrationResult,
  type TeamSlotFailReason as CoreTeamSlotFailReason,
  type TeamSlotResult as CoreTeamSlotResult,
} from '@/lib/games/teamRegistrationCore';
import {
  addTeamMemberCore,
  attachToCaptainTeamCore,
  removeTeamMemberCore,
  resendTeamInviteCore,
  transferCaptaincyCore,
  type AddTeamMemberResult as CoreAddTeamMemberResult,
  type AttachTeamResult as CoreAttachTeamResult,
  type TransferCaptaincyResult as CoreTransferCaptaincyResult,
} from '@/lib/games/teamDashboardCore';

/**
 * Team actions for self-registration (#199 chunks 8+9). The gates and the
 * writes live in `lib/games/teamRegistrationCore.ts` and
 * `lib/games/teamDashboardCore.ts`, shared with the app's routes (#2840). What
 * belongs to the web stays here: cookie auth, the redirects to /login and
 * /complete-profile, the honeypot and the client IP.
 */

// Plain aliases on purpose: `export type { X }` compiles and passes every test,
// but in a 'use server' file the transform keeps it as a runtime export, and the
// page crashes with «X is not defined».
export type TeamSlotFailReason = CoreTeamSlotFailReason;
export type TeamSlotResult = CoreTeamSlotResult;
export type TeamRegistrationResult = CoreTeamRegistrationResult;
export type TeamRegistrationError = CoreTeamRegistrationError;
export type AcceptDeclineResult = CoreAcceptDeclineResult;
export type AttachTeamResult = CoreAttachTeamResult;
export type TransferCaptaincyResult = CoreTransferCaptaincyResult;
export type AddTeamMemberResult = CoreAddTeamMemberResult;

export type TeamRegistrationInput = {
  shortId: string;
  teamName: string;
  /** #2840: the picked friends, as user ids. */
  memberIds: string[];
  /** Honeypot — filled = bot. */
  website?: string;
};

const SHORT_ID = /^[0-9a-z]{8}$/;

/**
 * Auth + profile gate for the team actions.
 *
 * `next` is where the gate sends the user back after /login or
 * /complete-profile. The default is the base signup page, right for the
 * captain's form. The team page's actions pass `/signup/${shortId}/team`: before
 * that an invited player lost the /team context in the profile round and landed
 * on «Registrer laget», one tap from a duplicate team (#1344).
 *
 * The value is always a constant on the call site, never user input — no
 * open-redirect surface.
 */
async function requireAuthedUser(
  shortId: string,
  options: { next?: string } = {},
): Promise<{ id: string }> {
  const next = options.next ?? `/signup/${shortId}`;
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: `/login?next=${next}`, locale });
  }
  const { data: profile } = await supabase
    .from('users')
    .select('profile_completed_at')
    .eq('id', user.id)
    .maybeSingle<{ profile_completed_at: string | null }>();
  if (!profile?.profile_completed_at) {
    redirect({ href: `/complete-profile?next=${next}`, locale });
  }
  return { id: user.id };
}

/** Return path for the actions called from the team page (#1344). */
function teamPagePath(shortId: string): string {
  return `/signup/${shortId}/team`;
}

/**
 * The core's own profile gate answers `profile_incomplete` (a race with the
 * gate above); on the web that is the same redirect as before.
 */
async function redirectOnProfileIncomplete(
  result: { ok: boolean; error?: string },
  next: string,
): Promise<void> {
  if (!result.ok && result.error === 'profile_incomplete') {
    const locale = await getLocale();
    redirect({ href: `/complete-profile?next=${next}`, locale });
  }
}

/**
 * The captain submits the team form. Returns one result per teammate; a failed
 * teammate does not roll back the rest.
 */
export async function submitTeamRegistration(
  input: TeamRegistrationInput,
): Promise<TeamRegistrationResult> {
  const shortId = String(input.shortId ?? '').trim();
  const teamName = String(input.teamName ?? '').trim();
  const honeypot = String(input.website ?? '').trim();

  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'submitTeamRegistration' });
    return {
      ok: true,
      captainRequestId: '00000000-0000-0000-0000-000000000000',
      slotResults: [],
    };
  }
  // Checked before the auth gate, as before: a bad link or name never sends
  // anyone through /login first.
  if (!SHORT_ID.test(shortId)) {
    return { ok: false, error: 'game_not_found' };
  }
  if (teamName.length < TEAM_NAME_MIN || teamName.length > TEAM_NAME_MAX) {
    return { ok: false, error: 'team_name_invalid' };
  }

  const captain = await requireAuthedUser(shortId);
  const ip = await getClientIp();
  const result = await submitTeamRegistrationCore(
    captain.id,
    {
      shortId,
      teamName,
      memberIds: Array.isArray(input.memberIds) ? input.memberIds : [],
    },
    { ip },
  );
  await redirectOnProfileIncomplete(result, `/signup/${shortId}`);
  return result;
}

/** A teammate says yes, from the team page. */
export async function acceptTeamInvite(
  requestId: string,
  shortId: string,
): Promise<AcceptDeclineResult> {
  if (!SHORT_ID.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId, { next: teamPagePath(shortId) });
  const result = await acceptTeamInviteCore(user.id, { shortId, requestId });
  await redirectOnProfileIncomplete(result, teamPagePath(shortId));
  return result;
}

/** A teammate says no, from the team page. */
export async function declineTeamInvite(
  requestId: string,
  shortId: string,
): Promise<AcceptDeclineResult> {
  if (!SHORT_ID.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId, { next: teamPagePath(shortId) });
  const result = await declineTeamInviteCore(user.id, { shortId, requestId });
  await redirectOnProfileIncomplete(result, teamPagePath(shortId));
  return result;
}

/** The captain removes a teammate before the start. */
export async function removeTeamMember(
  childRequestId: string,
  shortId: string,
): Promise<AcceptDeclineResult> {
  if (!SHORT_ID.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId, { next: teamPagePath(shortId) });
  return removeTeamMemberCore(user.id, { shortId, requestId: childRequestId });
}

/**
 * Someone invited by e-mail (before #2840) joins the captain's team. The
 * caller's own client goes along for `befriend_inviter`.
 */
export async function attachToCaptainTeam(
  invitationId: string,
  shortId: string,
): Promise<AttachTeamResult> {
  if (!SHORT_ID.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId, { next: teamPagePath(shortId) });
  const result = await attachToCaptainTeamCore(
    user.id,
    { shortId, invitationId },
    { userClient: await getServerClient() },
  );
  await redirectOnProfileIncomplete(result, teamPagePath(shortId));
  return result;
}

/** The captain sends the team invite again to a teammate who has not answered. */
export async function resendTeamInvite(
  childRequestId: string,
  shortId: string,
): Promise<AcceptDeclineResult> {
  if (!SHORT_ID.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId, { next: teamPagePath(shortId) });
  return resendTeamInviteCore(user.id, { shortId, requestId: childRequestId });
}

/** #2358: the captain hands the captaincy to a teammate. */
export async function transferCaptaincy(
  requestId: string,
  shortId: string,
): Promise<TransferCaptaincyResult> {
  if (!SHORT_ID.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId, { next: teamPagePath(shortId) });
  return transferCaptaincyCore(user.id, { shortId, requestId });
}

/**
 * #2840: the captain fills a free seat with a friend, or swaps a teammate who
 * said no (`replaceRequestId`). No web UI calls it yet.
 */
export async function addTeamMember(
  shortId: string,
  friendId: string,
  replaceRequestId?: string,
): Promise<AddTeamMemberResult> {
  if (!SHORT_ID.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId, { next: teamPagePath(shortId) });
  return addTeamMemberCore(user.id, { shortId, friendId, replaceRequestId });
}
