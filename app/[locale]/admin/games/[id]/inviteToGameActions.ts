'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import {
  addExistingPlayerToGameCore,
  inviteEmailToGameCore,
  normalizeInviteEmail,
  type InviteRefusal,
} from '@/lib/games/inviteToGame';

/**
 * Picker-add: legg en eksisterende registrert spiller til et game-roster.
 * Brukes fra «Inviter spillere»-card på `/admin/games/[id]` (admin) og fra
 * arrangør-flaten `/games/[id]/spillere` (oppretter, #429). Idempotent —
 * UNIQUE-violation på (game_id, user_id) swallow-es slik at race-condition
 * mellom to faner ikke produserer en feilmelding.
 *
 * Regelen bor i `addExistingPlayerToGameCore` (`lib/games/inviteToGame.ts`,
 * #2215): status-låsen, venne-/klubb-porten, format-taket, skrivingen,
 * `invite`-varselet og cache-tømmingen. Appen når den samme kjernen over
 * `POST /api/games/[id]/players/[userId]`. Igjen her står gaten, klienten og
 * oversettelsen fra utfall til query-parameter. Klienten er den RLS-baserte, så
 * 0072-policyene og 0115-triggeren står som et andre lag på webbens skriving.
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

  const recipientUserId = String(formData.get('recipient_user_id') ?? '').trim();
  if (!recipientUserId) {
    redirect({ href: `${detailPath}?error=invite_missing_user`, locale });
  }

  const result = await addExistingPlayerToGameCore({
    client: supabase,
    gameId,
    inviterUserId: ctx.userId,
    isAdmin: ctx.isAdmin,
    recipientUserId,
  });

  if (!result.ok) {
    // Samme query-kart som e-post-døra under: kjernens koder er et delsett av
    // dens, og verdiene står tegn-for-tegn som før flyttingen.
    return redirect({
      href: `${detailPath}?error=${REFUSAL_ERROR[result.reason]}`,
      locale,
    });
  }

  redirect({ href: `${detailPath}?status=invite_added`, locale });
}

/**
 * Webbens dør inn til e-post-invitasjonen.
 *
 * Regelen bor i `lib/games/inviteToGame.ts` (#1919) — den flyttet ut da appen
 * skulle få den samme handlingen over `POST /api/games/[id]/invite`, og en
 * kopi ville gitt regelen to hjem (AGENTS trap 4). Igjen her står bare det
 * webben eier: gaten, klienten og oversettelsen fra utfall til query-parameter.
 *
 * Klienten som sendes inn er den RLS-baserte (`getServerClient`), så
 * 0072-policyene står som et andre lag på webbens skrivinger nøyaktig som før.
 * Ruta sender service-role-klienten sin.
 *
 * Query-verdiene under er bruker-synlige (banneret leser dem) og står
 * tegn-for-tegn slik de sto før flyttingen. Merk prefikset: kjernens
 * `invalid_email` er webbens `invite_invalid_email`.
 */
const REFUSAL_ERROR: Record<InviteRefusal, string> = {
  invalid_email: 'invite_invalid_email',
  disposable_email: 'disposable_email',
  not_found: 'not_found',
  game_locked: 'game_locked',
  game_full: 'game_full',
  invite_not_allowed: 'invite_not_allowed',
  db_players: 'db_players',
  invite_failed: 'invite_failed',
  mail_failed: 'mail_failed',
};

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

  const rawEmail = String(formData.get('email') ?? '');
  const result = await inviteEmailToGameCore({
    client: supabase,
    // RLS-klienten er også den som avgjør hvilke kontoer arrangøren ser.
    viewer: supabase,
    gameId,
    inviterUserId: ctx.userId,
    inviterName: ctx.name,
    isAdmin: ctx.isAdmin,
    rawEmail,
  });

  if (!result.ok) {
    // `mail_failed` bærer adressen videre: banneret sier hvem mailen ikke nådde,
    // så arrangøren kan prøve den samme adressen på nytt. Resten er tilstander
    // ved runden, ikke ved adressen.
    const query =
      result.reason === 'mail_failed'
        ? `error=mail_failed&email=${encodeURIComponent(normalizeInviteEmail(rawEmail))}`
        : `error=${REFUSAL_ERROR[result.reason]}`;
    // `redirect()` kaster (NEXT_REDIRECT), så denne `return`-en nås aldri —
    // den står fordi `redirect` ikke er typet `never`, og uten den ser tsc
    // fortsatt begge grenene av unionen under.
    return redirect({ href: `${detailPath}?${query}`, locale });
  }

  const status = result.kind === 'added' ? 'invite_added' : 'invite_sent';
  redirect({
    href: `${detailPath}?status=${status}&email=${encodeURIComponent(result.email)}`,
    locale,
  });
}
