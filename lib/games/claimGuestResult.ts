import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { isGuestPlaceholderEmail } from './createGuestPlayer';

/**
 * Claim-flyten (#1009, kontrakt-beslutning 7): arrangøren «sender resultatet»
 * til gjestens ekte e-post ved å flippe skygge-brukerens adresse — i BÅDE
 * auth.users (GoTrue admin `updateUserById`) og public.users (det finnes
 * ingen update-sync-trigger mellom dem, kun insert). Eierskap bevises av den
 * påfølgende OTP-innloggingen; `verifyCode` nuller `is_guest` da.
 *
 * Rad-flytting til en eksisterende konto er bevisst utenfor (beslutning 6):
 * er adressen alt registrert får arrangøren en vennlig feil.
 *
 * Kompensasjon: feiler public.users-oppdateringen reverteres auth-flippen
 * (best-effort) så de to radene aldri blir stående i utakt. Mail-sending er
 * IKKE denne modulens ansvar — caller sender best-effort etterpå, og en
 * feilet mail beholder flippen (gjesten kan logge inn likevel).
 */

export type GuestClaimError =
  | 'guest_claim_invalid_email'
  | 'guest_claim_not_guest'
  | 'guest_email_taken'
  | 'guest_claim_failed';

export type ClaimGuestEmailResult =
  | { ok: true; guestName: string | null; alreadyClaimed: boolean }
  | { ok: false; error: GuestClaimError };

export function normalizeClaimEmail(raw: unknown): string | null {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!email || !email.includes('@') || email.length > 254) return null;
  // Plassholder-domenet kan aldri være et claim-mål — det ville «claimet»
  // gjesten tilbake til en adresse uten MX.
  if (isGuestPlaceholderEmail(email)) return null;
  return email;
}

export async function claimGuestEmail(opts: {
  gameId: string;
  guestUserId: string;
  email: string;
}): Promise<ClaimGuestEmailResult> {
  const { gameId, guestUserId, email } = opts;
  const admin = getAdminClient();

  // Målet må være en gjest OG stå på akkurat dette spillets roster — ellers
  // kunne en arrangør flippe e-posten til vilkårlige skygge-brukere.
  const [userRes, memberRes] = await Promise.all([
    admin
      .from('users')
      .select('id, name, email, is_guest')
      .eq('id', guestUserId)
      .maybeSingle<{
        id: string;
        name: string | null;
        email: string;
        is_guest: boolean;
      }>(),
    admin
      .from('game_players')
      .select('user_id')
      .eq('game_id', gameId)
      .eq('user_id', guestUserId)
      .maybeSingle<{ user_id: string }>(),
  ]);

  const guest = userRes.data;
  if (!guest || !guest.is_guest || !memberRes.data) {
    return { ok: false, error: 'guest_claim_not_guest' };
  }

  // Re-send av samme adresse (typisk «mailen kom ikke fram») er idempotent —
  // ingen flips, caller sender bare mailen på nytt.
  if (guest.email.toLowerCase() === email) {
    return { ok: true, guestName: guest.name, alreadyClaimed: true };
  }

  // Beslutning 6: adressen kan ikke tilhøre en eksisterende konto.
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle<{ id: string }>();
  if (existing && existing.id !== guestUserId) {
    return { ok: false, error: 'guest_email_taken' };
  }

  const previousEmail = guest.email;
  const { error: authError } = await admin.auth.admin.updateUserById(
    guestUserId,
    { email, email_confirm: true },
  );
  if (authError) {
    // Duplikat i auth (race mot registrering) lander også her — GoTrue er
    // backstop-en for unikhet.
    console.error('[claimGuestEmail] auth email flip failed', authError);
    return { ok: false, error: 'guest_claim_failed' };
  }

  const { data: updatedRows, error: usersError } = await admin
    .from('users')
    .update({ email })
    .eq('id', guestUserId)
    .select('id');
  if (usersError || (updatedRows ?? []).length === 0) {
    console.error(
      '[claimGuestEmail] public.users email update failed — reverting auth flip',
      usersError,
    );
    try {
      await admin.auth.admin.updateUserById(guestUserId, {
        email: previousEmail,
        email_confirm: true,
      });
    } catch (revertErr) {
      console.error('[claimGuestEmail] auth revert failed', revertErr);
    }
    return { ok: false, error: 'guest_claim_failed' };
  }

  return { ok: true, guestName: guest.name, alreadyClaimed: false };
}
