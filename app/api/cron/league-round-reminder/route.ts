import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireCronAuth } from '@/lib/cron/auth';
import { CLOSING_REMINDER_LEAD_MS, type LeagueRoundNoticeKind } from '@/lib/league/roundNotices';
import {
  runLeagueRoundNotices,
  type LeagueRoundSweepRound,
} from '@/lib/notifications/leagueRoundNotices';

// The league round's two messages — #2638 Del 3.
//
// A league round opens and closes on its dates; each player plays it when it
// suits them. This sweep tells the league's players when a round opens, and
// reminds the ones who have not played it 48 hours before it closes (the
// owner's answer 2026-10-25: «48 t før + når runden åpner»). When a message is
// due lives in `lib/league/roundNotices.ts` (`dueNotices`), the claim and the
// send per round in `runLeagueRoundNotices`. The route is only the
// orchestration.
//
// Called by pg_cron + pg_net (migration 0218) every hour, but only when a
// round is a candidate (the job's EXISTS gate). Not a Vercel cron: Hobby gives
// one run a day (same reason as start-scheduled-games, #502). POST because
// pg_net can only POST.
//
// Idempotence is NOT the route's job: the claim per round and message
// (`opening_notice_sent_at` / `closing_reminder_sent_at is null`) makes each
// message go once per round, also when two runs meet.

export const maxDuration = 60;

const LOG_PREFIX = 'leagueRoundReminder';

// The cap is per run. A round stays a candidate until its messages are
// claimed, so with more than 20 at once the rest wait an hour. The deadline
// closest first: a reminder is the one that cannot wait.
const SWEEP_BATCH_LIMIT = 20;

export async function POST(request: NextRequest) {
  const denied = requireCronAuth(request, LOG_PREFIX);
  if (denied) return denied;

  // Service-role: the sweep reads every league's players and flights, and
  // stamps rounds of leagues it does not run.
  const admin = getAdminClient();

  // ONE RULE, THREE PLACES (AGENTS.md trap 4): `dueNotices` decides, and this
  // query and 0218's EXISTS gate select the rounds it can say yes to. Change
  // one predicate, change all three in the same commit:
  //   leagues.status = 'active'
  //   opens_at <= now < closes_at
  //   opening_notice_sent_at is null
  //   or (closing_reminder_sent_at is null and closes_at < now + 48 t)
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const soonIso = new Date(now + CLOSING_REMINDER_LEAD_MS).toISOString();
  const { data: candidates, error: candidatesError } = await admin
    .from('league_rounds')
    .select(
      'id, league_id, label, opens_at, closes_at, opening_notice_sent_at, closing_reminder_sent_at, leagues!inner(name, status, is_simulator), courses!league_rounds_course_id_fkey(name), tee_boxes!league_rounds_tee_box_id_fkey(name)',
    )
    .eq('leagues.status', 'active')
    .lte('opens_at', nowIso)
    .gt('closes_at', nowIso)
    .or(`opening_notice_sent_at.is.null,and(closing_reminder_sent_at.is.null,closes_at.lt.${soonIso})`)
    .order('closes_at', { ascending: true })
    .range(0, SWEEP_BATCH_LIMIT - 1)
    .returns<LeagueRoundSweepRound[]>();

  if (candidatesError) {
    console.error(`[${LOG_PREFIX}] candidate query failed`, candidatesError);
    return NextResponse.json({ ok: false, error: 'candidate query failed' }, { status: 500 });
  }

  const sent: Record<LeagueRoundNoticeKind, number> = { league_round_open: 0, league_round_closing: 0 };
  const failed: Array<{ id: string; error: string }> = [];

  // One round at a time, with its own try/catch: a failure in one round
  // should not cost the others their messages.
  for (const round of candidates ?? []) {
    try {
      const result = await runLeagueRoundNotices(admin, round, now);
      sent.league_round_open += result.sent.league_round_open;
      sent.league_round_closing += result.sent.league_round_closing;
    } catch (err) {
      console.error(`[${LOG_PREFIX}] round ${round.id} failed`, err);
      failed.push({ id: round.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  // `checked` counts the rounds in the batch, `sent` the varsler per message.
  return NextResponse.json({ ok: true, checked: candidates?.length ?? 0, sent, failed });
}
