import { after, NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { parseReportInput } from '@/lib/moderation/reportInput';
import { submitReportCore } from '@/lib/moderation/submitReport';

// #3019: «Rapporter» from the native app (Apple guideline 1.2). The core,
// `submitReportCore`, writes the row as the caller and mails every admin.
//
// AUTH: `authenticatedUserId` in `lib/api/appAuth.ts`. The reporter comes ONLY
// from the validated token, and the row is written with the caller's own
// client, so RLS («content_reports insert own», 0259) refuses a forged one.
//
// WIRE (frozen — the app mirrors it):
//   POST { targetUserId?: uuid, targetGameId?: uuid,
//          reason: 'offensive' | 'harassment' | 'other', note?: string (≤ 500) }
//        200 { ok: true }
//        400 { error: 'invalid' }        not one target, unknown reason, long note,
//                                        a target that no longer exists, or yourself
//        401 { error: 'unauthorized' }
//        429 { error: 'rate_limited' }   10 reports in the last 24 hours
//        500 { error: 'db_error' }
//
// Error bodies are fixed codes, never `err.message`. An unreadable body is the
// caller's error and answers 400.

const LOG_PREFIX = 'api/reports';

type ErrorBody = { error: 'unauthorized' | 'invalid' | 'rate_limited' | 'db_error' };

async function readBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    const caller = userId ? callerScopedClient(request) : null;
    if (!userId || !caller) {
      const body: ErrorBody = { error: 'unauthorized' };
      return NextResponse.json(body, { status: 401 });
    }

    const input = parseReportInput(await readBody(request));
    if (!input) {
      const body: ErrorBody = { error: 'invalid' };
      return NextResponse.json(body, { status: 400 });
    }

    const result = await submitReportCore(caller, userId, input, after);
    if (result.ok) return NextResponse.json({ ok: true });

    const status = result.error === 'invalid' ? 400 : result.error === 'rate_limited' ? 429 : 500;
    const body: ErrorBody = { error: result.error };
    return NextResponse.json(body, { status });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] threw`, err);
    const body: ErrorBody = { error: 'db_error' };
    return NextResponse.json(body, { status: 500 });
  }
}
