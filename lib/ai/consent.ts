import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * The AI consent rule (#2561 PR B), one home on the server.
 *
 * Only with «ja» does a player's name reach the language model. No row (never
 * asked) and «nei» are treated alike: the player's name is left out of the
 * round report and of other players' Kavalkade texts, and so is a game name
 * that mentions them (`gameNameGuard.ts`). Numbers without a name can still
 * go, such as a team's result or a rival's record. The app lets a player past its question when
 * it is offline (the same rule as `ProfileGate`), so «not answered = yes»
 * would send a player's data before they answered (Apple 5.1.2(i)).
 *
 * The table is `ai_consents` (migration 0210). Nothing else under `lib/` or
 * `app/` reads it: the round report and the Kavalkade go through
 * `readAiAllowedUserIds`, the Home card and the profile switch through
 * `readOwnAiConsent`, and `setAiConsent` (profile actions) is the one web
 * write. The app reads and writes its own row in `native/app/src/data/`.
 */

type Client = SupabaseClient<Database>;

export type AiConsentRow = { user_id: string; granted: boolean };

/**
 * Some PostgREST hosts start refusing a long `.in()` list somewhere between
 * 200 and 400 ids (the URL gets too long). A game holds at most ~150 players,
 * but a Kavalkade asks about everyone in every round its facts mention, which
 * for a club player can reach about 1 500 ids. The reader asks in chunks of
 * 100, in parallel.
 */
const IN_LIST_CHUNK = 100;

/** The users among `userIds` whose row says yes. Pure. */
export function aiAllowedUserIds(
  userIds: Iterable<string>,
  rows: readonly AiConsentRow[],
): Set<string> {
  const asked = new Set(userIds);
  const allowed = new Set<string>();
  for (const row of rows) {
    if (row.granted === true && asked.has(row.user_id)) allowed.add(row.user_id);
  }
  return allowed;
}

/**
 * Reads the answers for `userIds` with the service-role client and returns
 * those who said yes. Fails closed: a read error gives an empty set (nobody's
 * data goes out) and is logged.
 */
export async function readAiAllowedUserIds(
  admin: Client,
  userIds: readonly string[],
): Promise<Set<string>> {
  return (await readAiAllowedUserIdsOrNull(admin, userIds)) ?? new Set();
}

/**
 * The same read, but `null` on a read error (logged). For a caller that must
 * not store «nobody said yes» when the answers could not be read: the
 * Kavalkade, which keeps its first opening text for the whole year.
 */
export async function readAiAllowedUserIdsOrNull(
  admin: Client,
  userIds: readonly string[],
): Promise<Set<string> | null> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Set();

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += IN_LIST_CHUNK) {
    chunks.push(unique.slice(i, i + IN_LIST_CHUNK));
  }
  const answers = await Promise.all(
    chunks.map((ids) =>
      admin.from('ai_consents').select('user_id, granted').in('user_id', ids),
    ),
  );

  const rows: AiConsentRow[] = [];
  for (const { data, error } of answers) {
    if (error) {
      console.error('[aiConsent] reading ai_consents failed, nobody is sent', {
        error,
        count: unique.length,
      });
      return null;
    }
    rows.push(...((data ?? []) as AiConsentRow[]));
  }
  return aiAllowedUserIds(unique, rows);
}

/**
 * The signed-in player's own answer through the user's client (RLS returns only
 * their row): `true`, `false`, or `null` when they have not answered.
 *
 * Throws on a read error. A switch or a card shown on a guess would misreport
 * consent, so the caller shows nothing instead: no row on Profil, no card on
 * Home.
 */
export async function readOwnAiConsent(supabase: Client): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('ai_consents')
    .select('granted')
    .maybeSingle();
  if (error) throw new Error(`[aiConsent] reading own answer failed: ${error.message}`);
  return data ? data.granted : null;
}
