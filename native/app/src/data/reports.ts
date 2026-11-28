// native/app/src/data/reports.ts
// #3019: «Send rapport». Rapporten går til `POST /api/reports`, som skriver
// raden som spilleren (RLS) og sender e-post til alle admin. Kroppen bærer
// aldri spillerens egen id; den kommer fra tokenet.
import { callWebRoute } from './webApi';
import type { ReportReason } from '../../../../lib/moderation/reportInput';
import type { ReportFailure } from '../lib/moderationCopy';

/** Hva som rapporteres: en person, en runde ved id, eller en runde ved lenke-id. */
export type ReportTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'game'; gameId: string }
  | { kind: 'gameShortId'; shortId: string };

export type SubmitReportResult = { ok: true } | { ok: false; reason: ReportFailure };

export async function submitReport(
  target: ReportTarget,
  reason: ReportReason,
  note: string,
): Promise<SubmitReportResult> {
  const trimmed = note.trim();
  const body: Record<string, unknown> = { reason, ...(trimmed ? { note: trimmed } : {}) };
  if (target.kind === 'user') body.targetUserId = target.userId;
  else if (target.kind === 'game') body.targetGameId = target.gameId;
  else body.targetGameShortId = target.shortId;

  const call = await callWebRoute('/api/reports', 'POST', body);
  if (!call.ok) return { ok: false, reason: call.reason === 'offline' ? 'offline' : 'failed' };
  if (call.status === 200 && call.body.ok === true) return { ok: true };
  if (call.status === 400) return { ok: false, reason: 'invalid' };
  if (call.status === 429) return { ok: false, reason: 'rate_limited' };
  return { ok: false, reason: 'failed' };
}
