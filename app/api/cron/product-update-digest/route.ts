import { NextResponse, type NextRequest } from 'next/server';
import { sendDigestForPeriod } from '@/lib/productUpdates/digest';

// Vercel Cron handler — issue #202.
//
// Schedule (vercel.json): "0 8 * * *" — daily 08:00 UTC.
// Internal gate: only fire on first-of-month in Europe/Oslo. Vercel Hobby
// caps cron at 1/day, so we use the daily-cron + internal date-gate pattern
// instead of "0 8 1 * *" — gives us atomic deploy-safety.
//
// Auth: Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}`.
// If the header doesn't match, return 401 so accidental public-fetch is
// blocked.


export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/product-update-digest] CRON_SECRET not set');
    return new NextResponse('CRON_SECRET not configured', { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Gate: only fire on the 1st of the month in Europe/Oslo.
  const dayInOslo = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Oslo',
      day: 'numeric',
    }).format(new Date()),
  );

  if (dayInOslo !== 1) {
    return NextResponse.json({
      ok: true,
      skipped: 'not first of month',
      day: dayInOslo,
    });
  }

  try {
    const result = await sendDigestForPeriod({ sentByUserId: null });

    if (result.kind === 'already_sent') {
      return NextResponse.json({
        ok: true,
        skipped: 'already sent',
        period: result.periodLabel,
      });
    }
    if (result.kind === 'no_updates') {
      return NextResponse.json({
        ok: true,
        skipped: 'no updates in period',
        period: result.periodLabel,
      });
    }

    return NextResponse.json({
      ok: true,
      sent: result.recipientCount,
      updates: result.updateCount,
      period: result.periodLabel,
    });
  } catch (err) {
    console.error('[cron/product-update-digest] failed', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
