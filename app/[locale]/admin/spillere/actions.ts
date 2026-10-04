'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin/auth';
import { sendInviteNotification } from '@/lib/mail/inviteNotification';
import {
  gameInviteExpiresAtFromNow,
  inviteExpiresAtFromNow,
} from '@/lib/auth/inviteExpiry';
import { isRosterLocked } from '@/lib/games/status';
import {
  extendAndMailInvitation,
  inviteMailSenderName,
} from '@/lib/games/extendAndMailInvitation';
import {
  consumeAdminInviteRateLimit,
  getClientIp,
} from '@/lib/admin/rateLimit';

/**
 * Self-gate + load `{ supabase, profile }` for the spillere-actions. Wraps
 * the shared `requireAdmin` helper so each action below can keep its
 * existing destructure-pattern (`{ supabase, profile }`) while routing
 * through the Fase-4-shared gate (#223 chunk 2 will lift the layout-gate).
 *
 * `profile.id` here matches `role.userId` and is used as the FK target for
 * invitations.invited_by and the rate-limit bucket key. `profile.name` is
 * inlined into the invite-notification mail so the recipient sees who from
 * Tørny actually invited them.
 */
async function loadAdminContext() {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);
  return {
    supabase,
    profile: { id: role.userId, name: role.name },
  };
}

export async function sendInvitation(formData: FormData) {
  const locale = await getLocale();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  // Honeypot — the `website` field is hidden in the form so a real admin
  // never types into it. A bot that POSTs to this server-action (somehow
  // bypassing the auth-gate, e.g. via a leaked session) will likely fill
  // every input. We pretend the invitation was sent without writing to
  // `invitations` or calling Resend. Logged to Vercel for awareness.
  const honeypot = String(formData.get('website') ?? '').trim();
  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'invite' });
    const qs = new URLSearchParams({ status: 'sent', email });
    redirect({ href: `/admin/spillere?${qs.toString()}`, locale });
  }

  if (!email) redirect({ href: '/admin/spillere?error=email_required', locale });

  const { supabase, profile } = await loadAdminContext();
  const invitedByName = profile.name?.trim() || 'Admin';

  const ip = await getClientIp();
  const allowed = await consumeAdminInviteRateLimit({
    adminId: profile.id,
    ip,
  });
  if (!allowed) {
    const qs = new URLSearchParams({ error: 'rate_limited', email });
    redirect({ href: `/admin/spillere?${qs.toString()}`, locale });
  }

  // Shared cross-door dedup (#348): email_is_invited is the SECURITY DEFINER
  // RPC the friend door (app/invite/actions.ts) and the login flow also use,
  // so all three agree on what "already invited" means (open = not-accepted
  // AND not-expired). Stops a second invite-mail when a friend-invite already
  // exists, without needing a UNIQUE constraint on invitations.email. An
  // expired invitation no longer blocks a fresh one — admin uses «Send på
  // nytt» to revive a still-valid pending invitation.
  const { data: alreadyInvited } = await supabase.rpc('email_is_invited', {
    check_email: email,
  });
  if (alreadyInvited) {
    const qs = new URLSearchParams({ error: 'already_invited', email });
    redirect({ href: `/admin/spillere?${qs.toString()}`, locale });
  }

  const expiresAt = inviteExpiresAtFromNow();
  const inviteToken = randomUUID();
  const { error: insertError } = await supabase.from('invitations').insert({
    email,
    token: inviteToken,
    invited_by: profile.id,
    expires_at: expiresAt,
  });
  if (insertError) {
    console.error('[admin/spillere] sendInvitation insert failed', insertError);
    redirect({ href: '/admin/spillere?error=log_failed', locale });
  }

  try {
    await sendInviteNotification({ to: email, invitedByName, inviteToken, expiresAt });
  } catch (err) {
    console.error('[admin/spillere] notification mail failed', err);
    const qs = new URLSearchParams({ error: 'mail_failed', email });
    redirect({ href: `/admin/spillere?${qs.toString()}`, locale });
  }

  const qs = new URLSearchParams({ status: 'sent', email });
  redirect({ href: `/admin/spillere?${qs.toString()}`, locale });
}

export async function resendInvitation(formData: FormData) {
  const locale = await getLocale();
  const id = String(formData.get('id') ?? '');
  if (!id) redirect({ href: '/admin/spillere?error=unknown', locale });

  const { supabase, profile } = await loadAdminContext();
  const invitedByName = profile.name?.trim() || 'Admin';

  const ip = await getClientIp();
  const allowed = await consumeAdminInviteRateLimit({
    adminId: profile.id,
    ip,
  });
  if (!allowed) {
    redirect({ href: '/admin/spillere?error=rate_limited', locale });
  }

  const { data: inv, error } = await supabase
    .from('invitations')
    .select('email, accepted_at, token, game_id, invited_by')
    .eq('id', id)
    .single();
  // Best-effort by design (#1445): begge ben lander ærlig på resend_failed —
  // «vi klarte ikke sende på nytt» er sant enten raden mangler eller
  // oppslaget feilet, og admin-en har samme neste steg (prøv igjen).
  // Feilen logges så en gjentakende DB-feil er synlig i Vercel-loggen.
  if (error || !inv) {
    if (error) {
      console.error('[resendInvitation] invitation lookup failed', error);
    }
    redirect({ href: '/admin/spillere?error=resend_failed', locale });
  }
  if (inv.accepted_at) redirect({ href: '/admin/spillere?error=resend_failed', locale });

  // #2212: a game invitation keeps the game's terms: the game deadline
  // (GAME_INVITE_TTL_DAYS), the game mail, and the organiser who sent it as
  // the sender. A round that has started is refused before anything is
  // written, since logging in no longer gives a roster spot there — the same
  // rule as the game invite door (`game_locked`). That includes a guest-claim
  // invitation to a finished round (#1009); the organiser resends those from
  // the claim form on /games/<id>/spillere. Captain (team) invitations get
  // the game mail as well: the login routes them to the team page anyway.
  let senderName = invitedByName;
  let gameMail: { gameName: string; gameMode: string } | null = null;
  if (inv.game_id) {
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('name, game_mode, status')
      .eq('id', inv.game_id)
      .maybeSingle();
    if (gameError) {
      console.error('[resendInvitation] game lookup failed', gameError);
      redirect({ href: '/admin/spillere?error=resend_failed', locale });
    }
    if (!game || isRosterLocked(game.status)) {
      redirect({ href: '/admin/spillere?error=resend_game_locked', locale });
    }
    // #2445 (orchestrator's decision 03.10): a draft holds its e-mail
    // invitations. Nothing is extended and nothing is mailed here:
    // sendHeldGameInvites gives the invitation a new deadline and mails it
    // when the game is published, also when it has expired meanwhile.
    if (game.status === 'draft') {
      const qs = new URLSearchParams({ status: 'resend_held', email: inv.email });
      redirect({ href: `/admin/spillere?${qs.toString()}`, locale });
    }

    const { data: inviter, error: inviterError } = await supabase
      .from('users')
      .select('name, is_admin')
      .eq('id', inv.invited_by)
      .maybeSingle();
    if (inviterError) {
      // Best-effort: the fallback sender name is honest enough for a mail.
      console.error('[resendInvitation] inviter lookup failed', inviterError);
    }
    // One home for the sender name (#2445): the same as the e-mail core and
    // the held invitations a publish sends.
    senderName = inviteMailSenderName(inviter?.name ?? null, inviter?.is_admin === true);
    gameMail = { gameName: game.name, gameMode: game.game_mode };
  }

  // «Send på nytt» means «give this person a fresh chance» (#1381), so the
  // deadline is pushed out a full TTL instead of staying at the old one, and
  // before the mail (extendAndMailInvitation, the one home for this, #2445).
  // An expired-but-unaccepted row otherwise got a mail the login gate would
  // still refuse — email_is_invited requires expires_at > now() (migration
  // 0100). The admin's own client writes, as before.
  const expiresAt = gameMail
    ? gameInviteExpiresAtFromNow()
    : inviteExpiresAtFromNow();
  const outcome = await extendAndMailInvitation({
    client: supabase,
    invitationId: id,
    expiresAt,
    mail: {
      to: inv.email,
      invitedByName: senderName,
      inviteToken: inv.token,
      ...gameMail,
    },
    label: 'resendInvitation.extendExpiry',
  });
  if (outcome === 'extend_failed') {
    redirect({ href: '/admin/spillere?error=resend_failed', locale });
  }
  if (outcome === 'mail_failed') {
    const qs = new URLSearchParams({ error: 'mail_failed', email: inv.email });
    redirect({ href: `/admin/spillere?${qs.toString()}`, locale });
  }

  const qs = new URLSearchParams({ status: 'resent', email: inv.email });
  redirect({ href: `/admin/spillere?${qs.toString()}`, locale });
}

export async function withdrawInvitation(formData: FormData) {
  const locale = await getLocale();
  const id = String(formData.get('id') ?? '');
  if (!id) redirect({ href: '/admin/spillere?error=unknown', locale });

  const { supabase } = await loadAdminContext();

  const { data: inv, error: fetchError } = await supabase
    .from('invitations')
    .select('email, accepted_at')
    .eq('id', id)
    .single();
  // Best-effort by design (#1445): som resendInvitation — withdraw_failed er
  // ærlig for begge ben, men feilen skal være synlig i loggen.
  if (fetchError || !inv) {
    if (fetchError) {
      console.error('[withdrawInvitation] invitation lookup failed', fetchError);
    }
    redirect({ href: '/admin/spillere?error=withdraw_failed', locale });
  }
  if (inv.accepted_at) redirect({ href: '/admin/spillere?error=withdraw_failed', locale });

  // Delete the invitations row via the cookie client (RLS lets admin do it).
  const { error: delError } = await supabase
    .from('invitations')
    .delete()
    .eq('id', id);
  if (delError) {
    console.error('[admin/spillere] invitation delete failed', delError);
    redirect({ href: '/admin/spillere?error=withdraw_failed', locale });
  }

  // If the invitee had requested a code (auth.users row exists) but never
  // completed their profile (public.users.profile_completed_at IS NULL —
  // the row itself is now auto-created via trigger in migration 0014, so
  // its absence is no longer the right signal), clean up the auth.users
  // row via service-role so the email becomes free again. Cascade from
  // auth.users → public.users handles the placeholder row.
  try {
    const admin = getAdminClient();
    const { data: authList } = await admin.auth.admin.listUsers();
    const orphan = authList?.users?.find(
      (u) => u.email?.toLowerCase() === inv.email.toLowerCase(),
    );
    if (orphan) {
      const { data: publicRow } = await admin
        .from('users')
        .select('profile_completed_at')
        .eq('id', orphan.id)
        .maybeSingle();
      const profileIncomplete =
        !publicRow || publicRow.profile_completed_at == null;
      if (profileIncomplete) {
        // auth-js returns its error instead of throwing it; the catch below
        // only sees throws (#2223).
        const { error: deleteError } = await admin.auth.admin.deleteUser(orphan.id);
        if (deleteError) {
          console.error('[admin/spillere] auth orphan cleanup failed', {
            userId: orphan.id,
            error: deleteError,
          });
        }
      }
    }
  } catch (err) {
    // Non-fatal — the invitations row has already been deleted. Log and let
    // the user see a success banner since the primary action succeeded.
    console.error('[admin/spillere] auth orphan cleanup failed', err);
  }

  const qs = new URLSearchParams({ status: 'withdrawn', email: inv.email });
  redirect({ href: `/admin/spillere?${qs.toString()}`, locale });
}
