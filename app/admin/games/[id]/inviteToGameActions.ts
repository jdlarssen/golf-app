'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrTrustedCreator } from '@/lib/admin/auth';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';
import { sendInviteNotification } from '@/lib/mail/inviteNotification';

type GameSnapshot = {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  game_mode: string;
};

const BEST_BALL_MAX_PLAYERS = 8;

/**
 * Picker-add: legg en eksisterende registrert spiller til et game-roster.
 * Brukes fra «Inviter spillere»-card på `/admin/games/[id]`. Idempotent —
 * UNIQUE-violation på (game_id, user_id) swallow-es slik at race-condition
 * mellom to admin-tabs ikke produserer en feilmelding.
 *
 * Notify fyrer best-effort etter at game_players-insertet er commitet.
 * Spilleren får bell-prikk uten å måtte aksepte noe — admin-curator-modellen
 * forutsetter at administratoren har avklart deltakelse på forhånd.
 */
export async function addExistingPlayerToGame(
  gameId: string,
  formData: FormData,
): Promise<void> {
  const recipientUserId = String(formData.get('recipient_user_id') ?? '').trim();
  const detailPath = `/admin/games/${gameId}`;

  if (!recipientUserId) {
    redirect(`${detailPath}?error=invite_missing_user`);
  }

  const supabase = await getServerClient();
  const { userId: inviterUserId } = await requireAdminOrTrustedCreator(supabase);

  const game = await loadGameForInvite(supabase, gameId, detailPath);

  if (game.status === 'active' || game.status === 'finished') {
    redirect(`${detailPath}?error=game_locked`);
  }

  if (game.game_mode === 'best_ball_netto') {
    const { count } = await supabase
      .from('game_players')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', gameId);
    if ((count ?? 0) >= BEST_BALL_MAX_PLAYERS) {
      redirect(`${detailPath}?error=game_full`);
    }
  }

  const { error: insertError } = await supabase.from('game_players').insert({
    game_id: gameId,
    user_id: recipientUserId,
    team_number: null,
    flight_number: null,
    course_handicap: null,
  });

  // Idempotent: hvis spilleren allerede er på rosteren (UNIQUE-violation
  // på (game_id, user_id)) returnerer Postgres '23505'. Da swallow vi —
  // intensjonen var allerede oppfylt, men vi skal ikke fyre en ny notify.
  const duplicate =
    insertError != null &&
    (insertError.code === '23505' ||
      String(insertError.message ?? '').toLowerCase().includes('duplicate'));

  if (insertError && !duplicate) {
    console.error('[inviteToGame/addExistingPlayer] insert failed', insertError);
    redirect(`${detailPath}?error=db_players`);
  }

  if (!duplicate && recipientUserId !== inviterUserId) {
    await notifyInvitedToGame({
      recipientUserId,
      gameId,
      inviterUserId,
    });
  }

  revalidateTag(`game-${gameId}`, 'max');
  redirect(`${detailPath}?status=invite_added`);
}

/**
 * E-post-invite: send invitasjon med spill-kontekst til en e-post som ikke
 * (nødvendigvis) er registrert. To grener:
 *
 *  - Hvis e-posten allerede tilhører en registrert bruker: rute gjennom samme
 *    flyt som picker-add. Ingen mail (de er i appen), men bell-prikk fyrer.
 *  - Hvis e-posten er ukjent: opprett `invitations`-rad med game_id, send
 *    spill-spesifikk Resend-mail. notify fyrer deferred etter OTP-verify
 *    i `app/(auth)/login/actions.ts`.
 *
 * Idempotent på (email, game_id) — en eksisterende pending invitasjon for
 * samme spill swallow-es uten ny mail eller notify.
 */
export async function inviteEmailToGame(
  gameId: string,
  formData: FormData,
): Promise<void> {
  const rawEmail = String(formData.get('email') ?? '').trim().toLowerCase();
  const detailPath = `/admin/games/${gameId}`;

  if (!rawEmail || !rawEmail.includes('@')) {
    redirect(`${detailPath}?error=invite_invalid_email`);
  }

  const supabase = await getServerClient();
  const { userId: inviterUserId, name: inviterName } =
    await requireAdminOrTrustedCreator(supabase);

  const game = await loadGameForInvite(supabase, gameId, detailPath);

  if (game.status === 'active' || game.status === 'finished') {
    redirect(`${detailPath}?error=game_locked`);
  }

  if (game.game_mode === 'best_ball_netto') {
    const { count } = await supabase
      .from('game_players')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', gameId);
    if ((count ?? 0) >= BEST_BALL_MAX_PLAYERS) {
      redirect(`${detailPath}?error=game_full`);
    }
  }

  // Eksisterende bruker? Da går vi rett til picker-add-stien.
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .ilike('email', rawEmail)
    .maybeSingle<{ id: string }>();

  if (existingUser) {
    const { error: insertError } = await supabase.from('game_players').insert({
      game_id: gameId,
      user_id: existingUser.id,
      team_number: null,
      flight_number: null,
      course_handicap: null,
    });
    const duplicate =
      insertError != null &&
      (insertError.code === '23505' ||
        String(insertError.message ?? '').toLowerCase().includes('duplicate'));

    if (insertError && !duplicate) {
      console.error('[inviteToGame/inviteEmail] existing-user insert failed', insertError);
      redirect(`${detailPath}?error=db_players`);
    }

    if (!duplicate && existingUser.id !== inviterUserId) {
      await notifyInvitedToGame({
        recipientUserId: existingUser.id,
        gameId,
        inviterUserId,
      });
    }

    revalidateTag(`game-${gameId}`, 'max');
    redirect(`${detailPath}?status=invite_added&email=${encodeURIComponent(rawEmail)}`);
  }

  // Ukjent e-post: idempotent insert i invitations.
  const { data: existingInvite } = await supabase
    .from('invitations')
    .select('id')
    .ilike('email', rawEmail)
    .eq('game_id', gameId)
    .is('accepted_at', null)
    .maybeSingle<{ id: string }>();

  if (existingInvite) {
    revalidateTag(`game-${gameId}`, 'max');
    redirect(`${detailPath}?status=invite_sent&email=${encodeURIComponent(rawEmail)}`);
  }

  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from('invitations').insert({
    email: rawEmail,
    token: randomUUID(),
    invited_by: inviterUserId,
    game_id: gameId,
    expires_at: expiresAt,
  });
  if (insertError) {
    console.error('[inviteToGame/inviteEmail] invitations insert failed', insertError);
    redirect(`${detailPath}?error=invite_failed`);
  }

  const invitedByName = inviterName?.trim() || 'Admin';
  try {
    await sendInviteNotification({
      to: rawEmail,
      invitedByName,
      gameName: game.name,
    });
  } catch (err) {
    console.error('[inviteToGame/inviteEmail] mail failed', err);
    redirect(`${detailPath}?error=mail_failed&email=${encodeURIComponent(rawEmail)}`);
  }

  revalidateTag(`game-${gameId}`, 'max');
  redirect(`${detailPath}?status=invite_sent&email=${encodeURIComponent(rawEmail)}`);
}

async function loadGameForInvite(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  gameId: string,
  detailPath: string,
): Promise<GameSnapshot> {
  const { data, error } = await supabase
    .from('games')
    .select('id, name, status, game_mode')
    .eq('id', gameId)
    .single<GameSnapshot>();

  if (error || !data) {
    redirect(`${detailPath}?error=not_found`);
  }
  return data!;
}
