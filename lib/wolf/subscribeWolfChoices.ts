import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';
import type { WolfChoice } from '@/lib/scoring/modes/types';

/**
 * Row-shape vi får fra Supabase Realtime for `wolf_hole_choices`. Mappes
 * til discovery-friendly shape før vi propagerer til callback-en.
 */
type WolfChoiceRowFromDb = {
  game_id: string;
  hole_number: number;
  wolf_user_id: string;
  choice: WolfChoice;
  partner_user_id: string | null;
};

export interface WolfChoiceChange {
  holeNumber: number;
  wolfUserId: string;
  choice: WolfChoice;
  partnerUserId: string | null;
}

/**
 * Subscribe to wolf_hole_choices changes for one game.
 *
 * Channel setup, auth handoff og leak-resistant teardown er identisk med
 * `subscribeGameScores`-mønsteret. Brukes av HoleClient (når
 * `gameMode === 'wolf'`) for å oppdatere wolf-badge i sanntid når Wolf-
 * spilleren velger partner/lone/blind på sin device.
 *
 * Subscriber til alle event-typer (INSERT, UPDATE, DELETE) men UI bryr
 * seg primært om INSERT + UPDATE. DELETE skjer kun i admin-rebooting-
 * scenarier; vi propagerer dem så caller kan invalidere local state.
 */
export function subscribeWolfChoices(
  gameId: string,
  onChange: (change: WolfChoiceChange) => void,
): () => void {
  return subscribeRealtimeChannel(`wolf-choices:${gameId}`, (channel) =>
    channel.on(
      'postgres_changes' as never,
      {
        event: '*',
        schema: 'public',
        table: 'wolf_hole_choices',
        filter: `game_id=eq.${gameId}`,
      } as never,
      ((payload: { new?: WolfChoiceRowFromDb; old?: WolfChoiceRowFromDb }) => {
        const row = payload.new ?? payload.old;
        if (!row || row.hole_number == null || !row.wolf_user_id) return;
        onChange({
          holeNumber: row.hole_number,
          wolfUserId: row.wolf_user_id,
          choice: row.choice,
          partnerUserId: row.partner_user_id ?? null,
        });
      }) as never,
    ),
  );
}
