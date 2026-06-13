import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  sendProductUpdateDigest,
  type ProductUpdateDigestEntry,
} from '@/lib/mail/productUpdateDigest';
import { signUnsubToken } from './unsubscribeToken';
import { formatMonthLongNb } from '@/lib/format/date';
import { firstName } from '@/lib/firstName';

/**
 * Monthly product-update digest sender (issue #202).
 *
 * Used by both:
 *   - /api/cron/product-update-digest (cron-triggered, sent_by = null)
 *   - /admin/lanseringer "Send månedsbrev nå"-action (sent_by = admin userId)
 *
 * Workflow:
 *  1. Compute period = previous calendar month (Europe/Oslo).
 *  2. Idempotency check via product_update_digests UNIQUE (period_start, period_end).
 *  3. Query product_updates published in the period — skip send if empty.
 *  4. Query opted-in users (product_updates_unsubscribed_at IS NULL + email NOT NULL).
 *  5. Send via Promise.allSettled best-effort per recipient.
 *  6. Insert product_update_digests audit row with recipient_count + update_ids.
 */

export type SendDigestOptions = {
  /** Admin user-id when triggered manually; null for cron. */
  sentByUserId: string | null;
  /** Override "now" for testing the date-window. */
  nowMs?: number;
};

export type SendDigestResult =
  | { kind: 'sent'; periodStart: string; periodEnd: string; periodLabel: string; recipientCount: number; updateCount: number }
  | { kind: 'already_sent'; periodStart: string; periodEnd: string; periodLabel: string }
  | { kind: 'no_updates'; periodStart: string; periodEnd: string; periodLabel: string };

/**
 * Compute previous calendar month in Europe/Oslo. Returns ISO date strings
 * (YYYY-MM-DD) since Supabase DATE-columns ignore TZ.
 *
 * Behavior: if today is 1. mai 2026 (UTC), period = 1. apr – 30. apr 2026.
 * Edge: Norwegian DST shift in March/October doesn't matter — we use date-only.
 */
export function previousMonthPeriod(nowMs: number = Date.now()): {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
} {
  // Get current year/month in Europe/Oslo timezone, then back up one month.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date(nowMs));
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  // First and last day of previous month.
  const periodStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  // Last day = day before first-of-current-month
  const lastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const periodEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Label: "mai 2026"
  const periodLabel = formatMonthLongNb(new Date(Date.UTC(prevYear, prevMonth - 1, 15)));

  return { periodStart, periodEnd, periodLabel };
}

export async function sendDigestForPeriod(
  opts: SendDigestOptions,
): Promise<SendDigestResult> {
  const admin = getAdminClient();
  const { periodStart, periodEnd, periodLabel } = previousMonthPeriod(opts.nowMs);

  // Idempotency: already-sent for this period?
  const { data: existing } = await admin
    .from('product_update_digests')
    .select('id')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle();

  if (existing) {
    return { kind: 'already_sent', periodStart, periodEnd, periodLabel };
  }

  // Updates published in period (inclusive — full last day).
  const periodStartIso = `${periodStart}T00:00:00.000Z`;
  const periodEndIso = `${periodEnd}T23:59:59.999Z`;

  const { data: updates } = await admin
    .from('product_updates')
    .select('id, title, body, link, cta_label')
    .gte('created_at', periodStartIso)
    .lte('created_at', periodEndIso)
    .order('created_at', { ascending: true })
    .returns<{ id: string; title: string; body: string; link: string | null; cta_label: string | null }[]>();

  if (!updates || updates.length === 0) {
    return { kind: 'no_updates', periodStart, periodEnd, periodLabel };
  }

  const entries: ProductUpdateDigestEntry[] = updates.map((u) => ({
    title: u.title,
    body: u.body,
    link: u.link,
    cta_label: u.cta_label,
  }));

  // Opted-in recipients with email.
  const { data: recipients } = await admin
    .from('users')
    .select('id, name, email, locale')
    .is('product_updates_unsubscribed_at', null)
    .not('email', 'is', null)
    .returns<{ id: string; name: string | null; email: string; locale: string | null }[]>();

  const settled = await Promise.allSettled(
    (recipients ?? []).map((r) =>
      sendProductUpdateDigest({
        to: r.email,
        recipientFirstName: firstName(r.name),
        periodLabel,
        updates: entries,
        unsubToken: signUnsubToken(r.id),
        locale: r.locale,
      }),
    ),
  );

  let successCount = 0;
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      successCount += 1;
    } else {
      console.error('[sendDigestForPeriod] send failed', result.reason);
    }
  }

  // Audit row — even when 0 successes, we record the attempt so we don't
  // retry the same period on next cron-fire.
  await admin.from('product_update_digests').insert({
    period_start: periodStart,
    period_end: periodEnd,
    sent_by: opts.sentByUserId,
    recipient_count: successCount,
    update_ids: updates.map((u) => u.id),
  });

  return {
    kind: 'sent',
    periodStart,
    periodEnd,
    periodLabel,
    recipientCount: successCount,
    updateCount: updates.length,
  };
}
