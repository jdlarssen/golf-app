'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { sendMissingScoreReminders } from '@/lib/games/remindMissingScore';

/**
 * «Påminn» on a skipped-hole row in the organiser's desk (#2268, the owner's
 * choice B). The rule (who, which holes, the send, the row count) lives in
 * `lib/games/remindMissingScore.ts`; this action is the gate (`requireAdmin`,
 * as the desk page itself) and the redirect, nothing else.
 *
 * It lands back on the desk, not on the status page: the Live tab opens and the
 * banner says the reminder went out. A row that is gone by the time the button
 * is pressed (the hole got a score, the card was delivered) gets its own error.
 */
export async function remindMissingScore(gameId: string, userIds: string[]) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const detailPath = `/admin/games/${gameId}`;
  const result = await sendMissingScoreReminders(gameId, userIds);

  if (!result.ok) {
    const error = result.reason === 'no_gap' ? 'hole_reminder_stale' : 'hole_reminder_not_active';
    redirect({ href: `${detailPath}?error=${error}`, locale });
  }

  revalidatePath(detailPath);
  redirect({ href: `${detailPath}?status=hole_reminded&count=${result.reminded}`, locale });
}
