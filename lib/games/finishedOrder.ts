/**
 * Comparator for finished-game lists: newest `ended_at` first, `null` last.
 *
 * Exists because supabase-js' `.order(col, { foreignTable })` only orders rows
 * *inside* the embedded resource — a no-op for to-one embeds like
 * `games!inner(...)` — so top-level ordering must happen in JS (#569).
 * ISO 8601 timestamps from PostgREST compare correctly as strings.
 */
export function byEndedAtDesc(
  a: { ended_at: string | null },
  b: { ended_at: string | null },
): number {
  return (b.ended_at ?? '').localeCompare(a.ended_at ?? '');
}
