'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import {
  registerForOpenGameCore,
  requestApprovalCore,
  type ActionError,
} from '@/lib/games/selfRegistration';
import { REGISTRATION_MESSAGE_MAX } from '@/lib/games/registration';
import { getClientIp } from '@/lib/admin/rateLimit';

/**
 * Public selv-påmeldings-actions (#199 chunks 6+7). Skrivingen og vaktene bor i
 * `lib/games/selfRegistration.ts`, som appens rute deler (#2748); her står det
 * som hører nettet til: honeypot, cookie-auth og redirect.
 *
 * To server-actions for solo-flyten:
 *   - `registerForOpenGame`: direkte INSERT i `game_players` for spill med
 *     `registration_mode = 'open'`. Idempotent — UNIQUE-conflict konverteres
 *     til vennlig melding. Notify til admin med `registration_request`-kind
 *     (uten request_id, siden ingen request-rad opprettes for open-modus).
 *   - `requestApproval`: INSERT i `game_registration_requests` med
 *     status='pending' for spill med `registration_mode = 'manual_approval'`.
 *     UNIQUE-conflict på (game_id, user_id) → vennlig duplicate-melding.
 *
 * Felles authz-mønster:
 *   - Honeypot-felt `website` short-circuiter til "success"-shape.
 *   - Uautentisert → redirect til /login med `next=/signup/[shortId]`.
 *   - Manglende profil → redirect til /complete-profile med next-param.
 *   - Server-state-feil (feil mode, feil status) → returner error-shape.
 *
 * Begge actions returnerer `ActionResult` (objekt) i stedet for å redirecte
 * direkte ved error, slik at client-komponenten kan vise melding inline. Vi
 * redirecter kun ved suksess (open-modus → /games/[id]) eller når brukeren
 * må ut av action-konteksten (login, complete-profile).
 */

export type ActionResult =
  | { ok: true }
  | { ok: false; error: ActionError };

export type { ActionError };

/**
 * Verifiser auth + profil. Returnerer userId hvis OK, ellers gjør redirect
 * til /login eller /complete-profile slik at action-en stopper umiddelbart.
 */
async function requireAuthedUser(shortId: string): Promise<string> {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: `/login?next=/signup/${shortId}`, locale });
  }
  const { data: profile } = await supabase
    .from('users')
    .select('profile_completed_at')
    .eq('id', user.id)
    .maybeSingle<{ profile_completed_at: string | null }>();
  if (!profile?.profile_completed_at) {
    redirect({ href: `/complete-profile?next=/signup/${shortId}`, locale });
  }
  return user.id;
}

/**
 * Solo open-modus påmelding. INSERT direkte i game_players.
 *
 * Ved suksess: redirect til /games/[id] slik at brukeren havner rett inn
 * i spillet. Server-action redirect kaster internt, så vi når aldri en
 * return-statement i suksess-grenen — TS-signaturen er ActionResult for
 * å være ærlig om error-tilfellene.
 */
export async function registerForOpenGame(
  formData: FormData,
): Promise<ActionResult> {
  const shortId = String(formData.get('shortId') ?? '').trim();
  const honeypot = String(formData.get('website') ?? '').trim();

  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'registerForOpenGame' });
    return { ok: true };
  }

  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    return { ok: false, error: 'game_not_found' };
  }

  const userId = await requireAuthedUser(shortId);

  const result = await registerForOpenGameCore({
    shortId,
    userId,
    ip: await getClientIp(),
    side: Number(formData.get('side') ?? ''),
    src: String(formData.get('src') ?? '') || null,
  });
  if (!result.ok) return result;

  const locale = await getLocale();
  redirect({ href: `/games/${result.gameId}`, locale });
}

/**
 * Solo manual-approval påmelding. INSERT i game_registration_requests med
 * status='pending'. Notify admin (game.created_by) med kind
 * `registration_request` + request_id for deeplink til godkjennings-siden.
 *
 * Ved suksess: returner { ok: true } så client-komponenten kan vise
 * kvittering. Vi redirecter ikke — siden samme `/signup/[shortId]`
 * vil re-rendre i "Forespørsel sendt"-state ved neste navigasjon.
 */
export async function requestApproval(
  formData: FormData,
): Promise<ActionResult> {
  const shortId = String(formData.get('shortId') ?? '').trim();
  const honeypot = String(formData.get('website') ?? '').trim();
  const rawMessage = String(formData.get('message') ?? '').trim();

  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'requestApproval' });
    return { ok: true };
  }

  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    return { ok: false, error: 'game_not_found' };
  }

  // Before the login redirect: a message too long never leaves the form.
  if (rawMessage.length > REGISTRATION_MESSAGE_MAX) {
    return { ok: false, error: 'message_too_long' };
  }

  const userId = await requireAuthedUser(shortId);

  return requestApprovalCore({
    shortId,
    userId,
    ip: await getClientIp(),
    message: rawMessage,
  });
}
