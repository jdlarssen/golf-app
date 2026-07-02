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
import { routing, type AppLocale } from '@/i18n/routing';

// Step 1 of two-step OTP login. Verifies the email is either registered
// (existing user) or has an open invitation, then asks Supabase to send a
// 6-digit code. Existing users are detected implicitly: shouldCreateUser
// is gated on whether the email has an open invitation row, and Supabase
// reports an error for unknown emails when shouldCreateUser=false — we
// map that to user_not_found.
export async function sendCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const nextRaw = String(formData.get('next') ?? '').trim();
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '';

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
    redirect(`/login?${qs.toString()}`);
  }

  if (!email) {
    redirect('/login?error=unknown');
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
    redirect('/login?error=rate_limited');
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
    redirect('/login?error=disposable_email');
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
      | 'rate_limited'
      | 'user_not_found'
      | 'invite_expired'
      | 'unknown' = 'unknown';
    if (
      msg.includes('rate') ||
      msg.includes('too many') ||
      msg.includes('security purposes')
    ) {
      code = 'rate_limited';
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
          .ilike('email', email)
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

    redirect(`/login?error=${code}`);
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
      .ilike('email', email)
      .is('accepted_at', null)
      .is('opened_at', null);
  } catch (err) {
    console.error('[login/sendCode] opened_at stamp failed', err);
  }

  const qs = new URLSearchParams({ step: 'verify', email });
  if (next) qs.set('next', next);
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
  const hasExplicitNext =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//');
  const next = hasExplicitNext ? nextRaw : '/';

  if (!email || !token) {
    const qs = new URLSearchParams({
      step: 'verify',
      email,
      error: 'code_invalid',
    });
    redirect(`/login?${qs.toString()}`);
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
    const qs = new URLSearchParams({ step: 'verify', email, error: code });
    redirect(`/login?${qs.toString()}`);
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

  // Mark any pending invitation rows for this email as accepted, and pick
  // opp game-scoped invitations som ble opprettet via /admin/games/[id]
  // -invite-card-en. For hver game-scoped invitasjon: insert i game_players
  // og fyr in-app `invite`-varselet deferred. Best-effort hele veien —
  // login-flyten redirecter til `next` uansett om side-effektene feiler.
  //
  // Henter pending invitasjoner FØR vi flipper accepted_at slik at vi
  // også fanger game_id + invited_by. Bruker admin-client her fordi
  // public.users.id-en til den nyverifiserte brukeren ennå ikke er
  // tilgjengelig via cookie-klienten i denne action-en (auth-state
  // propagerer asynkront); admin-client har uansett tilgang.
  //
  // #356: gameDest/profileIncomplete settes inne i blokken, men brukes til
  // redirect ETTER den (se note ved redirect-en under).
  let gameDest: string | null = null;
  let profileIncomplete = false;

  try {
    const admin = getAdminClient();
    const { data: pendingInvites } = await admin
      .from('invitations')
      .select('id, game_id, invited_by')
      .ilike('email', email)
      .is('accepted_at', null)
      .returns<
        { id: string; game_id: string | null; invited_by: string | null }[]
      >();

    const gameScoped = (pendingInvites ?? []).filter(
      (inv) => inv.game_id != null && inv.invited_by != null,
    );

    // #676: resolve registration_type + short_id for every game-scoped
    // invitation so we know which are team-scoped BEFORE deciding which
    // invitations to consume and where to redirect.
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
          .select('registration_type, short_id')
          .eq('id', inv.game_id!)
          .maybeSingle<{ registration_type: string; short_id: string }>();
        const isTeamScoped =
          gameRow?.registration_type === 'team' ||
          gameRow?.registration_type === 'both';
        return {
          inv,
          isTeamScoped,
          shortId: gameRow?.short_id ?? null,
        };
      }),
    );

    // Only consume (flip accepted_at) invitations that are NOT team-scoped.
    // Team-scoped invitations must remain pending so the attach flow on
    // /signup/[shortId]/team can detect them. Game-less invitations (no
    // game_id) are always consumed — they are friend/club rows with no
    // downstream attach dependency.
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

    if (gameScoped.length > 0) {
      const { data: userRow } = await admin
        .from('users')
        .select('id, profile_completed_at')
        .ilike('email', email)
        .maybeSingle<{ id: string; profile_completed_at: string | null }>();

      if (userRow?.id) {
        await Promise.allSettled(
          resolvedGameScoped.map(async ({ inv, isTeamScoped }) => {
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

            // notifyInvitedToGame skipper finished-spill internt og swallow-er
            // egne feil, så vi trenger ingen guard her ut over Promise.allSettled.
            // For team-scoped spill: invitéen får et team_invite-varsel når de
            // klikker "Bli med på lag"-knappen på /signup/[shortId]/team
            // — verifyCode trigger her bare standard game-scoped invite-varsel
            // som en hilsen "du er logget inn, nå kan du melde deg på laget".
            await notifyInvitedToGame({
              recipientUserId: userRow.id,
              gameId: inv.game_id!,
              inviterUserId: inv.invited_by!,
            });
          }),
        );

        // #481: e-postinvitert som blir med → auto-vennskap med inviteren, så
        // vennegrafen vokser organisk gjennom invitasjoner (ikke bare manuelle
        // forespørsler). Gjelder også team-scoped spill — vennskapet henger på
        // invitasjonen, ikke på en game_players-rad. RPC-en er idempotent og
        // gated på en akseptert invitasjon, så den er trygg å fyre per inviter.
        // Best-effort: feiler stille, blokkerer aldri innloggingen.
        const inviterIds = distinctInviterIds(gameScoped, userRow.id);
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

        // #356 / #676: route an invitee directly to their game.
        // - Exactly one solo game (no team-scoped): → /games/[id]
        // - Exactly one team-scoped game ('team' or 'both'), no solo: →
        //   /signup/[shortId]/team so the attach flow finds the still-pending
        //   invitation and shows "Bli med på lag".
        // - Mixed or multiple invitations: fall back to home (ambiguous).
        // All destination-overrides are skipped when an explicit `next` is set.
        const soloInvites = resolvedGameScoped.filter((r) => !r.isTeamScoped);
        const teamScopedInvites = resolvedGameScoped.filter(
          (r) => r.isTeamScoped && r.shortId != null,
        );
        if (!hasExplicitNext) {
          if (soloInvites.length === 1 && teamScopedInvites.length === 0) {
            gameDest = `/games/${soloInvites[0].inv.game_id}`;
            profileIncomplete = userRow.profile_completed_at == null;
          } else if (
            teamScopedInvites.length === 1 &&
            soloInvites.length === 0
          ) {
            gameDest = `/signup/${teamScopedInvites[0].shortId}/team`;
            profileIncomplete = userRow.profile_completed_at == null;
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

  // #356: redirect skjer UTENFOR try/catch-en over — redirect() kaster
  // NEXT_REDIRECT, som ville blitt slukt av catch-en og aldri navigert. Mangler
  // profilen, sender vi via /complete-profile?next=… så den fullføres først, så
  // lander brukeren på spillet.
  if (gameDest) {
    if (profileIncomplete) {
      redirect(`/complete-profile?next=${encodeURIComponent(gameDest)}`);
    }
    redirect(gameDest);
  }

  redirect(next);
}
