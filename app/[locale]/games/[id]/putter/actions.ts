'use server';

import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { expectAffected, NoRowsAffectedError } from '@/lib/supabase/affectedRows';

/** Matches the scores.putts CHECK (0..10) from migration 0123. */
const MAX_PUTTS = 10;
const MIN_PUTTS = 0;

export interface PuttsBackfillEntry {
  holeNumber: number;
  putts: number;
}

/**
 * Result the `/putter` client reacts to. On failure the client maps `code` to a
 * norsk banner (kept as a code, not a rendered string, so i18n stays in the UI).
 */
export type BackfillPuttsResult =
  | { ok: true; updated: number }
  | { ok: false; code: 'unauthenticated' | 'not_finished' | 'invalid' | 'db' };

/**
 * Back-fill FORGOTTEN putt counts on a FINISHED game (#1290 del B).
 *
 * Only reachable for finished games — active games still write putts through the
 * offline-first `writeScore` path (the scores are live, LWW-synced). Here the
 * scores are frozen, so this goes straight to Postgres under the 0148 policy +
 * column guard: an authenticated client may set ONLY `putts`, ONLY on its own
 * rows, ONLY while the game is finished. No admin client — RLS + the trigger are
 * the enforcement layer (trap 3), so a hostile direct PATCH is blocked the same
 * way this call is allowed.
 *
 * Deliberately does NOT touch `client_updated_at`: leaving the LWW key untouched
 * keeps the 0109 guard satisfied and means a late offline sync of stale strokes
 * can neither lose to nor clobber the back-fill.
 *
 * Each row is asserted with `expectAffected` (trap 2 — a 0-row PostgREST update
 * returns no error). A hole with no scores row (never played) can't be
 * back-filled and surfaces as a clean failure rather than a silent no-op.
 */
export async function backfillPutts(
  gameId: string,
  entries: PuttsBackfillEntry[],
): Promise<BackfillPuttsResult> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: 'unauthenticated' };

  // Validate the payload before any write. putts range is the DB CHECK's home
  // (0123); we mirror it here so a bad client gets a clean norsk error, not a
  // raw constraint violation. Empty payload is a no-op success.
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: true, updated: 0 };
  }
  for (const e of entries) {
    if (
      !Number.isInteger(e.holeNumber) ||
      e.holeNumber < 1 ||
      !Number.isInteger(e.putts) ||
      e.putts < MIN_PUTTS ||
      e.putts > MAX_PUTTS
    ) {
      return { ok: false, code: 'invalid' };
    }
  }

  // Only finished games are back-fillable. The RLS policy already refuses
  // otherwise (0-row update → NoRowsAffectedError below), but checking up front
  // turns "not finished" into a specific, translatable error instead of a
  // generic db failure.
  const { data: game, error: gameErr } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .maybeSingle<{ status: string }>();
  if (gameErr) return { ok: false, code: 'db' };
  if (!game || game.status !== 'finished') return { ok: false, code: 'not_finished' };

  try {
    let updated = 0;
    for (const e of entries) {
      expectAffected(
        await supabase
          .from('scores')
          .update({ putts: e.putts })
          .eq('game_id', gameId)
          .eq('user_id', user.id)
          .eq('hole_number', e.holeNumber)
          .select('hole_number'),
        'backfillPutts',
      );
      updated += 1;
    }
    revalidateTag(`game-${gameId}`, 'max');
    return { ok: true, updated };
  } catch (err) {
    if (err instanceof NoRowsAffectedError) {
      // A hole with no scores row, or an RLS/trigger reject (not own row,
      // withdrawn, non-putts change). Any partial rows already written stay —
      // last-write-wins is acceptable here (idempotent putt values).
      return { ok: false, code: 'invalid' };
    }
    console.error('[backfillPutts] update failed', err);
    return { ok: false, code: 'db' };
  }
}
