'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getServerClient } from '@/lib/supabase/server';
import { sendLoginCode } from '@/lib/auth/sendLoginCode';
import { afterLogin } from '@/lib/auth/afterLogin';
import { getClientIp } from '@/lib/admin/rateLimit';
import { isInviteToken } from '@/lib/auth/getInviteLoginContext';
import { routing, type AppLocale } from '@/i18n/routing';
import { safeInternalPath } from '@/lib/url/safeInternalPath';

/**
 * #1345: ett hjem for alle feil-redirects i login-flyten. Hver feilsti tar med
 * seg konteksten brukeren allerede har gitt oss — e-post, `next` og `invite` —
 * så en feiltastet kode eller en for rask «Send ny kode» ikke kaster dem
 * tilbake til et tomt steg 1 og mister målsiden + invitasjonskortet.
 *
 * `step: 'verify'` settes KUN når vi har en e-post å verifisere mot; ellers er
 * verify-steget en blindvei (kodefelt uten adresse).
 *
 * Param-rekkefølgen er bevisst deterministisk (step, email, error, next,
 * invite, sent) — unit-testene låser eksakte URL-strenger.
 *
 * #2349: `sent` (unix-sekunder) driver nedtellingen «Ny kode om 0:42» på
 * verify-steget. En feiltastet kode eller en avvist «Send ny kode» skal ikke
 * starte den på nytt, så den følger med — sist, og bare sifre.
 */
function loginErrorRedirect(
  code: string,
  ctx: { email?: string; next?: string; invite?: string; step?: 'verify'; sent?: string },
): never {
  const qs = new URLSearchParams();
  if (ctx.step && ctx.email) qs.set('step', ctx.step);
  if (ctx.email) qs.set('email', ctx.email);
  qs.set('error', code);
  if (ctx.next) qs.set('next', ctx.next);
  if (ctx.invite) qs.set('invite', ctx.invite);
  if (ctx.step && ctx.email && ctx.sent && /^\d+$/.test(ctx.sent)) qs.set('sent', ctx.sent);
  redirect(`/login?${qs.toString()}`);
}

/**
 * #2349: when the code went out, in whole unix seconds — the verify step counts
 * down from it. Supabase does not tell us when it sent a code, so we stamp it.
 */
function sentNow(): string {
  return String(Math.floor(Date.now() / 1000));
}

/** The `sent` a verify-step form carries on (checked in `loginErrorRedirect`). */
function formSent(formData: FormData): string {
  return String(formData.get('sent') ?? '').trim();
}

// Step 1 of two-step OTP login. Verifies the email is either registered
// (existing user) or has an open invitation, then asks Supabase to send an
// 8-digit code. Existing users are detected implicitly: shouldCreateUser
// is gated on whether the email has an open invitation row, and Supabase
// reports an error for unknown emails when shouldCreateUser=false — we
// map that to user_not_found.
export async function sendCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const nextRaw = String(formData.get('next') ?? '').trim();
  const next = safeInternalPath(nextRaw) ?? '';

  // #1169: invitasjons-token fra kontekstkort-flyten — videreføres til
  // verify-steget så kortet blir stående. Kun visning; alt annet enn en
  // UUID-formet verdi droppes. #1345: også feil-redirects tar den med seg.
  const inviteRaw = String(formData.get('invite') ?? '').trim();
  const invite = isInviteToken(inviteRaw) ? inviteRaw : '';

  // #1345: «Send ny kode» på verify-steget poster hit med from=verify. Da skal
  // en feil (typisk Supabase-throttle innen 60 sek) sende brukeren tilbake til
  // kodefeltet — ikke til et tomt steg 1 mens en gyldig kode er på vei.
  // Kun formData, aldri en URL-param.
  const fromVerify = String(formData.get('from') ?? '').trim() === 'verify';
  const errorCtx = {
    email,
    next,
    invite,
    step: fromVerify ? ('verify' as const) : undefined,
    // #2349: the countdown of the code already on its way survives a rejected
    // «Send ny kode». From step 1 there is no code yet, so no `sent`.
    sent: fromVerify ? formSent(formData) : undefined,
  };

  // Honeypot — the `website` field is hidden via CSS/tabindex/aria so real
  // users never see it. Form-filling bots typically populate every input that
  // looks plausibly relevant, including hidden ones. If we see a value, we
  // pretend success (redirect to the verify step) without calling Supabase,
  // so the bot can't distinguish a hit from a miss. Logged to Vercel for
  // traffic awareness only — no DB write.
  const honeypot = String(formData.get('website') ?? '').trim();
  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'login' });
    const qs = new URLSearchParams({ step: 'verify', email });
    if (next) qs.set('next', next);
    if (invite) qs.set('invite', invite);
    qs.set('sent', sentNow());
    redirect(`/login?${qs.toString()}`);
  }

  if (!email) {
    loginErrorRedirect('unknown', errorCtx);
  }

  // #2216: the gate itself — rate limit, the self-registration switch, the
  // disposable-email block, the invitation lookup, GoTrue and the error
  // mapping — lives in `sendLoginCode`, shared with the app's route
  // (`app/api/auth/send-code`). This action only turns its answer into a
  // redirect.
  const result = await sendLoginCode({
    supabase: await getServerClient(),
    email,
    ip: await getClientIp(),
  });

  if (!result.ok) {
    // #1347: the 60-second throttle only fires when a code for this address
    // is already in the user's inbox, so the honest place to land is the code
    // field — regardless of whether the request came from step 1 or from
    // «Send ny kode». The copy («be om ny kode om ett minutt») is only true
    // there. `email` is non-empty here; the guard above redirects otherwise.
    // #2349: it also starts the countdown there. Supabase only says this when
    // a code went out less than 60 s ago, so a fresh `sent` (when the request
    // came from step 1) never makes «Send ny kode» wait too short.
    if (result.code === 'rate_limited_minute') {
      loginErrorRedirect(result.code, {
        ...errorCtx,
        step: 'verify',
        sent: errorCtx.sent || sentNow(),
      });
    }
    loginErrorRedirect(result.code, errorCtx);
  }

  const qs = new URLSearchParams({ step: 'verify', email });
  if (next) qs.set('next', next);
  if (invite) qs.set('invite', invite);
  qs.set('sent', sentNow());
  redirect(`/login?${qs.toString()}`);
}

// Step 2: verify the 8-digit code, set the session cookie, mark any
// pending invitation rows for this email as accepted (replaces the
// side-effect that lived in /auth/callback), and redirect to next
// destination.
export async function verifyCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const token = String(formData.get('token') ?? '').trim();
  const nextRaw = String(formData.get('next') ?? '').trim();
  // A rejected next behaves as no next, so the invite routing below applies.
  const explicitNext = safeInternalPath(nextRaw);
  const hasExplicitNext = explicitNext !== null;
  const next = explicitNext ?? '/';

  // #1345: konteksten som skal overleve en feiltastet kode. `next` tas bare med
  // når den var eksplisitt satt (default-en '/' hører ikke hjemme i en URL), og
  // `invite` gates på UUID-formen som ellers i flyten (#1169) så kontekstkortet
  // blir stående gjennom feil-redirecten.
  const inviteRaw = String(formData.get('invite') ?? '').trim();
  const invite = isInviteToken(inviteRaw) ? inviteRaw : '';
  const errorCtx = {
    email,
    next: explicitNext ?? '',
    invite,
    step: 'verify' as const,
    // #2349: a mistyped code does not restart «Ny kode om 0:42».
    sent: formSent(formData),
  };

  if (!email || !token) {
    loginErrorRedirect('code_invalid', errorCtx);
  }

  const supabase = await getServerClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    const code = msg.includes('expired') ? 'code_expired' : 'code_invalid';
    loginErrorRedirect(code, errorCtx);
  }

  // i18n: persist the cookie-resolved locale to users.locale when it is NULL.
  // Covers the "switched to English pre-auth, then logged in" path so the
  // choice follows the user cross-device via the proxy negotiation chain.
  // NULL-only: never overwrites a value already set by the user.
  // Best-effort — must never block login.
  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
    if (cookieLocale && routing.locales.includes(cookieLocale as AppLocale)) {
      const {
        data: { user: authedUser },
      } = await supabase.auth.getUser();
      if (authedUser) {
        // Use .is('locale', null) guard so we never overwrite an existing value
        // even in the presence of a race condition. 0 rows is normal (already
        // set); only an error is logged.
        const { error: localeError } = await supabase
          .from('users')
          .update({ locale: cookieLocale })
          .eq('id', authedUser.id)
          .is('locale', null);
        if (localeError) {
          console.error('[login/verifyCode] locale-persist failed', localeError);
        }
      }
    }
  } catch (err) {
    console.error('[login/verifyCode] locale-persist threw', err);
  }

  // #2216: what happens after the login — the guest flag, the pending
  // invitations (roster spot, notification, consume, friendship) and the club
  // invitations — lives in `afterLogin`, shared with the app's route
  // (`app/api/auth/after-login`). The user's id is read here, inside a
  // try/catch: when it can't be read, `afterLogin` still runs on the email and
  // only skips the guest flag.
  let sessionUserId: string | null = null;
  try {
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    sessionUserId = sessionUser?.id ?? null;
  } catch (err) {
    console.error('[login/verifyCode] session user lookup threw', err);
  }
  const { landing } = await afterLogin(supabase, { userId: sessionUserId, email });

  // #356/#1176: redirect skjer her, utenfor alle try/catch-er — redirect()
  // kaster NEXT_REDIRECT, som en catch ville slukt og aldri navigert.
  // #1176: invitéen sendes RETT til spillet (ikke lenger en /complete-profile-
  // detour). Profilporten er nå en myk stripe på spill-hjem + en hard gate ved
  // scoring, så spilleren ser hva de er invitert til før de fyller ut navn/HCP.
  // #2212: unntaket er en runde som allerede har startet — da går invitéen til
  // /complete-profile med en beskjed, siden spillet ikke har plass til dem.
  if (landing && !hasExplicitNext) {
    redirect(landing);
  }

  redirect(next);
}
