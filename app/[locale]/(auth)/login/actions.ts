'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { consumeLoginRateLimit } from '@/lib/auth/loginRateLimit';
import { isDisposableEmailDomain } from '@/lib/auth/disposableEmail';
import { getClientIp } from '@/lib/admin/rateLimit';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';
import { distinctInviterIds } from '@/lib/friends/friendGraph';

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

    await supabase
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .ilike('email', email)
      .is('accepted_at', null);

    const gameScoped = (pendingInvites ?? []).filter(
      (inv) => inv.game_id != null && inv.invited_by != null,
    );

    if (gameScoped.length > 0) {
      const { data: userRow } = await admin
        .from('users')
        .select('id, profile_completed_at')
        .ilike('email', email)
        .maybeSingle<{ id: string; profile_completed_at: string | null }>();

      if (userRow?.id) {
        // Resolve hver scopet invitasjons registration_type FØRST. Vi trenger
        // den til to ting: (a) hoppe over solo-game_players-insert på team-only
        // spill (#199), og (b) #356 — avgjøre hvor invitéen skal lande etterpå.
        // Team-only spill (#199) skal ikke få en solo-rad auto-opprettet — det
        // ville bryte CHECK-constraint på team_number/flight_number-konsistens.
        // I stedet havner invitéen på `/signup/[shortId]/team` når de melder seg
        // på laget.
        const resolved = await Promise.all(
          gameScoped.map(async (inv) => {
            const { data: gameRow } = await admin
              .from('games')
              .select('registration_type')
              .eq('id', inv.game_id!)
              .maybeSingle<{ registration_type: string }>();
            return {
              inv,
              isTeamOnly: gameRow?.registration_type === 'team',
            };
          }),
        );

        await Promise.allSettled(
          resolved.map(async ({ inv, isTeamOnly }) => {
            if (!isTeamOnly) {
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
            // For team-only spill: invitéen får et team_invite-varsel når de
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
        // forespørsler). Gjelder også team-only spill — vennskapet henger på
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

        // #356: send en spill-scopet invitee rett til spillet sitt i stedet for
        // å dumpe dem på hjem-skjermen for å lete. Gjelder kun når det er ett
        // entydig solo-spill og ingen eksplisitt `next` (f.eks. /signup-deep-
        // link) — flere invitasjoner eller team-only faller tilbake til hjem.
        const soloInvites = resolved.filter((r) => !r.isTeamOnly);
        if (!hasExplicitNext && soloInvites.length === 1) {
          gameDest = `/games/${soloInvites[0].inv.game_id}`;
          profileIncomplete = userRow.profile_completed_at == null;
        }
      }
    }
  } catch (err) {
    console.warn('[login/verifyCode] invitation-accept side-effect threw', err);
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
