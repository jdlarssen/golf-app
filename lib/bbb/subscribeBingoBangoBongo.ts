import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';

/**
 * Row-shape vi får fra Supabase Realtime for `bingo_bango_bongo_holes`. Mappes
 * til discovery-friendly shape før vi propagerer til callback-en.
 */
type BingoBangoBongoRowFromDb = {
  game_id: string;
  hole_number: number;
  bingo_user_id: string | null;
  bango_user_id: string | null;
  bongo_user_id: string | null;
};

export interface BingoBangoBongoChange {
  holeNumber: number;
  bingoUserId: string | null;
  bangoUserId: string | null;
  bongoUserId: string | null;
}

/**
 * Subscribe to bingo_bango_bongo_holes changes for one game.
 *
 * Channel setup, auth handoff og leak-resistant teardown er identisk med
 * `subscribeWolfChoices`-mønsteret. Brukes av BingoBangoBongoEntry (når
 * `gameMode === 'bingo_bango_bongo'`) for å oppdatere valgte spillere i sanntid
 * når en flight-spiller registrerer Bingo/Bango/Bongo på sin device.
 *
 * Listens to every event type (`event: '*'`), but in practice only INSERT and
 * UPDATE arrive: every write is an upsert (web and app), and clearing Bingo,
 * Bango or Bongo is an UPDATE that writes NULL, which reaches `onChange` like
 * any other change. A DELETE only happens through an FK cascade (the game, or
 * a hard-deleted entered_by user) or manual SQL. Supabase documents that DELETE
 * events cannot be filtered in Postgres Changes, and a DELETE payload carries
 * `new: {}`, so the guard below drops it. Nothing is propagated for DELETE
 * (#1968).
 */
export function subscribeBingoBangoBongo(
  gameId: string,
  onChange: (change: BingoBangoBongoChange) => void,
): () => void {
  return subscribeRealtimeChannel(`bbb-holes:${gameId}`, (channel) =>
    channel.on(
      'postgres_changes' as never,
      {
        event: '*',
        schema: 'public',
        table: 'bingo_bango_bongo_holes',
        filter: `game_id=eq.${gameId}`,
      } as never,
      ((payload: {
        new?: BingoBangoBongoRowFromDb;
        old?: BingoBangoBongoRowFromDb;
      }) => {
        const row = payload.new ?? payload.old;
        if (!row || row.hole_number == null) return;
        onChange({
          holeNumber: row.hole_number,
          bingoUserId: row.bingo_user_id ?? null,
          bangoUserId: row.bango_user_id ?? null,
          bongoUserId: row.bongo_user_id ?? null,
        });
      }) as never,
    ),
  );
}
