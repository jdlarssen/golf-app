'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import { displayNameForOthers } from '@/lib/users/displayName';
import { expectAffected } from '@/lib/supabase/affectedRows';
import type { Enums } from '@/lib/database.types';
import { joinRequestWaitUntil } from '@/lib/clubs/joinRequestCooldown';

/**
 * Sjekk om PG-error er UNIQUE-violation (23505) eller inneholder "duplicate"
 * i meldingen. Speiler signup/[shortId]/actions.ts-mønsteret.
 */
function isDuplicateError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  return String(err.message ?? '')
    .toLowerCase()
    .includes('duplicate');
}

/**
 * Slå opp displayName for notify-payload: navn, ellers maskert e-post (#2271),
 * med kallenavn i «». Best-effort: returnerer null hvis raden mangler, og
 * innbokskortet viser da reserven på leserens språk.
 */
async function getRequesterName(userId: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from('users')
    .select('name, nickname, email')
    .eq('id', userId)
    .maybeSingle<{
      name: string | null;
      nickname: string | null;
      email: string;
    }>();
  // null → the inbox card shows the fallback in the reader's language.
  if (!data) return null;
  return displayNameForOthers(data) ?? null;
}

/**
 * The old request row behind a duplicate insert: still pending (nothing to
 * do), closed less than 7 days ago (the owner's «Etter 7 dager»: nothing is
 * stored, nobody is notified, the page shows when the person may ask again),
 * or closed longer ago and now reopened as a fresh pending request.
 * `decided_at` marks the close: the rejection, or the leave/removal stamp
 * (`stampMembershipClosed`).
 *
 * Runs on the service role: RLS lets the requester only withdraw their own
 * pending row, and the guard trigger (0107) keeps the decision columns for
 * the admin path. The caller is the signed-in requester (checked in the
 * action) and is not a member (checked before the insert). The status filter
 * makes the reopen match only the row that was read, and the affected rows
 * are asserted (trap 2).
 */
async function reopenOldRequest(
  groupId: string,
  userId: string,
): Promise<'already_pending' | 'wait' | 'reopened' | 'failed'> {
  const admin = getAdminClient();
  const { data: old, error: readError } = await admin
    .from('group_join_requests')
    .select('id, status, decided_at')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle<{
      id: string;
      status: Enums<'registration_request_status'>;
      decided_at: string | null;
    }>();
  if (readError || !old) {
    console.error('[requestToJoin] old request read failed', readError ?? 'no row');
    return 'failed';
  }
  if (old.status === 'pending') return 'already_pending';
  if (joinRequestWaitUntil(old.decided_at)) return 'wait';
  try {
    expectAffected(
      await admin
        .from('group_join_requests')
        .update({
          status: 'pending',
          message: null,
          decided_at: null,
          decided_by_user_id: null,
          created_at: new Date().toISOString(),
        })
        .eq('id', old.id)
        .eq('status', old.status)
        .select('id'),
      'requestToJoin.reopen',
    );
  } catch (err) {
    console.error('[requestToJoin] reopen failed', err);
    return 'failed';
  }
  return 'reopened';
}

/**
 * requestToJoin — server action for «Be om å bli med»-skjemaet på
 * /klubber/bli-med/[shortId].
 *
 * Flyt:
 *   1. Auth: henter session via request-scoped client.
 *   2. Resolv gruppe via admin-client (short_id → group row).
 *   3. Sjekk at brukeren ikke allerede er medlem → redirect til /klubber/[id].
 *   4. INSERT group_join_requests (status=pending) via request-scoped client
 *      (RLS-policy «group_join_requests self insert pending» tillater dette).
 *      UNIQUE-conflict → vennlig «allerede sendt»-redirect.
 *   5. Best-effort notify til alle owner/admin i klubben.
 *   6. Redirect til /klubber/bli-med/[shortId]?sent=1.
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export async function requestToJoin(formData: FormData) {
  const shortId = String(formData.get('shortId') ?? '').trim();

  const locale = await getLocale();

  if (!shortId) redirect({ href: '/klubber', locale });

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: `/login?next=/klubber/bli-med/${shortId}`, locale });
  }

  const admin = getAdminClient();

  // Resolve group by short_id — use admin client since non-member can't read groups via RLS.
  const { data: group } = await admin
    .from('groups')
    .select('id, name')
    .eq('short_id', shortId)
    .maybeSingle<{ id: string; name: string }>();

  if (!group) redirect({ href: '/klubber', locale });

  // Check if already a member — redirect to club page.
  const { data: existingMembership, error: membershipError } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .maybeSingle();
  // A failed read must not count as «not a member»: the reopen below relies
  // on this check.
  if (membershipError) {
    console.error('[requestToJoin] membership read failed', membershipError);
    redirect({ href: `/klubber/bli-med/${shortId}?error=unknown`, locale });
  }

  if (existingMembership) {
    redirect({ href: `/klubber/${group.id}`, locale });
  }

  // INSERT via request-scoped client so RLS self-insert policy applies.
  const { error: insertError } = await supabase
    .from('group_join_requests')
    .insert({
      group_id: group.id,
      user_id: user.id,
      status: 'pending',
    });

  if (insertError) {
    if (!isDuplicateError(insertError)) {
      console.error('[requestToJoin] insert failed', insertError);
      redirect({ href: `/klubber/bli-med/${shortId}?error=unknown`, locale });
    }
    // One row per (club, user) across every status (UNIQUE in 0075). A
    // pending row means the request is already out. A rejected or withdrawn
    // one (left or removed) is reopened once 7 days have passed, so a new
    // request is stored and the admins hear about it (audit 2026-11-20: it
    // used to say «sent» and store nothing).
    const outcome = await reopenOldRequest(group.id, user.id);
    if (outcome === 'already_pending') {
      redirect({ href: `/klubber/bli-med/${shortId}?sent=1`, locale });
    }
    if (outcome === 'wait') {
      // The page reads the same row and says from when.
      redirect({ href: `/klubber/bli-med/${shortId}`, locale });
    }
    if (outcome === 'failed') {
      redirect({ href: `/klubber/bli-med/${shortId}?error=unknown`, locale });
    }
  }

  // Best-effort notify all owners/admins of the club.
  const { data: adminMembers } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', group.id)
    .in('role', ['owner', 'admin']);

  if (adminMembers && adminMembers.length > 0) {
    const requesterName = await getRequesterName(user.id);

    await Promise.allSettled(
      adminMembers.map((m) =>
        notify({
          userId: m.user_id,
          kind: 'club_join_request',
          payload: {
            group_id: group.id,
            group_name: group.name,
            requester_name: requesterName,
          },
        }).catch((err) => console.error('[requestToJoin] notify failed', err)),
      ),
    );
  }

  redirect({ href: `/klubber/bli-med/${shortId}?sent=1`, locale });
}
