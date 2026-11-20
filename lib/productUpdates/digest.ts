import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import {
  sendProductUpdateDigest,
  type ProductUpdateDigestEntry,
} from '@/lib/mail/productUpdateDigest';
import { signUnsubToken } from './unsubscribeToken';
import { formatMonthLongNb } from '@/lib/format/date';
import { firstName } from '@/lib/firstName';
import { allSettledInBatches } from '@/lib/async/allSettledInBatches';

/**
 * Monthly product-update digest sender (issue #202).
 *
 * Called by /api/cron/product-update-digest (cron-triggered, sent_by = null),
 * its only caller. `sentByUserId` stays in the options for an admin-triggered
 * send, but no button in the app calls this today.
 *
 * Workflow (0246):
 *  1. Compute period = previous calendar month (Europe/Oslo), and the instants
 *     where that month starts and ends in Oslo.
 *  2. Query product_updates published in the period. Nothing → `no_updates`,
 *     and nothing is written.
 *  3. Claim the month: insert the product_update_digests row BEFORE sending.
 *     UNIQUE (period_start, period_end) is the lock. A row that is already
 *     there and has `completed_at` → `already_sent`. One without it is an
 *     unfinished run, and this run carries it on.
 *  4. Query opted-in users that existed when the month was claimed, paged.
 *  5. Per recipient: insert a product_update_digest_recipients row (the
 *     primary key makes two runs skip each other), send, and delete the row
 *     again when the send fails, so the next run tries that recipient again.
 *  6. Store the recipient count. With no failed send, set `completed_at`.
 *
 * Every read and write checks its error and throws, so a failed lookup can
 * never look like "not sent" and send the month twice.
 */

export type SendDigestOptions = {
  /** Admin user-id when triggered manually; null for cron. */
  sentByUserId: string | null;
  /** Override "now" for testing the date-window. */
  nowMs?: number;
};

export type SendDigestResult =
  | {
      kind: 'sent';
      periodStart: string;
      periodEnd: string;
      periodLabel: string;
      /** Recipients reached for the month so far, this run and earlier ones. */
      recipientCount: number;
      /** Sends that failed in this run; the next run tries them again. */
      failedCount: number;
      updateCount: number;
    }
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

/**
 * The instant a calendar month starts in Oslo, as ISO (UTC). The first of a
 * month is never a DST switch day (they fall on the last Sunday of March and
 * October), so the offset is fixed per month: +02:00 from April through
 * October, +01:00 from November through March. Same reasoning as
 * `osloYearWindow`.
 */
export function osloMonthStartIso(year: number, month: number): string {
  const offset = month >= 4 && month <= 10 ? '+02:00' : '+01:00';
  return new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00${offset}`).toISOString();
}

/** The Oslo month of `periodStart` as [start, end) instants. */
function osloMonthWindow(periodStart: string): { fromIso: string; toIso: string } {
  const [year, month] = periodStart.split('-').map(Number) as [number, number];
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return { fromIso: osloMonthStartIso(year, month), toIso: osloMonthStartIso(nextYear, nextMonth) };
}

/** Sends in flight at once. `sendMail` paces the calls under Resend's limit. */
const SEND_BATCH = 8;

type Recipient = { id: string; name: string | null; email: string; locale: string | null };
type DigestRow = { id: string; sent_at: string; completed_at: string | null };

function isDuplicate(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '23505' || String(error.message ?? '').toLowerCase().includes('duplicate');
}

export async function sendDigestForPeriod(
  opts: SendDigestOptions,
): Promise<SendDigestResult> {
  const admin = getAdminClient();
  const { periodStart, periodEnd, periodLabel } = previousMonthPeriod(opts.nowMs);
  const { fromIso, toIso } = osloMonthWindow(periodStart);

  // Updates published in the Oslo month.
  const { data: updates, error: updatesError } = await admin
    .from('product_updates')
    .select('id, title, body, link, cta_label')
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .order('created_at', { ascending: true })
    .returns<{ id: string; title: string; body: string; link: string | null; cta_label: string | null }[]>();
  if (updatesError) throw new Error(`sendDigestForPeriod updates: ${updatesError.message}`);

  if (!updates || updates.length === 0) {
    return { kind: 'no_updates', periodStart, periodEnd, periodLabel };
  }

  // Claim the month before anything is sent.
  const digest = await claimMonth(admin, {
    periodStart,
    periodEnd,
    sentBy: opts.sentByUserId,
    updateIds: updates.map((u) => u.id),
  });
  if (digest.completed_at) {
    return { kind: 'already_sent', periodStart, periodEnd, periodLabel };
  }

  const entries: ProductUpdateDigestEntry[] = updates.map((u) => ({
    title: u.title,
    body: u.body,
    link: u.link,
    cta_label: u.cta_label,
  }));

  // Opted-in recipients with email. #1009: gjester (skygge-brukere) utelates —
  // dette er den ene blanket-alle-brukere-utsendelsen, og plassholder-
  // adressene deres ville bouncet på hver eneste digest.
  //
  // #2227: paged, since the users table outgrows PostgREST's 1 000-row cap.
  // A run that carries an unfinished month on reaches only the users who
  // existed when the month was claimed.
  const recipients = await selectAllRows(
    (from, to) =>
      admin
        .from('users')
        .select('id, name, email, locale')
        .is('product_updates_unsubscribed_at', null)
        .not('email', 'is', null)
        .eq('is_guest', false)
        // #1012: anonymiserte kontoer utelates (belte-og-seler — anonymize_user
        // setter også product_updates_unsubscribed_at).
        .is('deleted_at', null)
        .lte('created_at', digest.sent_at)
        .order('id')
        .range(from, to)
        .returns<Recipient[]>(),
    'sendDigestForPeriod recipients',
  );

  const outcomes = await allSettledInBatches(
    recipients,
    (r) => sendOnce(admin, digest.id, r, { periodLabel, entries }),
    SEND_BATCH,
  );
  let failedCount = 0;
  outcomes.forEach((o, i) => {
    if (o.status === 'rejected') {
      failedCount += 1;
      console.error('[sendDigestForPeriod] send failed', { userId: recipients[i]!.id, err: o.reason });
    } else if (o.value === 'failed') {
      failedCount += 1;
    }
  });

  // How many the month has reached, over every run.
  const { count, error: countError } = await admin
    .from('product_update_digest_recipients')
    .select('user_id', { count: 'exact', head: true })
    .eq('digest_id', digest.id);
  if (countError) throw new Error(`sendDigestForPeriod count: ${countError.message}`);
  const recipientCount = count ?? 0;

  const { error: closeError } = await admin
    .from('product_update_digests')
    .update({
      recipient_count: recipientCount,
      ...(failedCount === 0 ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', digest.id);
  if (closeError) {
    // The sends are out and each is remembered, so the next run sends nothing
    // twice. Log it rather than fail the cron.
    console.error('[sendDigestForPeriod] closing the month failed', { periodStart, error: closeError });
  }

  return {
    kind: 'sent',
    periodStart,
    periodEnd,
    periodLabel,
    recipientCount,
    failedCount,
    updateCount: updates.length,
  };
}

/**
 * Inserts the month's row, or reads the one already there. Throws on any
 * other failure, so a failed lookup never looks like "not sent".
 */
async function claimMonth(
  admin: ReturnType<typeof getAdminClient>,
  month: { periodStart: string; periodEnd: string; sentBy: string | null; updateIds: string[] },
): Promise<DigestRow> {
  const { data: inserted, error: insertError } = await admin
    .from('product_update_digests')
    .insert({
      period_start: month.periodStart,
      period_end: month.periodEnd,
      sent_by: month.sentBy,
      recipient_count: 0,
      update_ids: month.updateIds,
    })
    .select('id, sent_at, completed_at')
    .single<DigestRow>();
  if (!insertError && inserted) return inserted;
  if (!isDuplicate(insertError)) {
    throw new Error(`sendDigestForPeriod claim: ${insertError?.message ?? 'no row'}`);
  }

  const { data: existing, error: readError } = await admin
    .from('product_update_digests')
    .select('id, sent_at, completed_at')
    .eq('period_start', month.periodStart)
    .eq('period_end', month.periodEnd)
    .single<DigestRow>();
  if (readError || !existing) {
    throw new Error(`sendDigestForPeriod claim read: ${readError?.message ?? 'no row'}`);
  }
  return existing;
}

/**
 * One recipient, at most once per month: the recipient row is the claim. A
 * recipient another run (or an earlier one) already has is skipped. A failed
 * send gives the claim back, so the next run tries again.
 */
async function sendOnce(
  admin: ReturnType<typeof getAdminClient>,
  digestId: string,
  r: Recipient,
  mail: { periodLabel: string; entries: ProductUpdateDigestEntry[] },
): Promise<'sent' | 'skipped' | 'failed'> {
  const { error: claimError } = await admin
    .from('product_update_digest_recipients')
    .insert({ digest_id: digestId, user_id: r.id });
  if (claimError) {
    if (isDuplicate(claimError)) return 'skipped';
    console.error('[sendDigestForPeriod] recipient claim failed', { userId: r.id, error: claimError });
    return 'failed';
  }

  try {
    await sendProductUpdateDigest({
      to: r.email,
      recipientFirstName: firstName(r.name),
      periodLabel: mail.periodLabel,
      updates: mail.entries,
      unsubToken: signUnsubToken(r.id),
      locale: r.locale,
    });
    return 'sent';
  } catch (err) {
    console.error('[sendDigestForPeriod] send failed', { userId: r.id, err });
    const { error: releaseError } = await admin
      .from('product_update_digest_recipients')
      .delete()
      .eq('digest_id', digestId)
      .eq('user_id', r.id);
    if (releaseError) {
      console.error('[sendDigestForPeriod] recipient release failed', { userId: r.id, error: releaseError });
    }
    return 'failed';
  }
}
