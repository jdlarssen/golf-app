'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { expectOne } from '@/lib/supabase/affectedRows';
import { logAdminEvent } from '@/lib/admin/auditLog';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { textGuardError } from '@/lib/moderation/textGuardError';
import { GAME_NAME_MAX } from '@/lib/moderation/textLimits';
import type { Json } from '@/lib/database.types';

/**
 * #3019: what an admin does with a report. Every action writes as the admin
 * (RLS «games admin update», «content_reports admin update»), asserts the row
 * it changed (trap 2), logs to the audit log, and goes back to the list with
 * a notice or an error code the page knows.
 *
 * A round's name and prizes can change in every status: a finished round's
 * name still shows in the terminliste, on /signup and in the archive.
 */

export type ReportActionError = 'invalid' | 'not_found' | 'blocked_word' | 'text_too_long' | 'db';
export type ReportActionNotice = 'renamed' | 'prizes_cleared' | 'handled';

/** The neutral text a cleared prize keeps, so the prize table keeps its rows. */
const CLEARED_PRIZE_TEXT = 'Premie';

async function back(result: { notice: ReportActionNotice } | { error: ReportActionError }) {
  const locale = await getLocale();
  revalidatePath('/admin/rapporter');
  const query = 'notice' in result ? `notice=${result.notice}` : `error=${result.error}`;
  // Outside every try/catch: redirect() throws NEXT_REDIRECT.
  redirect({ href: `/admin/rapporter?${query}`, locale });
}

export async function renameReportedGame(formData: FormData) {
  const supabase = await getServerClient();
  const admin = await requireAdmin(supabase);

  const reportId = String(formData.get('reportId') ?? '');
  const gameId = String(formData.get('gameId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!reportId || !gameId || !name) return back({ error: 'invalid' });
  if (name.length > GAME_NAME_MAX) return back({ error: 'text_too_long' });

  let result: { notice: ReportActionNotice } | { error: ReportActionError };
  try {
    const { data: before } = await supabase.from('games').select('name').eq('id', gameId).maybeSingle();
    expectOne(
      await supabase.from('games').update({ name }).eq('id', gameId).select('id'),
      'renameReportedGame',
    );
    expireGameCache(gameId);
    await logAdminEvent({
      actorId: admin.userId,
      actorName: admin.name ?? 'Admin',
      eventType: 'report.game_renamed',
      targetType: 'game',
      targetId: gameId,
      payload: { reportId, from: before?.name ?? null, to: name },
    });
    result = { notice: 'renamed' };
  } catch (err) {
    const guard = textGuardError(err);
    if (!guard) console.error('[admin/rapporter] rename failed', err);
    result = { error: guard ?? 'db' };
  }
  return back(result);
}

export async function clearReportedPrizes(formData: FormData) {
  const supabase = await getServerClient();
  const admin = await requireAdmin(supabase);

  const reportId = String(formData.get('reportId') ?? '');
  const gameId = String(formData.get('gameId') ?? '');
  if (!reportId || !gameId) return back({ error: 'invalid' });

  let result: { notice: ReportActionNotice } | { error: ReportActionError };
  try {
    const { data: game, error } = await supabase
      .from('games')
      .select('prizes')
      .eq('id', gameId)
      .maybeSingle();
    if (error) throw new Error(`clearReportedPrizes read: ${error.message}`);
    if (!game) {
      result = { error: 'not_found' };
    } else {
      // Every prize keeps its place, category and position; the words and the
      // sponsor (name and logo) go.
      const prizes = (Array.isArray(game.prizes) ? game.prizes : []).map((p) => ({
        ...(p as Record<string, Json>),
        description: CLEARED_PRIZE_TEXT,
        sponsor: null,
        sponsorLogoPath: null,
      }));
      expectOne(
        await supabase.from('games').update({ prizes }).eq('id', gameId).select('id'),
        'clearReportedPrizes',
      );
      expireGameCache(gameId);
      await logAdminEvent({
        actorId: admin.userId,
        actorName: admin.name ?? 'Admin',
        eventType: 'report.prizes_cleared',
        targetType: 'game',
        targetId: gameId,
        payload: { reportId, prizes: game.prizes },
      });
      result = { notice: 'prizes_cleared' };
    }
  } catch (err) {
    console.error('[admin/rapporter] clear prizes failed', err);
    result = { error: 'db' };
  }
  return back(result);
}

export async function markReportHandled(formData: FormData) {
  const supabase = await getServerClient();
  const admin = await requireAdmin(supabase);

  const reportId = String(formData.get('reportId') ?? '');
  if (!reportId) return back({ error: 'invalid' });

  let result: { notice: ReportActionNotice } | { error: ReportActionError };
  try {
    // `handled_at is null`: a second click finds no row and says so.
    const res = await supabase
      .from('content_reports')
      .update({ handled_at: new Date().toISOString(), handled_by: admin.userId })
      .eq('id', reportId)
      .is('handled_at', null)
      .select('id');
    if (!res.error && (res.data ?? []).length === 0) {
      result = { error: 'not_found' };
    } else {
      expectOne(res, 'markReportHandled');
      await logAdminEvent({
        actorId: admin.userId,
        actorName: admin.name ?? 'Admin',
        eventType: 'report.handled',
        targetType: 'content_report',
        targetId: reportId,
      });
      result = { notice: 'handled' };
    }
  } catch (err) {
    console.error('[admin/rapporter] mark handled failed', err);
    result = { error: 'db' };
  }
  return back(result);
}
