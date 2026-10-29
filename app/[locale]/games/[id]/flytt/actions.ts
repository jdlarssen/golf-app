'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { isTeeOffInPast } from '@/lib/games/gamePayload';
import { movedTeeOffIso } from '@/lib/games/moveGameChoices';
import { expectOne, NoRowsAffectedError } from '@/lib/supabase/affectedRows';
import { notifyGameMoved } from '@/lib/notifications/notifyGameMoved';

/**
 * «Flytt og si fra» (#2480): writes the new tee-off and, with «Si fra til
 * gjengen» on, tells the roster (`notifyGameMoved`, best-effort).
 *
 * `requireAdminOrCreator` is the gate, the same as the page's. The write uses
 * the caller's client, so RLS decides as it does for «Rediger». Only
 * `scheduled_tee_off_at` changes, and only while the game is still scheduled:
 * a round that started while the page was open matches no row, writes
 * nothing and lands on «kan ikke redigeres» (trap 2: 0 rows is a refusal, not
 * a success). The same time as before writes nothing and tells nobody.
 */
export async function moveGameAction(gameId: string, formData: FormData) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  const movePath = `/games/${gameId}/flytt`;
  const detailBase = ctx.isAdmin ? `/admin/games/${gameId}` : `/games/${gameId}`;

  const teeOffAt = movedTeeOffIso(
    String(formData.get('day') ?? '').trim(),
    String(formData.get('time') ?? '').trim(),
  );
  if (!teeOffAt) redirect({ href: `${movePath}?error=invalid`, locale });
  // The shared guard of create and edit (#902), so the three agree.
  if (isTeeOffInPast(teeOffAt)) redirect({ href: `${movePath}?error=in_past`, locale });

  const { data: current, error: readError } = await supabase
    .from('games')
    .select('status, scheduled_tee_off_at')
    .eq('id', gameId)
    .maybeSingle<{ status: string; scheduled_tee_off_at: string | null }>();
  if (readError) throw readError;
  if (!current || current.status !== 'scheduled') {
    redirect({ href: `${detailBase}?error=not_editable`, locale });
  }
  if (current.scheduled_tee_off_at && Date.parse(current.scheduled_tee_off_at) === Date.parse(teeOffAt)) {
    redirect({ href: detailBase, locale });
  }

  try {
    expectOne(
      await supabase
        .from('games')
        .update({ scheduled_tee_off_at: teeOffAt })
        .eq('id', gameId)
        .eq('status', 'scheduled')
        .select('id'),
      'moveGameAction',
    );
  } catch (err) {
    if (err instanceof NoRowsAffectedError) {
      redirect({ href: `${detailBase}?error=not_editable`, locale });
    }
    throw err;
  }
  expireGameCache(gameId);

  let told = false;
  if (formData.get('notify') === '1') {
    const { notified } = await notifyGameMoved({
      gameId,
      actorUserId: ctx.userId,
      teeOffAt,
      courseChanged: false,
    });
    told = notified.length > 0;
  }

  redirect({ href: `${detailBase}?status=${told ? 'moved_told' : 'moved'}`, locale });
}
