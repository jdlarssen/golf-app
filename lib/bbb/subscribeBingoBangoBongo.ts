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
 * Subscriber til alle event-typer (INSERT, UPDATE, DELETE) men UI bryr
 * seg primært om INSERT + UPDATE. DELETE skjer kun i admin-rebooting-
 * scenarier; vi propagerer dem så caller kan invalidere local state.
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
