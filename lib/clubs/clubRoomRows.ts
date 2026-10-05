/**
 * «Neste runde» on a club row in the Klubbhus room (#2493): per club, the
 * first scheduled round with a tee-off from `now` on. Open or closed signup
 * alike: a full club round with closed signups is still the next round. A
 * round without a tee-off, or one whose tee-off has passed (it starts when
 * someone opens it, or not at all), is no next round. Rows come from
 * `getUpcomingClubGames`.
 */
export function nextRoundByClub(
  rows: readonly { group_id: string | null; scheduled_tee_off_at: string | null }[],
  now: Date,
): Map<string, string> {
  const nowMs = now.getTime();
  const next = new Map<string, string>();
  for (const row of rows) {
    if (!row.group_id || !row.scheduled_tee_off_at) continue;
    const at = Date.parse(row.scheduled_tee_off_at);
    if (Number.isNaN(at) || at < nowMs) continue;
    const seen = next.get(row.group_id);
    if (seen === undefined || at < Date.parse(seen)) next.set(row.group_id, row.scheduled_tee_off_at);
  }
  return next;
}
