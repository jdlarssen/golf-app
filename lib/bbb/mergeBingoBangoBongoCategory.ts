// Bingo Bango Bongo: one category per write (#1950).
//
// Two players in a flight can register different categories on the same hole
// at the same moment. Each write therefore carries only the tapped category,
// and each screen merges only that category into its local row. This module is
// the one home for the key → column rule: the web action, the web hole entry
// and the native app (native/app/src/data/choices.ts) all read it. Pure on
// purpose: no server-only, no client state, no bare imports (Metro bundles it
// for the app).

import type { Database } from '@/lib/database.types';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';

type BingoBangoBongoHoleInsert =
  Database['public']['Tables']['bingo_bango_bongo_holes']['Insert'];

export const BINGO_BANGO_BONGO_CATEGORY_KEYS = [
  'bingoUserId',
  'bangoUserId',
  'bongoUserId',
] as const;

export type BingoBangoBongoCategoryKey =
  (typeof BINGO_BANGO_BONGO_CATEGORY_KEYS)[number];

/**
 * The single column a category write sets. `Pick` ties each name to the
 * generated Insert type, so a renamed column fails to compile here.
 */
export type BingoBangoBongoCategoryColumn =
  | Required<Pick<BingoBangoBongoHoleInsert, 'bingo_user_id'>>
  | Required<Pick<BingoBangoBongoHoleInsert, 'bango_user_id'>>
  | Required<Pick<BingoBangoBongoHoleInsert, 'bongo_user_id'>>;

/**
 * Whitelist guard for a key that arrived from outside the type system (a
 * server action takes any payload). Never build a column name from the value.
 */
export function isBingoBangoBongoCategoryKey(
  value: unknown,
): value is BingoBangoBongoCategoryKey {
  return (
    typeof value === 'string' &&
    (BINGO_BANGO_BONGO_CATEGORY_KEYS as readonly string[]).includes(value)
  );
}

/**
 * key → the one-column fragment of the upsert payload. A switch rather than a
 * computed key, so every branch is a typed literal the Insert type accepts.
 * The other two category columns are left out on purpose: PostgREST's
 * ON CONFLICT DO UPDATE sets only the columns in the payload.
 */
export function bingoBangoBongoCategoryColumn(
  key: BingoBangoBongoCategoryKey,
  userId: string | null,
): BingoBangoBongoCategoryColumn {
  switch (key) {
    case 'bingoUserId':
      return { bingo_user_id: userId };
    case 'bangoUserId':
      return { bango_user_id: userId };
    case 'bongoUserId':
      return { bongo_user_id: userId };
  }
}

/**
 * Merge one saved category into the local hole rows.
 *
 * Sets only `key` on `holeNumber`'s row and keeps the other two as they stand,
 * so a flight-mate's category that arrived over realtime survives our own
 * save. A hole without a row gets one with the other two categories null. The
 * merged hole is a new object and `prev` is left untouched; the list stays
 * sorted by hole.
 */
export function mergeCategory(
  prev: BingoBangoBongoHoleInput[],
  holeNumber: number,
  key: BingoBangoBongoCategoryKey,
  userId: string | null,
): BingoBangoBongoHoleInput[] {
  const current = prev.find((h) => h.holeNumber === holeNumber);
  const merged: BingoBangoBongoHoleInput = {
    holeNumber,
    bingoUserId: key === 'bingoUserId' ? userId : (current?.bingoUserId ?? null),
    bangoUserId: key === 'bangoUserId' ? userId : (current?.bangoUserId ?? null),
    bongoUserId: key === 'bongoUserId' ? userId : (current?.bongoUserId ?? null),
  };

  const next = prev.filter((h) => h.holeNumber !== holeNumber);
  next.push(merged);
  next.sort((a, b) => a.holeNumber - b.holeNumber);
  return next;
}
