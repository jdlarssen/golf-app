import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { emailMatchPattern } from '@/lib/supabase/emailMatch';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';
import { distinctInviterIds } from '@/lib/friends/friendGraph';
import { isRosterLocked } from '@/lib/games/status';
import { joinTeeGenders } from '@/lib/games/joinTeeGenders';

// Det som skjer etter en vellykket innlogging — ett hjem (#2216).
//
// Nettsidens `verifyCode` (`app/[locale]/(auth)/login/actions.ts`) kaller denne
// rett etter `verifyOtp`, og appen kaller den gjennom
// `POST /api/auth/after-login` når den selv har verifisert koden. Begge får
// samme sideeffekter: gjest-flagget ryddes, ventende invitasjoner gir plass i
// spillet, varsel og vennskap, og klubbinvitasjoner tas i bruk.
//
// Hver blokk er best-effort og kaster aldri: en innlogging skal aldri stoppe på
// en sideeffekt.
//
// `supabase` er klienten som er kalleren: cookie-klienten på nettsiden, en
// klient med kallerens token i appens rute (`callerScopedClient`). Invitasjons-
// konsumet (RLS-policyen «self mark accepted»), `befriend_inviter` og
// `accept_club_invitations` leser `auth.uid()` og må gå gjennom den.

/**
 * Sideeffektene etter innloggingen.
 *
 * `userId` er den innloggede brukerens id når kalleren kjenner den, ellers
 * `null` (nettsiden fikk ikke lest sesjonen). Bare gjest-blokken bruker den.
 * Invitasjonene styres av `email`, og id-en til `game_players` og varselet
 * kommer fra oppslaget på e-post, som før flyttingen.
 *
 * `landing` er stedet en invitert skal til (#356), eller `null`.
 */
export async function afterLogin(
  supabase: SupabaseClient<Database>,
  { userId, email }: { userId: string | null; email: string },
): Promise<{ landing: string | null }> {
  // #2216: the id comes from the caller (the session's user on the website,
  // the token's user in the app's route), so the guest flag is cleared only
  // when it is known. A token client has no session to ask `auth.getUser()`.
  if (userId) await clearGuestFlag(userId);

  // Pick up the pending invitations for this email: give game invitations a
  // roster spot, fire the deferred in-app `invite` notification, consume them
  // (accepted_at) and befriend the inviter. Best-effort throughout — the login
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
  // #2223: the consume comes AFTER the roster insert. A solo invitation to a
  // round that has not started is consumed only once its game_players row
  // landed (or was already there); when the insert fails, or the users row is
  // missing, the invitation stays open and the next login tries again.
  // Invitations without a game and solo invitations to a locked round are
  // always consumed, team-scoped ones never. Anything that throws before the
  // consume leaves every invitation open.
  //
  // The pending rows are read BEFORE accepted_at flips so game_id + invited_by
  // are still available. The admin client is used because the freshly verified
  // user's public.users id is not yet reachable through the cookie client in
  // this action (auth state propagates asynchronously).
  //
  // #356: where an invitee lands. The website's `verifyCode` redirects there
  // when no explicit `next` was given; the app lands on Home either way.
  let landing: string | null = null;

  try {
    const admin = getAdminClient();
    // #1348: utløpsregelen har to hjem — `email_is_invited`-RPC-en (0100) som
    // gater sendCode, og dette oppslaget. De MÅ være enige: uten
    // `expires_at`-filteret her ble en utløpt invitasjon konsumert ved
    // innlogging (accepted_at flippet, game_players insertet, varsel fyrt),
    // selv om sendCode-laget regnet den som død. Samme figur som
    // `lib/auth/getInviteLoginContext.ts`. Kolonnen er NOT NULL, så ingen
    // null-case å bevare.
    const { data: pendingInvites, error: pendingError } = await admin
      .from('invitations')
      .select('id, game_id, invited_by')
      .filter('email', 'imatch', emailMatchPattern(email))
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .returns<{ id: string; game_id: string | null; invited_by: string }[]>();
    if (pendingError) {
      console.error('[afterLogin] pending invitations lookup failed', pendingError);
    }
    const pending = pendingInvites ?? [];

    // Kun `game_id` skiller her: `invited_by` er NOT NULL (0001), så en
    // null-sjekk på den ville aldri kunne treffe.
    const gameScoped = pending.filter((inv) => inv.game_id != null);

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
    //
    // #2223: an invitation whose game lookup fails drops out here: no insert,
    // no notification, no consume and no routing. Read as "no row" it would
    // pass as a solo invitation to an open round, and a team invitation would
    // get exactly the solo roster row this block must not write.
    const resolvedGameScoped = (
      await Promise.all(
        gameScoped.map(async (inv) => {
          const { data: gameRow, error: gameError } = await admin
            .from('games')
            .select('registration_type, short_id, status')
            .eq('id', inv.game_id!)
            .maybeSingle<{
              registration_type: string;
              short_id: string;
              status: string;
            }>();
          if (gameError) {
            console.error('[afterLogin] game lookup failed', {
              invitationId: inv.id,
              gameId: inv.game_id,
              error: gameError,
            });
            return null;
          }
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
      )
    ).filter((r) => r !== null);

    // Filled below: the invitee's users row, the locked rounds they are
    // already on (#1009), and the unlocked solo invitations whose roster row
    // landed. The consume and the routing both read them.
    let inviteeId: string | null = null;
    const onRosterGameIds = new Set<string>();
    const landedInvIds = new Set<string>();

    // The user lookup runs for ANY pending invitation, game-less ones
    // included: they give friendship too (#2212).
    if (pending.length > 0) {
      const { data: userRow, error: userError } = await admin
        .from('users')
        .select('id')
        .filter('email', 'imatch', emailMatchPattern(email))
        .maybeSingle<{ id: string }>();
      if (userError) {
        console.error('[afterLogin] users lookup failed', userError);
      }

      if (userRow?.id) {
        inviteeId = userRow.id;
        // #2212: for a locked solo invitation, check whether the invitee is
        // already on the roster (the guest-claim case, #1009). A failed read
        // counts as "not on the roster": the invitee then gets the notice
        // instead of the game, which is the safe side.
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
                  '[afterLogin] roster membership check failed',
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
                // #2209: the invitee's tee category from the profile, clamped
                // to this game's tee. joinTeeGenders never throws.
                const teeGenders = await joinTeeGenders(inv.game_id!, [userRow.id]);
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
                    tee_gender: teeGenders[userRow.id],
                  });

                const duplicate =
                  insertError != null &&
                  (insertError.code === '23505' ||
                    String(insertError.message ?? '')
                      .toLowerCase()
                      .includes('duplicate'));

                if (insertError && !duplicate) {
                  console.error(
                    '[afterLogin] game_players insert failed',
                    insertError,
                  );
                  return;
                }
                landedInvIds.add(inv.id);
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
      }
    }

    // Consume (flip accepted_at). Team-scoped invitations stay pending so the
    // attach flow on /signup/[shortId]/team can detect them. Game-less
    // invitations (no game_id) are always consumed — they are friend/club rows
    // with no downstream attach dependency. #2212: invitations to a locked
    // round are consumed too, so they leave the admin waiting list. #2223: a
    // solo invitation to an open round only once its roster row landed.
    const resolvedByInvId = new Map(resolvedGameScoped.map((r) => [r.inv.id, r]));
    const inviteIdsToConsume = pending
      .filter((inv) => {
        if (inv.game_id == null) return true;
        const resolved = resolvedByInvId.get(inv.id);
        if (!resolved || resolved.isTeamScoped) return false;
        return resolved.isLocked || landedInvIds.has(inv.id);
      })
      .map((inv) => inv.id);

    if (inviteIdsToConsume.length > 0) {
      const { data: consumed, error: consumeError } = await supabase
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .in('id', inviteIdsToConsume)
        .select('id');
      if (consumeError) {
        console.error('[afterLogin] invitation consume failed', {
          invitationIds: inviteIdsToConsume,
          error: consumeError,
        });
      } else if ((consumed ?? []).length !== inviteIdsToConsume.length) {
        console.error('[afterLogin] invitation consume matched fewer rows', {
          invitationIds: inviteIdsToConsume,
          consumed: (consumed ?? []).length,
        });
      }
    }

    if (inviteeId) {
      // #481, #2212: an invitee who joins becomes friends with whoever
      // invited them, so the friend graph grows through invitations and not
      // only through manual requests. This covers every invitation: game
      // invitations (started rounds and team games included, since the
      // friendship hangs on the invitation, not on a game_players row) and
      // the game-less ones from «Legg til venn på e-post» and the admin
      // door. The RPC is idempotent and gated on an accepted invitation, so
      // it runs after the consume and is safe to fire per inviter; for an
      // invitation still pending (a team invitation, or #2223 a solo one
      // whose insert failed) it answers no_invitation until that invitation
      // is accepted. Best-effort: fails quietly, never blocks the login.
      const inviterIds = distinctInviterIds(pending, inviteeId);
      await Promise.allSettled(
        inviterIds.map(async (inviterId) => {
          const { error } = await supabase.rpc('befriend_inviter', {
            p_inviter: inviterId,
          });
          if (error) {
            console.error('[afterLogin] befriend_inviter failed', error);
          }
        }),
      );

      // #356 / #676 / #2212: route an invitee directly to their game.
      // - joinable = solo invitations to a round that has not started whose
      //   roster row landed (#2223), or to a locked round the invitee is
      //   already on (guest claim, #1009).
      // - Exactly one joinable, no team-scoped: → /games/[id]
      // - Exactly one team-scoped game ('team' or 'both'), no joinable: →
      //   /signup/[shortId]/team so the attach flow finds the still-pending
      //   invitation and shows "Bli med på lag".
      // - No joinable, no team-scoped, and at least one solo invitation to a
      //   started or finished round: → /complete-profile with a notice that
      //   the round had already started.
      // - Anything else (mixed or multiple): fall back to `next` (ambiguous).
      // The website skips all of these when an explicit `next` is set.
      const soloInvites = resolvedGameScoped.filter((r) => !r.isTeamScoped);
      const joinable = soloInvites.filter((r) =>
        r.isLocked ? onRosterGameIds.has(r.inv.game_id!) : landedInvIds.has(r.inv.id),
      );
      const lockedOut = soloInvites.filter(
        (r) => r.isLocked && !onRosterGameIds.has(r.inv.game_id!),
      );
      const teamScopedInvites = resolvedGameScoped.filter(
        (r) => r.isTeamScoped && r.shortId != null,
      );
      if (joinable.length === 1 && teamScopedInvites.length === 0) {
        landing = `/games/${joinable[0].inv.game_id}`;
      } else if (
        teamScopedInvites.length === 1 &&
        joinable.length === 0
      ) {
        landing = `/signup/${teamScopedInvites[0].shortId}/team`;
      } else if (
        joinable.length === 0 &&
        teamScopedInvites.length === 0 &&
        lockedOut.length > 0
      ) {
        landing = '/complete-profile?invite_notice=game_started';
      }
    }
  } catch (err) {
    console.warn('[afterLogin] invitation-accept side-effect threw', err);
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
      console.error('[afterLogin] accept_club_invitations failed', clubErr);
    }
  } catch (err) {
    console.warn('[afterLogin] club-invite-accept side-effect threw', err);
  }

  return { landing };
}

/**
 * #1009: en gjest som logger inn har bevist eierskap til den claimede
 * adressen (OTP-koden — plassholder-domenet uten MX kan aldri motta en).
 * Nulles via service-role: guard_users_self_update (0127) sperrer selv-
 * endring av is_guest for request-klienten. `.eq('is_guest', true)` gjør
 * dette til en no-op 0-raders update for alle vanlige innlogginger.
 * Best-effort — må aldri blokkere login.
 */
async function clearGuestFlag(userId: string): Promise<void> {
  try {
    const { error: guestClearError } = await getAdminClient()
      .from('users')
      .update({ is_guest: false })
      .eq('id', userId)
      .eq('is_guest', true);
    if (guestClearError) {
      console.error('[afterLogin] guest-clear failed', guestClearError);
    }
  } catch (err) {
    console.error('[afterLogin] guest-clear threw', err);
  }
}
