import { NextResponse } from 'next/server';
import { loadCupLineupAccessForUser } from './lineupAccess';
import type { CupLineupActionError, LoadCupLineupAccess } from './lineupCore';

/** Det som er serverens feil. Resten er en regel som sa nei, og teksten er appens. */
const SERVER_CODES = new Set([
  'save_failed',
  'insert_failed',
  'profile_read_failed',
  'rollback_failed',
  'reveal_undo_failed',
]);

/**
 * Tilgangen for en rute (#2752). Gaten svarer lukket når en lesing feiler, og her blir det
 * en 500, så appen sier «prøv igjen» og ikke «du har ikke tilgang».
 */
export function lineupAccessFor(userId: string): LoadCupLineupAccess {
  return async (tournamentId) => {
    const access = await loadCupLineupAccessForUser(userId, tournamentId);
    if (access.readFailed) throw new Error('lineup access read failed');
    return access;
  };
}

/**
 * Svaret fra en kjerne. Koden reiser som den er, og appen har nettets setning for hver.
 *
 *   200 { ok: true } · 403 not_allowed · 404 not_found · 409 regler · 500 serverens feil
 */
export function lineupAnswer(result: CupLineupActionError): NextResponse {
  if (!result.error) return NextResponse.json({ ok: true });
  const { error } = result;
  if (error === 'not_allowed') return NextResponse.json({ error }, { status: 403 });
  if (error === 'not_found') return NextResponse.json({ error }, { status: 404 });
  return NextResponse.json({ error }, { status: SERVER_CODES.has(error) ? 500 : 409 });
}
