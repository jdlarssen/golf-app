'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidateTag } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { isDisposableEmailDomain } from '@/lib/auth/disposableEmail';
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
 * Brukes fra «Inviter spillere»-card på `/admin/games/[id]` (admin) og fra
 * arrangør-flaten `/games/[id]/spillere` (oppretter, #429). Idempotent —
 * UNIQUE-violation på (game_id, user_id) swallow-es slik at race-condition
 * mellom to faner ikke produserer en feilmelding.
 *
 * Notify fyrer best-effort etter at game_players-insertet er commitet.
 * Spilleren får bell-prikk uten å måtte aksepte noe — curator-modellen
 * forutsetter at arrangøren har avklart deltakelse på forhånd.
 */
export async function addExistingPlayerToGame(
  gameId: string,
  formData: FormData,
): Promise<void> {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  const detailPath = ctx.isAdmin
    ? `/admin/games/${gameId}`
    : `/games/${gameId}/spillere`;
  const inviterUserId = ctx.userId;

  const recipientUserId = String(formData.get('recipient_user_id') ?? '').trim();
  if (!recipientUserId) {
    redirect({ href: `${detailPath}?error=invite_missing_user`, locale });
  }

  const game = await loadGameForInvite(supabase, gameId, detailPath);

  if (game.status === 'active' || game.status === 'finished') {
    redirect({ href: `${detailPath}?error=game_locked`, locale });
  }

  if (game.game_mode === 'best_ball') {
    const { count } = await supabase
      .from('game_players')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', gameId);
    if ((count ?? 0) >= BEST_BALL_MAX_PLAYERS) {
      redirect({ href: `${detailPath}?error=game_full`, locale });
    }
  }

  const { error: insertError } = await supabase.from('game_players').insert({
    game_id: gameId,
    user_id: recipientUserId,
    team_number: null,
    flight_number: null,
    course_handicap: null,
    // #463: arrangør legger til en annen bruker → ikke bekreftet ennå.
    accepted_at: null,
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
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }

  if (!duplicate && recipientUserId !== inviterUserId) {
    await notifyInvitedToGame({
      recipientUserId,
      gameId,
      inviterUserId,
    });
  }

  revalidateTag(`game-${gameId}`, 'max');
  redirect({ href: `${detailPath}?status=invite_added`, locale });
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
  const locale = await getLocale();
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  const detailPath = ctx.isAdmin
    ? `/admin/games/${gameId}`
    : `/games/${gameId}/spillere`;
  const inviterUserId = ctx.userId;
  const inviterName = ctx.name;

  const rawEmail = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!rawEmail || !rawEmail.includes('@')) {
    redirect({ href: `${detailPath}?error=invite_invalid_email`, locale });
  }

  // Disposable-domener blokkeres for arrangører som ikke er admin (#422).
  // Admin og trusted-creators er bevisst u-guardet (kurator-modellen — de
  // inviterer folk de allerede har avklart med).
  if (!ctx.isAdmin && isDisposableEmailDomain(rawEmail)) {
    redirect({ href: `${detailPath}?error=disposable_email`, locale });
  }

  const game = await loadGameForInvite(supabase, gameId, detailPath);

  if (game.status === 'active' || game.status === 'finished') {
    redirect({ href: `${detailPath}?error=game_locked`, locale });
  }

  if (game.game_mode === 'best_ball') {
    const { count } = await supabase
      .from('game_players')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', gameId);
    if ((count ?? 0) >= BEST_BALL_MAX_PLAYERS) {
      redirect({ href: `${detailPath}?error=game_full`, locale });
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
      // #463: arrangør legger til en annen bruker → ikke bekreftet ennå.
      accepted_at: null,
    });
    const duplicate =
      insertError != null &&
      (insertError.code === '23505' ||
        String(insertError.message ?? '').toLowerCase().includes('duplicate'));

    if (insertError && !duplicate) {
      console.error('[inviteToGame/inviteEmail] existing-user insert failed', insertError);
      redirect({ href: `${detailPath}?error=db_players`, locale });
    }

    if (!duplicate && existingUser.id !== inviterUserId) {
      await notifyInvitedToGame({
        recipientUserId: existingUser.id,
        gameId,
        inviterUserId,
      });
    }

    revalidateTag(`game-${gameId}`, 'max');
    redirect({ href: `${detailPath}?status=invite_added&email=${encodeURIComponent(rawEmail)}`, locale });
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
    // Re-send the notification mail best-effort so a retry by the organiser
    // always delivers — covers the case where the original send silently
    // dropped (Resend error, spam filter, etc.) without the row being rolled
    // back. Errors here are swallowed: the invitation row already exists and
    // we don't want to confuse the organiser with a spurious error state.
    const invitedByNameForRetry =
      inviterName?.trim() || (ctx.isAdmin ? 'Admin' : 'En arrangør');
    try {
      await sendInviteNotification({
        to: rawEmail,
        invitedByName: invitedByNameForRetry,
        gameName: game.name,
        gameMode: game.game_mode,
      });
    } catch (retryErr) {
      console.error('[inviteToGame/inviteEmail] retry mail failed (best-effort)', retryErr);
    }
    revalidateTag(`game-${gameId}`, 'max');
    redirect({ href: `${detailPath}?status=invite_sent&email=${encodeURIComponent(rawEmail)}`, locale });
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
    redirect({ href: `${detailPath}?error=invite_failed`, locale });
  }

  const invitedByName =
    inviterName?.trim() || (ctx.isAdmin ? 'Admin' : 'En arrangør');
  try {
    await sendInviteNotification({
      to: rawEmail,
      invitedByName,
      gameName: game.name,
      gameMode: game.game_mode,
    });
  } catch (err) {
    console.error('[inviteToGame/inviteEmail] mail failed', err);
    // Roll back the just-inserted invitations row so the organiser can retry
    // the same email address and get a fresh insert + send. Without this,
    // the idempotent check at the top of this branch finds the orphaned row
    // and silently short-circuits without ever sending the mail — stranding
    // the invitee permanently.
    const { error: deleteErr } = await supabase
      .from('invitations')
      .delete()
      .ilike('email', rawEmail)
      .eq('game_id', gameId)
      .is('accepted_at', null);
    if (deleteErr) {
      console.error('[inviteToGame/inviteEmail] rollback delete failed', deleteErr);
    }
    redirect({ href: `${detailPath}?error=mail_failed&email=${encodeURIComponent(rawEmail)}`, locale });
  }

  revalidateTag(`game-${gameId}`, 'max');
  redirect({ href: `${detailPath}?status=invite_sent&email=${encodeURIComponent(rawEmail)}`, locale });
}

async function loadGameForInvite(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  gameId: string,
  detailPath: string,
): Promise<GameSnapshot> {
  const locale = await getLocale();
  const { data, error } = await supabase
    .from('games')
    .select('id, name, status, game_mode')
    .eq('id', gameId)
    .single<GameSnapshot>();

  if (error || !data) {
    redirect({ href: `${detailPath}?error=not_found`, locale });
  }
  return data!;
}
