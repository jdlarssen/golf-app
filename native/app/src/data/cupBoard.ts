// native/app/src/data/cupBoard.ts
// #2752: tavla til en ferdig kamp du ikke spilte (eierens svar 02.11). RLS gir en
// spiller bare egne kamper (#1542), så radene kommer fra serveren, med samme fasong
// som appen selv leser. Krever nett, og lagres ikke: kampen er ikke din.
//
// **Wire-kontrakten** står i `app/api/cup/[id]/matches/[gameId]/board/route.ts`.
import type { CupMatchBoardResponse } from '../../../../lib/games/gameBundleRows';
import type { LocalScore } from './db';
import { toBundle, type GameBundle } from './gameBundle';
import { callWebRoute } from './webApi';

export type CupBoardResult =
  | { ok: true; bundle: GameBundle; scores: LocalScore[] }
  | { ok: false; reason: 'not_found' | 'unauthorized' | 'offline' | 'load_failed' };

export async function fetchCupMatchBoard(cupId: string, gameId: string): Promise<CupBoardResult> {
  const call = await callWebRoute(
    `/api/cup/${encodeURIComponent(cupId)}/matches/${encodeURIComponent(gameId)}/board`,
    'GET',
  );
  if (!call.ok) return { ok: false, reason: 'offline' };
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 404) return { ok: false, reason: 'not_found' };
  if (call.status !== 200) return { ok: false, reason: 'load_failed' };
  const body = call.body as Partial<CupMatchBoardResponse>;
  if (!body.game || !Array.isArray(body.players) || !Array.isArray(body.scores)) {
    return { ok: false, reason: 'load_failed' };
  }
  return {
    ok: true,
    bundle: toBundle(body.game, body.players, {
      segmentSibling: null,
      sourceGameName: body.sourceGameName ?? null,
    }),
    // Bare det tavla leser. Ingen av disse radene skrives til telefonen.
    scores: body.scores.map((row) => ({
      id: `${gameId}:${row.user_id}:${row.hole_number}`,
      gameId,
      userId: row.user_id,
      holeNumber: row.hole_number,
      strokes: row.strokes,
      putts: null,
      enteredBy: row.user_id,
      clientUpdatedAt: '',
      serverUpdatedAt: null,
    })),
  };
}
