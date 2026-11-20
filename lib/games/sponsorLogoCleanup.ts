import { getAdminClient } from '@/lib/supabase/admin';
import { SPONSOR_LOGO_BUCKET } from '@/lib/storage/sponsorLogoUrl';
import { safeParsePrizes, type GamePrize } from './prizes';

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
 * The one place a stored sponsor logo file is deleted on the server (the edit
 * save and `deleteGame`). Each path is deleted only when no other game's
 * `prizes` still names it: «Gjenta hver uke» copies the prizes, path and all,
 * to the next round, so one file can sit on many games (9 on staging, 20.11).
 *
 * The service client does both the check and the delete, so an admin who
 * edits or deletes another organiser's game can clear that game's files.
 * Only files in the game's own folders go: an upload lands in
 * `{uploader id}/{uuid}.{ext}` (lib/storage/sponsorLogos.ts), so a path is
 * deleted only when its first folder is one of `ownerIds` (the game's creator
 * and the person saving). Any other path is kept and logged.
 *
 * The filter is a JSON string: postgrest-js turns an array argument into a
 * Postgres array literal (`cs.{…}`), which a jsonb column rejects.
 *
 * Best-effort: logs and never throws. A failed check keeps the file (an
 * orphan file is the accepted cost; a broken logo is not).
 *
 * Known gap: a weekly repeat made between the check and the delete would copy
 * a path that is about to go. The window is one request long, and the repeat
 * is made when a round finishes, not while it is edited.
 */
export async function removeUnusedSponsorLogos({
  gameId,
  paths,
  ownerIds,
}: {
  gameId: string;
  paths: readonly string[];
  /** The game's creator and the person saving; null entries are ignored. */
  ownerIds: readonly (string | null | undefined)[];
}): Promise<void> {
  const owners = new Set(ownerIds.filter((id): id is string => !!id));
  const ownPaths = paths.filter((path) => inOwnFolder(path, owners));
  const foreign = paths.filter((path) => !ownPaths.includes(path));
  if (foreign.length > 0) {
    console.error("[sponsorLogoCleanup] path outside the game's folders, kept", {
      gameId,
      paths: foreign,
    });
  }
  if (ownPaths.length === 0) return;
  try {
    const admin = getAdminClient();
    const unused: string[] = [];
    for (const path of ownPaths) {
      const { data, error } = await admin
        .from('games')
        .select('id')
        .neq('id', gameId)
        .contains('prizes', JSON.stringify([{ sponsorLogoPath: path }]))
        .limit(1);
      if (error) {
        console.error('[sponsorLogoCleanup] reference check failed', { gameId, path, error });
        continue;
      }
      if ((data ?? []).length === 0) unused.push(path);
    }
    if (unused.length === 0) return;
    const { error } = await admin.storage.from(SPONSOR_LOGO_BUCKET).remove(unused);
    if (error) console.error('[sponsorLogoCleanup] remove failed', { gameId, error });
  } catch (error) {
    console.error('[sponsorLogoCleanup] failed', { gameId, error });
  }
}

/** `{owner}/{file}` with no empty or `..` segment, and `owner` in `owners`. */
function inOwnFolder(path: string, owners: ReadonlySet<string>): boolean {
  const segments = path.split('/');
  if (segments.length < 2 || segments.some((s) => s === '' || s === '.' || s === '..')) {
    return false;
  }
  return owners.has(segments[0]);
}

/** The edit save: removes the logos this save replaced, after `games.update`. */
export async function removeReplacedSponsorLogos({
  gameId,
  before,
  after,
  ownerIds,
}: {
  gameId: string;
  before: unknown;
  after: readonly GamePrize[];
  ownerIds: readonly (string | null | undefined)[];
}): Promise<void> {
  const paths = replacedSponsorLogoPaths(before, after);
  if (paths.length === 0) return;
  await removeUnusedSponsorLogos({ gameId, paths, ownerIds });
}
