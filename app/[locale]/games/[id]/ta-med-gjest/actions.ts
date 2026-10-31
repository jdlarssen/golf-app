'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { bringGuestBlock, type BringGuestBlock } from '@/lib/games/bringGuest';
import {
  createGuestUser,
  guestTeeToTeeGender,
  parseGuestProfile,
  type GuestCreateError,
  type GuestValidationError,
} from '@/lib/games/createGuestPlayer';
import { clampGenderToTee } from '@/lib/games/clampGenderToTee';
import { TEE_EMBED } from '@/lib/games/joinTeeGenders';
import { teeAvailabilityOf } from '@/lib/games/teeChoice';
import type { TeeBoxRatings } from '@/lib/games/teeRating';
import { registrationPlayerCap } from '@/lib/wizard/fitsPlayerCount';
import { maxTeamsForSize, registrationSeatTeamSize } from '@/lib/games/teamFormatLimits';
import type { GameMode } from '@/lib/scoring/modes/types';
import { consumeRegistrationRateLimit } from '@/lib/auth/registrationRateLimit';
import { getClientIp } from '@/lib/admin/rateLimit';
import { notify } from '@/lib/notifications/notify';
import { sendRegistrationRequestMail } from '@/lib/mail/registrationRequest';
import { displayNameForOthers } from '@/lib/users/displayName';

/**
 * «Ta med en gjest» (#2607, fase 2): a signed-up player brings one guest
 * without an account, and the guest leaves with the player.
 *
 * The guest always gets a request row with the host in `brought_by_user_id`
 * (0230), also in an open game, so the trigger that takes the guest out when
 * the host leaves (withdraw_guests_of_removed_hosts) and every screen read the
 * same link. The database guards the rule for every role (guard_brought_guest:
 * the host on the roster, one live guest); the gate here says it first, in
 * the row's words (`bringGuestBlock`).
 *
 * Writes go through the service role: a player may not insert a request for
 * another user under RLS, nor seat one (0115). Creation is
 * atomic-or-compensated (AGENTS.md trap 5): a failed request or seat deletes
 * what this call made — the request and the shadow user.
 */

export type BringGuestError =
  | BringGuestBlock
  | 'not_authed'
  | 'game_not_found'
  | 'rate_limited'
  | 'host_not_on_roster'
  | 'brought_guest_limit'
  | 'game_full'
  | 'db_error'
  | GuestValidationError
  | GuestCreateError;

export type BringGuestResult = { ok: false; error: BringGuestError };

type GameRow = {
  id: string;
  name: string;
  status: string;
  created_by: string | null;
  game_mode: string;
  mode_config: { team_size?: number } | null;
  registration_mode: string;
  registration_type: string;
  signups_closed_at: string | null;
  tournament_id: string | null;
  league_round_id: string | null;
  tee_boxes: TeeBoxRatings | null;
};

const GAME_SELECT = `id, name, status, created_by, game_mode, mode_config, registration_mode, registration_type, signups_closed_at, tournament_id, league_round_id, ${TEE_EMBED}`;

/** The guard's refusals (0230) that the page has words for. */
const GUARD_CODES = ['brought_guest_limit', 'host_not_on_roster'] as const;

function guardRefusal(error: { code?: string; message?: string } | null): BringGuestError {
  const hit = GUARD_CODES.find((c) => error?.message === c);
  return error?.code === '23514' && hit ? hit : 'db_error';
}

/** claim_open_registration_seat's outcome (0177) → the page's error, or null. */
function seatClaimFailure(claim: unknown): BringGuestError | null {
  const outcome = (claim as { outcome?: unknown } | null)?.outcome;
  switch (outcome) {
    case 'ok':
      return null;
    case 'game_full':
    case 'signup_closed':
    case 'game_locked':
      return outcome;
    default:
      console.error('[bringGuest] unexpected seat claim outcome', claim);
      return 'db_error';
  }
}

/**
 * Undo what this call made: the guest's request (when it was written) and the
 * shadow user. Best effort: a failure is logged, the player gets the original
 * error, never a 500.
 */
async function compensate(guestUserId: string, requestId: string | null): Promise<void> {
  const admin = getAdminClient();
  if (requestId) {
    try {
      expectAffected(
        await admin.from('game_registration_requests').delete().eq('id', requestId).select('id'),
        'bringGuest/compensate',
      );
    } catch (err) {
      console.error('[bringGuest] compensating request delete failed', { requestId, err });
    }
  }
  try {
    const { error } = await admin.auth.admin.deleteUser(guestUserId);
    if (error) console.error('[bringGuest] compensating deleteUser failed', { guestUserId, error });
  } catch (err) {
    console.error('[bringGuest] compensating deleteUser failed', err);
  }
}

/**
 * The guest's seat in an open game. The same seat claim as the player's own
 * sign-up when the format has a cap (one count under the game lock, #2060);
 * without a cap a plain insert, as createGuestPlayer does. accepted_at: a
 * guest cannot confirm, and the host did. `null` = seated.
 */
async function seatGuest(
  game: GameRow,
  guestId: string,
  teeGender: ReturnType<typeof guestTeeToTeeGender>,
  now: string,
): Promise<BringGuestError | null> {
  const admin = getAdminClient();
  const mode = game.game_mode as GameMode;
  const cap = registrationPlayerCap(mode, game.mode_config);
  if (cap !== null) {
    const seatTeamSize = registrationSeatTeamSize(mode, game.mode_config?.team_size);
    const { data: claim, error: claimError } = await admin.rpc('claim_open_registration_seat', {
      p_game_id: game.id,
      p_user_id: guestId,
      p_seat_team_size: seatTeamSize,
      p_max_teams: maxTeamsForSize(seatTeamSize),
      p_accepted_at: now,
      p_cap: cap,
      p_tee_gender: teeGender,
    });
    if (claimError) {
      console.error('[bringGuest] seat claim failed', claimError);
      return 'db_error';
    }
    return seatClaimFailure(claim);
  }
  const { error: insertError } = await admin.from('game_players').insert({
    game_id: game.id,
    user_id: guestId,
    team_number: null,
    flight_number: null,
    course_handicap: null,
    tee_gender: teeGender,
    accepted_at: now,
  });
  if (insertError) {
    console.error('[bringGuest] roster insert failed', insertError);
    return 'db_error';
  }
  return null;
}

/**
 * The organiser's `registration_request` varsel, with the guest as requester
 * and «Gjest, tatt med av {vert}» as the message. Manual approval carries the
 * request id and the same mail backup as requestApproval (#199 §5.4). Best
 * effort: a failure is logged, never thrown.
 */
async function notifyOrganiser(
  game: GameRow,
  guestName: string,
  host: { name: string | null; nickname: string | null; email: string } | null,
  requestId: string | null,
): Promise<void> {
  if (!game.created_by) return;
  const t = await getTranslations('game.bringGuest');
  const hostName = host ? displayNameForOthers(host) : null;
  const message = hostName ? t('organiserMessage', { host: hostName }) : undefined;
  const result = await notify({
    userId: game.created_by,
    kind: 'registration_request',
    payload: {
      game_id: game.id,
      game_name: game.name,
      requester_name: guestName,
      ...(message ? { message } : {}),
      ...(requestId ? { request_id: requestId } : {}),
    },
  }).catch((err) => {
    console.error('[bringGuest] notify failed', err);
    return { shouldAlsoSendMail: false };
  });
  if (!requestId || !result.shouldAlsoSendMail) return;
  const { data: organiser } = await getAdminClient()
    .from('users')
    .select('email, locale')
    .eq('id', game.created_by)
    .maybeSingle<{ email: string; locale: string | null }>();
  if (!organiser?.email) return;
  await sendRegistrationRequestMail({
    to: organiser.email,
    gameName: game.name,
    gameId: game.id,
    requesterName: guestName,
    ...(message ? { message } : {}),
    locale: organiser.locale,
  }).catch((err) => console.error('[bringGuest] mail failed', err));
}

export async function bringGuest(gameId: string, formData: FormData): Promise<BringGuestResult> {
  // (1) The player and every condition for the row, read again.
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authed' };
  const hostId = user.id;

  const admin = getAdminClient();
  const [gameRes, seatRes, meRes] = await Promise.all([
    admin.from('games').select(GAME_SELECT).eq('id', gameId).maybeSingle<GameRow>(),
    admin
      .from('game_players')
      .select('withdrawn_at')
      .eq('game_id', gameId)
      .eq('user_id', hostId)
      .maybeSingle<{ withdrawn_at: string | null }>(),
    admin
      .from('users')
      .select('is_guest, name, nickname, email')
      .eq('id', hostId)
      .maybeSingle<{ is_guest: boolean; name: string | null; nickname: string | null; email: string }>(),
  ]);
  if (gameRes.error || seatRes.error || meRes.error) {
    console.error('[bringGuest] gate read failed', {
      gameId,
      error: gameRes.error ?? seatRes.error ?? meRes.error,
    });
    return { ok: false, error: 'db_error' };
  }
  const game = gameRes.data;
  // A draft answers like a game that does not exist (#2445).
  if (!game || game.status === 'draft') return { ok: false, error: 'game_not_found' };
  const block = bringGuestBlock(game, {
    userId: hostId,
    seat: seatRes.data,
    isGuest: meRes.data?.is_guest === true,
  });
  if (block) return { ok: false, error: block };

  // (2) The same buckets as the player's own sign-up.
  const rateLimit = await consumeRegistrationRateLimit({
    userId: hostId,
    ip: await getClientIp(),
    gameId: game.id,
  });
  if (!rateLimit.ok) return { ok: false, error: 'rate_limited' };

  // (3) The guest's profile, the category clamped to the game's tee (#2437).
  const parsed = parseGuestProfile({
    name: formData.get('guest_name'),
    hcp: formData.get('guest_hcp'),
    tee: formData.get('guest_tee'),
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const tee = clampGenderToTee(parsed.profile.tee, teeAvailabilityOf(game.tee_boxes ?? null));
  const profile = { ...parsed.profile, tee };

  // (4) The shadow user.
  const created = await createGuestUser(profile);
  if (!created.ok) return { ok: false, error: created.error };
  const guestId = created.userId;

  // (5) The guest's request, with the host. Open: approved by the host at
  // once. Manual approval: pending, the organiser decides as for any request.
  const isOpen = game.registration_mode === 'open';
  const now = new Date().toISOString();
  const { data: request, error: requestError } = await admin
    .from('game_registration_requests')
    .insert({
      game_id: game.id,
      user_id: guestId,
      status: isOpen ? 'approved' : 'pending',
      is_team_captain: false,
      brought_by_user_id: hostId,
      ...(isOpen ? { decided_by_user_id: hostId, decided_at: now } : {}),
    })
    .select('id')
    .single<{ id: string }>();
  if (requestError || !request) {
    const error = guardRefusal(requestError);
    if (error === 'db_error') console.error('[bringGuest] request insert failed', requestError);
    await compensate(guestId, null);
    return { ok: false, error };
  }

  // (6) Open: the seat. (7) No seat: nothing of this call stays behind.
  if (isOpen) {
    const seatError = await seatGuest(game, guestId, guestTeeToTeeGender(tee), now);
    if (seatError) {
      await compensate(guestId, request.id);
      return { ok: false, error: seatError };
    }
  }

  // (8) The cache and the organiser's varsel, as for any sign-up. Best effort:
  // the guest is in either way.
  expireGameCache(game.id);
  await notifyOrganiser(game, profile.name, meRes.data, isOpen ? null : request.id);

  const locale = await getLocale();
  redirect({ href: `/games/${game.id}/ta-med-gjest?status=added`, locale });
}

/**
 * «Fjern gjesten»: the host takes the guest out again, inline, as the
 * organiser's «Fjern» on «Styr spillere» (the owner's answer 2 in phase 1).
 * The request is marked withdrawn, then the guest's seat goes (none when the
 * guest was still pending). A failed seat delete puts the request back.
 */
export async function removeBroughtGuest(gameId: string, formData: FormData): Promise<void> {
  const locale = await getLocale();
  const page = `/games/${gameId}/ta-med-gjest`;
  const requestId = String(formData.get('requestId') ?? '');

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const hostId = user.id;

  const admin = getAdminClient();
  const { data: row, error: rowError } = await admin
    .from('game_registration_requests')
    .select('id, game_id, user_id, status, decided_at, decided_by_user_id, brought_by_user_id, games(status)')
    .eq('id', requestId)
    .maybeSingle<{
      id: string;
      game_id: string;
      user_id: string;
      status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
      decided_at: string | null;
      decided_by_user_id: string | null;
      brought_by_user_id: string | null;
      games: { status: string } | null;
    }>();
  if (rowError) {
    console.error('[removeBroughtGuest] request read failed', { requestId, error: rowError });
    redirect({ href: `${page}?error=db_error`, locale });
  }
  if (
    !row ||
    row.game_id !== gameId ||
    row.brought_by_user_id !== hostId ||
    (row.status !== 'pending' && row.status !== 'approved')
  ) {
    redirect({ href: `${page}?error=not_your_guest`, locale });
  }
  const live = row;
  if (live.games?.status !== 'scheduled' && live.games?.status !== 'draft') {
    redirect({ href: `${page}?error=game_locked`, locale });
  }

  try {
    expectAffected(
      await admin
        .from('game_registration_requests')
        .update({ status: 'withdrawn', decided_at: new Date().toISOString(), decided_by_user_id: hostId })
        .eq('id', live.id)
        .eq('brought_by_user_id', hostId)
        .eq('status', live.status)
        .select('id'),
      'removeBroughtGuest',
    );
  } catch (err) {
    console.error('[removeBroughtGuest] request withdraw failed', err);
    redirect({ href: `${page}?error=db_error`, locale });
  }

  // 0 rows is fine: a pending guest has no seat.
  const { error: seatError } = await admin
    .from('game_players')
    .delete()
    .eq('game_id', gameId)
    .eq('user_id', live.user_id)
    .select('user_id');
  if (seatError) {
    console.error('[removeBroughtGuest] seat delete failed, putting the request back', seatError);
    const { error: revertError } = await admin
      .from('game_registration_requests')
      .update({
        status: live.status,
        decided_at: live.decided_at,
        decided_by_user_id: live.decided_by_user_id,
      })
      .eq('id', live.id)
      .eq('status', 'withdrawn')
      .select('id');
    if (revertError) console.error('[removeBroughtGuest] revert failed', revertError);
    redirect({ href: `${page}?error=db_error`, locale });
  }

  expireGameCache(gameId);
  redirect({ href: page, locale });
}
