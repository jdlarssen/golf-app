'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { consumeLoginRateLimit } from '@/lib/auth/loginRateLimit';
import { isDisposableEmailDomain } from '@/lib/auth/disposableEmail';
import { getClientIp } from '@/lib/admin/rateLimit';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';
import { distinctInviterIds } from '@/lib/friends/friendGraph';
import { isRosterLocked } from '@/lib/games/status';
import { isInviteToken } from '@/lib/auth/getInviteLoginContext';
import { routing, type AppLocale } from '@/i18n/routing';
import { safeInternalPath } from '@/lib/url/safeInternalPath';
import { emailMatchPattern } from '@/lib/supabase/emailMatch';

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
 * invite) — unit-testene låser eksakte URL-strenger.
 */
function loginErrorRedirect(
  code: string,
  ctx: { email?: string; next?: string; invite?: string; step?: 'verify' },
): never {
  const qs = new URLSearchParams();
  if (ctx.step && ctx.email) qs.set('step', ctx.step);
  if (ctx.email) qs.set('email', ctx.email);
  qs.set('error', code);
  if (ctx.next) qs.set('next', ctx.next);
  if (ctx.invite) qs.set('invite', ctx.invite);
  redirect(`/login?${qs.toString()}`);
}

// Step 1 of two-step OTP login. Verifies the email is either registered
// (existing user) or has an open invitation, then asks Supabase to send a
// 6-digit code. Existing users are detected implicitly: shouldCreateUser
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
    redirect(`/login?${qs.toString()}`);
  }

  if (!email) {
    loginErrorRedirect('unknown', errorCtx);
  }

  // Defense-in-depth on top of Supabase's built-in OTP throttle: a per-email
  // and per-IP bucket on `admin_action_rate_limit`. Sits after the honeypot
  // (cheaper short-circuit first) but before signInWithOtp so we don't pay
  // Supabase quota on a known-abusive sender. Both bucket trips map to the
  // same `rate_limited` error code so the response doesn't leak which limit
  // hit.
  const ip = await getClientIp();
  const rl = await consumeLoginRateLimit({ email, ip });
  if (!rl.ok) {
    loginErrorRedirect('rate_limited', errorCtx);
  }

  // Self-registration is gated by an env flag so we can ramp it carefully
  // in prod (kill-switch on abuse). When the flag is off, behaviour is
  // identical to pre-#166: only emails with an open invitation row get
  // `shouldCreateUser=true`. When on, any email reaches Supabase OTP and
  // a new auth.users row is created on first verifyOtp.
  const allowSelfReg =
    process.env.NEXT_PUBLIC_ALLOW_SELF_REGISTRATION === 'true';

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
    console.warn('[login/sendCode] disposable email rejected');
    loginErrorRedirect('disposable_email', errorCtx);
  }

  const supabase = await getServerClient();

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
    let code:
      | 'rate_limited_quota'
      | 'rate_limited_minute'
      | 'user_not_found'
      | 'invite_expired'
      | 'unknown' = 'unknown';
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
        console.error('[login/sendCode] expired-invite lookup failed', err);
      }
    }

    // #1347: the 60-second throttle only fires when a code for this address
    // is already in the user's inbox, so the honest place to land is the code
    // field — regardless of whether the request came from step 1 or from
    // «Send ny kode». The copy («be om ny kode om ett minutt») is only true
    // there. `email` is non-empty here; the guard above redirects otherwise.
    // (One known impostor remains: Supabase's IP-level `over_request_rate_limit`
    // — "Too many requests…" — still matches the heuristic and lands here.)
    if (code === 'rate_limited_minute') {
      loginErrorRedirect(code, { ...errorCtx, step: 'verify' });
    }

    loginErrorRedirect(code, errorCtx);
  }

  // Best-effort: stamp opened_at on the matching pending invitation row so
  // admins can see "has requested a code" vs "mail never acted on".
  // Uses the service-role client because the user has no session yet at this
  // point — RLS cannot grant write access to a pre-auth visitor.
  // We only set it once (is null guard), so repeated OTP requests don't
  // overwrite the first-open timestamp.
  try {
    const adminClient = getAdminClient();
    await adminClient
      .from('invitations')
      .update({ opened_at: new Date().toISOString() })
      .filter('email', 'imatch', emailMatchPattern(email))
      .is('accepted_at', null)
      .is('opened_at', null);
  } catch (err) {
    console.error('[login/sendCode] opened_at stamp failed', err);
  }

  const qs = new URLSearchParams({ step: 'verify', email });
  if (next) qs.set('next', next);
  if (invite) qs.set('invite', invite);
  redirect(`/login?${qs.toString()}`);
}

// Step 2: verify the 6-digit code, set the session cookie, mark any
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
        // even in the presence of a race condition.
        await supabase
          .from('users')
          .update({ locale: cookieLocale })
          .eq('id', authedUser.id)
          .is('locale', null);
      }
    }
  } catch (err) {
    console.error('[login/verifyCode] locale-persist threw', err);
  }

  // #1009: en gjest som logger inn har bevist eierskap til den claimede
  // adressen (OTP-koden — plassholder-domenet uten MX kan aldri motta en).
  // Nulles via service-role: guard_users_self_update (0127) sperrer selv-
  // endring av is_guest for request-klienten. `.eq('is_guest', true)` gjør
  // dette til en no-op 0-raders update for alle vanlige innlogginger.
  // Best-effort — må aldri blokkere login.
  try {
    const {
      data: { user: guestCheckUser },
    } = await supabase.auth.getUser();
    if (guestCheckUser) {
      await getAdminClient()
        .from('users')
        .update({ is_guest: false })
        .eq('id', guestCheckUser.id)
        .eq('is_guest', true);
    }
  } catch (err) {
    console.error('[login/verifyCode] guest-clear threw', err);
  }

  // Pick up the pending invitations for this email: consume them (accepted_at),
  // give game invitations a roster spot, fire the deferred in-app `invite`
  // notification, and befriend the inviter. Best-effort throughout — the login
  // redirects whether or not the side effects succeed.
  //
  // A game invitation only gives a roster spot while the round has not started
  // (#182, #2212) — the same rule as the invite doors (`isRosterLocked`). An
  // invitation to an active or finished round is still consumed, but gives no
  // spot and no notification; the invitee lands on /complete-profile with a
  // notice instead. The exception is a guest whose result was sent to them
  // after the round (#1009): they are already on the roster and land on the
  // game as before.
  //
  // The pending rows are read BEFORE accepted_at flips so game_id + invited_by
  // are still available. The admin client is used because the freshly verified
  // user's public.users id is not yet reachable through the cookie client in
  // this action (auth state propagates asynchronously).
  //
  // #356: gameDest is set inside the block but used for the redirect AFTER it
  // (see the note at the redirect below).
  let gameDest: string | null = null;

  try {
    const admin = getAdminClient();
    // #1348: utløpsregelen har to hjem — `email_is_invited`-RPC-en (0100) som
    // gater sendCode, og dette oppslaget. De MÅ være enige: uten
    // `expires_at`-filteret her ble en utløpt invitasjon konsumert ved
    // innlogging (accepted_at flippet, game_players insertet, varsel fyrt),
    // selv om sendCode-laget regnet den som død. Samme figur som
    // `lib/auth/getInviteLoginContext.ts`. Kolonnen er NOT NULL, så ingen
    // null-case å bevare.
    const { data: pendingInvites } = await admin
      .from('invitations')
      .select('id, game_id, invited_by')
      .filter('email', 'imatch', emailMatchPattern(email))
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .returns<{ id: string; game_id: string | null; invited_by: string }[]>();

    // Kun `game_id` skiller her: `invited_by` er NOT NULL (0001), så en
    // null-sjekk på den ville aldri kunne treffe.
    const gameScoped = (pendingInvites ?? []).filter((inv) => inv.game_id != null);

    // #676: resolve registration_type + short_id for every game-scoped
    // invitation so we know which are team-scoped BEFORE deciding which
    // invitations to consume and where to redirect. #2212: status too, so a
    // started or finished round gives no roster spot.
    //
    // 'both' games must be treated identically to 'team' games here — a
    // co-player invited by a captain on a 'both' game should route to
    // /signup/[shortId]/team (attach flow), not be auto-inserted as a solo
    // game_players row. Consuming accepted_at before the attach flow runs
    // destroys the signal team/page.tsx relies on to show "Bli med på lag".
    const resolvedGameScoped = await Promise.all(
      gameScoped.map(async (inv) => {
        const { data: gameRow } = await admin
          .from('games')
          .select('registration_type, short_id, status')
          .eq('id', inv.game_id!)
          .maybeSingle<{
            registration_type: string;
            short_id: string;
            status: string;
          }>();
        const isTeamScoped =
          gameRow?.registration_type === 'team' ||
          gameRow?.registration_type === 'both';
        return {
          inv,
          isTeamScoped,
          shortId: gameRow?.short_id ?? null,
          isLocked: gameRow != null && isRosterLocked(gameRow.status),
        };
      }),
    );

    // Only consume (flip accepted_at) invitations that are NOT team-scoped.
    // Team-scoped invitations must remain pending so the attach flow on
    // /signup/[shortId]/team can detect them. Game-less invitations (no
    // game_id) are always consumed — they are friend/club rows with no
    // downstream attach dependency. #2212: invitations to a locked round are
    // consumed too, so they leave the admin waiting list.
    const teamScopedInvIds = new Set(
      resolvedGameScoped.filter((r) => r.isTeamScoped).map((r) => r.inv.id),
    );
    const inviteIdsToConsume = (pendingInvites ?? [])
      .filter((inv) => !teamScopedInvIds.has(inv.id))
      .map((inv) => inv.id);

    if (inviteIdsToConsume.length > 0) {
      await supabase
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .in('id', inviteIdsToConsume);
    }

    // The user lookup runs for ANY pending invitation, game-less ones
    // included: they give friendship too (#2212).
    if ((pendingInvites ?? []).length > 0) {
      const { data: userRow } = await admin
        .from('users')
        .select('id')
        .filter('email', 'imatch', emailMatchPattern(email))
        .maybeSingle<{ id: string }>();

      if (userRow?.id) {
        // #2212: for a locked solo invitation, check whether the invitee is
        // already on the roster (the guest-claim case, #1009). A failed read
        // counts as "not on the roster": the invitee then gets the notice
        // instead of the game, which is the safe side.
        const onRosterGameIds = new Set<string>();
        await Promise.allSettled(
          resolvedGameScoped
            .filter((r) => r.isLocked && !r.isTeamScoped)
            .map(async ({ inv }) => {
              const { data: membership, error: membershipError } = await admin
                .from('game_players')
                .select('user_id')
                .eq('game_id', inv.game_id!)
                .eq('user_id', userRow.id)
                .maybeSingle<{ user_id: string }>();
              if (membershipError) {
                console.error(
                  '[login/verifyCode] roster membership check failed',
                  membershipError,
                );
                return;
              }
              if (membership) onRosterGameIds.add(inv.game_id!);
            }),
        );

        await Promise.allSettled(
          resolvedGameScoped
            .filter((r) => !r.isLocked)
            .map(async ({ inv, isTeamScoped }) => {
              if (!isTeamScoped) {
                const { error: insertError } = await admin
                  .from('game_players')
                  .insert({
                    game_id: inv.game_id!,
                    user_id: userRow.id,
                    team_number: null,
                    flight_number: null,
                    course_handicap: null,
                    // #463: brukeren godtar invitasjonen nå (handlingen ER aksept).
                    accepted_at: new Date().toISOString(),
                  });

                const duplicate =
                  insertError != null &&
                  (insertError.code === '23505' ||
                    String(insertError.message ?? '')
                      .toLowerCase()
                      .includes('duplicate'));

                if (insertError && !duplicate) {
                  console.error(
                    '[login/verifyCode] game_players insert failed',
                    insertError,
                  );
                  return;
                }
              }

              // Only rounds that have not started get here, so the
              // notification always points at something the invitee can act
              // on (#2212). Team-scoped invitees get their team_invite
              // notification when they tap «Bli med på lag» on
              // /signup/[shortId]/team; this one is the greeting that tells
              // them they are logged in and can join the team.
              // notifyInvitedToGame swallows its own errors.
              await notifyInvitedToGame({
                recipientUserId: userRow.id,
                gameId: inv.game_id!,
                inviterUserId: inv.invited_by,
              });
            }),
        );

        // #481, #2212: an invitee who joins becomes friends with whoever
        // invited them, so the friend graph grows through invitations and not
        // only through manual requests. This covers every invitation: game
        // invitations (started rounds and team games included, since the
        // friendship hangs on the invitation, not on a game_players row) and
        // the game-less ones from «Legg til venn på e-post» and the admin
        // door. The RPC is idempotent and gated on an accepted invitation, so
        // it is safe to fire per inviter; for a team invitation that is still
        // pending it answers no_invitation until the attach flow accepts it.
        // Best-effort: fails quietly, never blocks the login.
        const inviterIds = distinctInviterIds(pendingInvites ?? [], userRow.id);
        await Promise.allSettled(
          inviterIds.map(async (inviterId) => {
            const { error } = await supabase.rpc('befriend_inviter', {
              p_inviter: inviterId,
            });
            if (error) {
              console.error('[login/verifyCode] befriend_inviter failed', error);
            }
          }),
        );

        // #356 / #676 / #2212: route an invitee directly to their game.
        // - joinable = solo invitations to a round that has not started, or to
        //   a locked round the invitee is already on (guest claim, #1009).
        // - Exactly one joinable, no team-scoped: → /games/[id]
        // - Exactly one team-scoped game ('team' or 'both'), no joinable: →
        //   /signup/[shortId]/team so the attach flow finds the still-pending
        //   invitation and shows "Bli med på lag".
        // - No joinable, no team-scoped, and at least one solo invitation to a
        //   started or finished round: → /complete-profile with a notice that
        //   the round had already started.
        // - Anything else (mixed or multiple): fall back to `next` (ambiguous).
        // All destination overrides are skipped when an explicit `next` is set.
        const soloInvites = resolvedGameScoped.filter((r) => !r.isTeamScoped);
        const joinable = soloInvites.filter(
          (r) => !r.isLocked || onRosterGameIds.has(r.inv.game_id!),
        );
        const lockedOut = soloInvites.filter(
          (r) => r.isLocked && !onRosterGameIds.has(r.inv.game_id!),
        );
        const teamScopedInvites = resolvedGameScoped.filter(
          (r) => r.isTeamScoped && r.shortId != null,
        );
        if (!hasExplicitNext) {
          if (joinable.length === 1 && teamScopedInvites.length === 0) {
            gameDest = `/games/${joinable[0].inv.game_id}`;
          } else if (
            teamScopedInvites.length === 1 &&
            joinable.length === 0
          ) {
            gameDest = `/signup/${teamScopedInvites[0].shortId}/team`;
          } else if (
            joinable.length === 0 &&
            teamScopedInvites.length === 0 &&
            lockedOut.length > 0
          ) {
            gameDest = '/complete-profile?invite_notice=game_started';
          }
        }
      }
    }
  } catch (err) {
    console.warn('[login/verifyCode] invitation-accept side-effect threw', err);
  }

  // #644: klubb-invitasjon-avstemming. En uregistrert e-post kan ha fått en
  // ventende club_invitation (admin la dem til via «Legg til medlem på e-post»).
  // Nå som brukeren er verifisert, gjør accept_club_invitations() dem til medlem
  // av klubben(e) som inviterte dem (rolle 'member', tak/utløp respektert).
  // Bruker den request-scopede klienten så RPC-ens auth.uid() er den nettopp
  // verifiserte brukeren. Separat best-effort-blokk — en feil her må aldri
  // blokkere innloggingen (som game-avstemmingen over).
  try {
    const { error: clubErr } = await supabase.rpc('accept_club_invitations');
    if (clubErr) {
      console.error('[login/verifyCode] accept_club_invitations failed', clubErr);
    }
  } catch (err) {
    console.warn('[login/verifyCode] club-invite-accept side-effect threw', err);
  }

  // #356/#1176: redirect skjer UTENFOR try/catch-en over — redirect() kaster
  // NEXT_REDIRECT, som ville blitt slukt av catch-en og aldri navigert.
  // #1176: invitéen sendes RETT til spillet (ikke lenger en /complete-profile-
  // detour). Profilporten er nå en myk stripe på spill-hjem + en hard gate ved
  // scoring, så spilleren ser hva de er invitert til før de fyller ut navn/HCP.
  // #2212: unntaket er en runde som allerede har startet — da går invitéen til
  // /complete-profile med en beskjed, siden spillet ikke har plass til dem.
  if (gameDest) {
    redirect(gameDest);
  }

  redirect(next);
}
