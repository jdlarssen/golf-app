import { getAdminClient } from '@/lib/supabase/admin';
import type { getServerClient } from '@/lib/supabase/server';
import { SPONSOR_LOGO_BUCKET } from '@/lib/storage/sponsorLogoUrl';
import { safeParsePrizes, type GamePrize } from './prizes';

type RequestClient = Awaited<ReturnType<typeof getServerClient>>;

/**
 * Audit 20.11 (p11): the stored sponsor logos a save no longer uses. The form
 * used to delete a logo the moment «Fjern» or a new upload was tapped, so a
 * save that failed, or an organiser who left without saving, left the game
 * pointing at a deleted file. The file now goes only after the save.
 */
export function replacedSponsorLogoPaths(
  before: unknown,
  after: readonly GamePrize[],
): string[] {
  const kept = new Set(after.map((p) => p.sponsorLogoPath).filter((p) => p != null));
  const removed = new Set<string>();
  for (const p of safeParsePrizes(before)) {
    if (p.sponsorLogoPath && !kept.has(p.sponsorLogoPath)) removed.add(p.sponsorLogoPath);
  }
  return [...removed];
}

/**
 * Removes the logos this save replaced, after `games.update` has stored the
 * new prizes. Best-effort: logs and never throws, so a storage hiccup never
 * stops a save (an orphan file is the accepted cost, as before).
 *
 * - A logo another game still shows stays. «Gjenta hver uke» copies the
 *   prizes, path and all, to the next round. The check reads every game
 *   through the service client (a read only); a failed check keeps the file.
 * - The delete itself goes through the request client, so the bucket's owner
 *   policy (0143) still decides who may delete: the organiser who uploaded.
 */
export async function removeReplacedSponsorLogos({
  client,
  gameId,
  before,
  after,
}: {
  client: RequestClient;
  gameId: string;
  before: unknown;
  after: readonly GamePrize[];
}): Promise<void> {
  const candidates = replacedSponsorLogoPaths(before, after);
  if (candidates.length === 0) return;
  try {
    const admin = getAdminClient();
    const unused: string[] = [];
    for (const path of candidates) {
      const { data, error } = await admin
        .from('games')
        .select('id')
        .neq('id', gameId)
        .contains('prizes', [{ sponsorLogoPath: path }])
        .limit(1);
      if (error) {
        console.error('[sponsorLogoCleanup] reference check failed', { gameId, path, error });
        continue;
      }
      if ((data ?? []).length === 0) unused.push(path);
    }
    if (unused.length === 0) return;
    const { error } = await client.storage.from(SPONSOR_LOGO_BUCKET).remove(unused);
    if (error) console.error('[sponsorLogoCleanup] remove failed', { gameId, error });
  } catch (error) {
    console.error('[sponsorLogoCleanup] failed', { gameId, error });
  }
}
