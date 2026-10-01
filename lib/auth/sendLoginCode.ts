import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { consumeLoginRateLimit } from '@/lib/auth/loginRateLimit';
import { isDisposableEmailDomain } from '@/lib/auth/disposableEmail';
import { emailMatchPattern } from '@/lib/supabase/emailMatch';
import type { SendLoginCodeError } from '@/lib/auth/loginCodeErrors';

// «Send meg kode» — ett hjem for sperrene (#2216).
//
// Nettsidens skjema (`sendCode` i `app/[locale]/(auth)/login/actions.ts`) og
// appens rute (`app/api/auth/send-code`) kaller begge denne. Ingen av dem har
// en egen regel om hvem som får kode eller ny konto. Skjemaet beholder bare det
// som hører til et skjema: honningfella, `next`, `invite` og redirectene.
//
// Rekkefølgen er bevisst: tom adresse, fartsgrensen, bryteren for nye kontoer,
// engangs-sperren, invitasjonen, så GoTrue. Det billigste og mest avslørende
// stopper først, og ingen sperre koster Supabase-kvote.

export type SendLoginCodeResult = { ok: true } | { ok: false; code: SendLoginCodeError };

/**
 * Er nye kontoer åpne for alle? Det ene stedet som leser
 * `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION`.
 *
 * Leses ved hvert kall, ikke ved import: testene bytter flagget per test.
 * Bryteren er en nødbrems mot misbruk i prod; av betyr at bare inviterte
 * adresser får ny konto.
 */
export function selfRegistrationOpen(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_SELF_REGISTRATION === 'true';
}

/**
 * Be GoTrue sende en innloggingskode til `email`, bak nettsidens sperrer.
 *
 * `supabase` er kallerens klient (begge kallerne sender `getServerClient()`),
 * samme mønster som `inviteToGame`. `ip` er kallerens IP fra `getClientIp()`.
 * E-posten trimmes og gjøres liten her, så kallerne kan sende den som den kom.
 */
export async function sendLoginCode({
  supabase,
  email: rawEmail,
  ip,
}: {
  supabase: SupabaseClient<Database>;
  email: string;
  ip: string;
}): Promise<SendLoginCodeResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return { ok: false, code: 'unknown' };

  // Defense-in-depth on top of Supabase's built-in OTP throttle: a per-email
  // and per-IP bucket on `admin_action_rate_limit`. Runs before signInWithOtp
  // so we don't pay Supabase quota on a known-abusive sender. Both bucket
  // trips map to the same `rate_limited` error code so the response doesn't
  // leak which limit hit.
  const rl = await consumeLoginRateLimit({ email, ip });
  if (!rl.ok) return { ok: false, code: 'rate_limited' };

  // Self-registration is gated by an env flag so we can ramp it carefully
  // in prod (kill-switch on abuse). When the flag is off, only emails with an
  // open invitation row get `shouldCreateUser=true`. When on, any email
  // reaches Supabase OTP and a new auth.users row is created on first
  // verifyOtp.
  const allowSelfReg = selfRegistrationOpen();

  // #365: with open self-reg on, refuse known disposable / throwaway inbox
  // providers regardless of invitation status. They're the cheap mass-
  // account-creation vector (public, readable inboxes), and blocking them
  // here also closes the spray-invite bypass — any logged-in user can
  // friend-invite up to 10 addresses/day, so an "invited = exempt" rule
  // would let a self-registered seed account whitelist disposable domains.
  // Sits after rate-limit (a disposable spray still burns the IP bucket)
  // and before the email_is_invited RPC + Supabase OTP (saves quota on a
  // known-bad domain). Off-flag behaviour is unchanged.
  if (allowSelfReg && isDisposableEmailDomain(email)) {
    console.warn('[sendLoginCode] disposable email rejected');
    return { ok: false, code: 'disposable_email' };
  }

  const { data: isInvited } = await supabase.rpc('email_is_invited', {
    check_email: email,
  });
  const shouldCreateUser = Boolean(isInvited) || allowSelfReg;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser },
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    let code: SendLoginCodeError = 'unknown';
    if (msg.includes('email rate limit exceeded')) {
      // #1434: the project-wide mail quota — NO mail was sent, unlike the
      // 60-second throttle below where a code is already in the inbox. Both
      // share error.code `over_email_send_rate_limit`, so the message text is
      // the only discriminator, and this check MUST come before the generic
      // heuristic: the quota string itself contains "rate".
      code = 'rate_limited_quota';
    } else if (
      msg.includes('rate') ||
      msg.includes('too many') ||
      msg.includes('security purposes')
    ) {
      // #1347: Supabase's own OTP throttle is a 60-second gap between mails —
      // a different wait from our 15-minute bucket above, which trips before
      // this call. Separate code so the copy can name the actual wait.
      // (One known impostor remains: Supabase's IP-level
      // `over_request_rate_limit` — "Too many requests…" — still matches.)
      code = 'rate_limited_minute';
    } else if (
      msg.includes('not found') ||
      msg.includes('signups not allowed') ||
      msg.includes('signups are disabled') ||
      msg.includes('otp_disabled') ||
      msg.includes('disabled')
    ) {
      code = 'user_not_found';
    }

    // #361: a "not found" can mean "never invited" OR "was invited, but it
    // lapsed". email_is_invited already filters expired rows, so both land
    // here. Look for a lapsed invitation so we can show "ask for a new one"
    // instead of a dead-end "not registered". Best-effort — falls back to the
    // generic code if the lookup throws.
    if (code === 'user_not_found') {
      try {
        const admin = getAdminClient();
        const { data: expiredInvite } = await admin
          .from('invitations')
          .select('id')
          .filter('email', 'imatch', emailMatchPattern(email))
          .is('accepted_at', null)
          .not('expires_at', 'is', null)
          .lte('expires_at', new Date().toISOString())
          .limit(1)
          .maybeSingle<{ id: string }>();
        if (expiredInvite) {
          code = 'invite_expired';
        }
      } catch (err) {
        console.error('[sendLoginCode] expired-invite lookup failed', err);
      }
    }

    return { ok: false, code };
  }

  // Best-effort: stamp opened_at on the matching pending invitation row so
  // admins can see "has requested a code" vs "mail never acted on".
  // Uses the service-role client because the user has no session yet at this
  // point — RLS cannot grant write access to a pre-auth visitor.
  // We only set it once (is null guard), so repeated OTP requests don't
  // overwrite the first-open timestamp.
  // postgrest-js returns a DB error instead of throwing it, so the error is
  // read here; the catch only sees synchronous throws (missing env). 0 rows is
  // normal: no invitation, or opened_at is already set.
  try {
    const adminClient = getAdminClient();
    const { error: stampError } = await adminClient
      .from('invitations')
      .update({ opened_at: new Date().toISOString() })
      .filter('email', 'imatch', emailMatchPattern(email))
      .is('accepted_at', null)
      .is('opened_at', null);
    if (stampError) {
      console.error('[sendLoginCode] opened_at stamp failed', stampError);
    }
  } catch (err) {
    console.error('[sendLoginCode] opened_at stamp failed', err);
  }

  return { ok: true };
}
