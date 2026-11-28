// lib/moderation/reportInput.ts
// #3019: what a report carries over the wire (POST /api/reports). Pure, so
// the native app can import the reasons and the note cap from here.

export const REPORT_REASONS = ['offensive', 'harassment', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Mirrors `content_reports_note_length` in 0259. */
export const REPORT_NOTE_MAX = 500;

export type ReportInput = {
  targetUserId: string | null;
  targetGameId: string | null;
  reason: ReportReason;
  note: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The report in a request body, or null when it is not one. Exactly one
 * target, a known reason, and a note of at most {@link REPORT_NOTE_MAX}
 * characters after trimming (an empty note is no note).
 */
export function parseReportInput(body: unknown): ReportInput | null {
  if (body === null || typeof body !== 'object') return null;
  const { targetUserId, targetGameId, reason, note } = body as Record<string, unknown>;

  const userId = typeof targetUserId === 'string' && UUID.test(targetUserId) ? targetUserId : null;
  const gameId = typeof targetGameId === 'string' && UUID.test(targetGameId) ? targetGameId : null;
  if ((userId === null) === (gameId === null)) return null;
  if (targetUserId != null && userId === null) return null;
  if (targetGameId != null && gameId === null) return null;

  if (typeof reason !== 'string' || !(REPORT_REASONS as readonly string[]).includes(reason)) {
    return null;
  }

  let cleanNote: string | null = null;
  if (note != null) {
    if (typeof note !== 'string') return null;
    const trimmed = note.trim();
    if (trimmed.length > REPORT_NOTE_MAX) return null;
    cleanNote = trimmed.length > 0 ? trimmed : null;
  }

  return { targetUserId: userId, targetGameId: gameId, reason: reason as ReportReason, note: cleanNote };
}
