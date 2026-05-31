import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { resolveModeGuide } from '@/lib/formats/modeGuide';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Merged mode content: DB fields win per field; null falls back to MODE_GUIDE.
 * `long` and `example` have no MODE_GUIDE fallback — they are new fields.
 */
export type MergedModeContent = {
  summary: string;
  points: string[];
  long: string | null;
  example: string | null;
};

type DbRow = {
  rules_summary: string | null;
  rules_points: string[] | null;
  rules_long: string | null;
  rules_example: string | null;
};

/**
 * Pure merge helper (testable without DB). Merges DB row fields with
 * MODE_GUIDE fallback for summary/points; long/example are DB-only.
 *
 * @param dbRow - nullable DB row (null → full fallback for summary/points)
 * @param mode - the GameMode for MODE_GUIDE lookup
 * @param teamSize - used by resolveModeGuide to pick 4BBB variant
 */
export function mergeModeContent(
  dbRow: DbRow | null,
  mode: GameMode,
  teamSize: number,
): MergedModeContent {
  const guide = resolveModeGuide(mode, teamSize);
  return {
    summary: dbRow?.rules_summary ?? guide.summary,
    points: dbRow?.rules_points ?? guide.points,
    long: dbRow?.rules_long ?? null,
    example: dbRow?.rules_example ?? null,
  };
}

/**
 * Tag-cached map of slug → DB content fields. Mirrors getFormatsForIntent's
 * cache setup (tag: 'format-mapping', 24h revalidate, admin-client read).
 *
 * Admin edits must call `revalidateTag('format-mapping', 'max')` after any
 * change so both this cache and getFormatsForIntent are invalidated together.
 */
export const getModeContentMap = unstable_cache(
  async (): Promise<
    Record<string, DbRow>
  > => {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('formats')
      .select('slug, rules_summary, rules_points, rules_long, rules_example');

    if (error) {
      console.error('[getModeContentMap] query failed', { error });
      throw new Error('Failed to fetch mode content from formats');
    }

    const map: Record<string, DbRow> = {};
    for (const row of data ?? []) {
      map[row.slug] = {
        rules_summary: row.rules_summary,
        rules_points: row.rules_points,
        rules_long: row.rules_long,
        rules_example: row.rules_example,
      };
    }
    return map;
  },
  ['mode-content-map'],
  { tags: ['format-mapping'], revalidate: 60 * 60 * 24 },
);
