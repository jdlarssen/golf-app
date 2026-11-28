import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { getPrivateUserFields } from '@/lib/users/privateUserFields';
import { sendContentReportNotification } from '@/lib/mail/contentReportNotification';
import { firstName } from '@/lib/firstName';
import { playerName } from '@/lib/names/playerName';
import type { ReportInput } from './reportInput';

/**
 * #3019: a player's report reaches the admins. The row is written as the
 * player (RLS «content_reports insert own», 0259), so the reporter can never
 * be forged; the mail goes out after the answer (`defer`), best-effort.
 */

/** A day's reports per player. Room for a bad evening, not for a flood. */
export const MAX_REPORTS_PER_DAY = 10;

export type SubmitReportError = 'invalid' | 'rate_limited' | 'db_error';

/** Runs a task after the answer is on its way (`after` from `next/server`). */
export type Defer = (task: () => Promise<void>) => void;

export async function submitReportCore(
  caller: SupabaseClient<Database>,
  reporterId: string,
  input: ReportInput,
  defer: Defer,
): Promise<{ ok: true } | { ok: false; error: SubmitReportError }> {
  if (input.targetUserId === reporterId) return { ok: false, error: 'invalid' };

  // A round named by its link id: the service role finds its uuid. An unknown
  // link answers like any other target that no longer exists.
  let targetGameId = input.targetGameId;
  if (input.targetGameShortId) {
    const { data: game, error: gameError } = await getAdminClient()
      .from('games')
      .select('id')
      .eq('short_id', input.targetGameShortId)
      .maybeSingle();
    if (gameError) {
      console.error('[reports] short id lookup failed', gameError);
      return { ok: false, error: 'db_error' };
    }
    if (!game) return { ok: false, error: 'invalid' };
    targetGameId = game.id;
  }
  const target: ReportInput = { ...input, targetGameId, targetGameShortId: null };

  // The reporter cannot read reports back, so the count is the service role's.
  // A failed count lets the report through: a report that never lands is
  // worse than one extra.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await getAdminClient()
    .from('content_reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', reporterId)
    .gte('created_at', since);
  if (countError) {
    console.error('[reports] daily count failed', countError);
  } else if ((count ?? 0) >= MAX_REPORTS_PER_DAY) {
    return { ok: false, error: 'rate_limited' };
  }

  // No `.select()`: the reporter has no read policy. An insert RLS refuses
  // raises 42501, so a missing row is never a silent success here.
  const { error } = await caller.from('content_reports').insert({
    reporter_id: reporterId,
    target_user_id: input.targetUserId,
    target_game_id: target.targetGameId,
    reason: input.reason,
    note: input.note,
  });
  if (error) {
    // 23503: the player or round no longer exists. 23514: a CHECK refused it.
    if (error.code === '23503' || error.code === '23514') return { ok: false, error: 'invalid' };
    console.error('[reports] insert failed', error);
    return { ok: false, error: 'db_error' };
  }

  defer(() => notifyAdmins(reporterId, target));
  return { ok: true };
}

async function notifyAdmins(reporterId: string, input: ReportInput): Promise<void> {
  try {
    const admin = getAdminClient();
    const [reporterRes, targetName, adminsRes] = await Promise.all([
      admin.from('users').select('name, nickname').eq('id', reporterId).maybeSingle(),
      readTargetName(input),
      admin.from('users').select('id, name, locale').eq('is_admin', true).is('deleted_at', null),
    ]);
    if (adminsRes.error) throw new Error(adminsRes.error.message);
    const adminRows = adminsRes.data ?? [];
    const emails = await getPrivateUserFields(adminRows.map((a) => a.id));
    const reporterName = playerName(reporterRes.data) ?? 'En spiller';

    const results = await Promise.allSettled(
      adminRows.flatMap((a) => {
        const email = emails.get(a.id)?.email;
        if (!email) return [];
        return [
          sendContentReportNotification({
            to: email,
            adminFirstName: firstName(a.name),
            reporterName,
            kind: input.targetUserId ? 'user' : 'game',
            target: targetName,
            reason: input.reason,
            note: input.note,
            locale: a.locale,
          }),
        ];
      }),
    );
    const failed = results.filter((r) => r.status === 'rejected');
    for (const r of failed) console.error('[reports] admin mail failed', (r as PromiseRejectedResult).reason);
    console.info('[reports] admin mail handed to Resend', {
      sent: results.length - failed.length,
      failed: failed.length,
    });
  } catch (err) {
    console.error('[reports] admin mail skipped', err);
  }
}

async function readTargetName(input: ReportInput): Promise<string> {
  const admin = getAdminClient();
  if (input.targetUserId) {
    const { data } = await admin
      .from('users')
      .select('name, nickname')
      .eq('id', input.targetUserId)
      .maybeSingle();
    return playerName(data) ?? '?';
  }
  const { data } = await admin.from('games').select('name').eq('id', input.targetGameId!).maybeSingle();
  return data?.name ?? '?';
}
