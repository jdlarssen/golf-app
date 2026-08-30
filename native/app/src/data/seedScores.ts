// Native N3 (#1825): hent gjeldende serververdier for et spill og la dem gå inn
// i den lokale basen gjennom SAMME merge realtime bruker.
//
// Generalisering av N2s `seedFromServer` (som satt fast i Sync-laben og bare
// dekket hull 1–3). Ingen filtrering på hull eller spiller: RLS avgjør hva
// enheten får se — egne rader, flight-makkere i et aktivt spill, alt i et
// ferdig spill man selv var med i. Å filtrere her i tillegg ville bare skjult
// rader appen har lov til å vise.
//
// LWW er fortsatt den eneste veien server-data kommer inn lokalt: hver rad går
// gjennom `mergeServerScore`, som dropper alt som ikke er strengt nyere. En seed
// kan derfor aldri kaste et slag spilleren nettopp tastet offline.
import { currentDeviceUserId, supabase } from '../supabase';
import { mergeServerScore } from './realtime';

const SCORE_SELECT =
  'game_id, user_id, hole_number, strokes, putts, entered_by, client_updated_at, updated_at';

/**
 * Sync ned alle synlige scores for spillet. Returnerer antall rader som ble
 * vurdert (ikke antall som vant — de fleste seed-radene er alt kjent).
 */
export async function seedGameScores(gameId: string): Promise<number> {
  const { data, error } = await supabase
    .from('scores')
    .select(SCORE_SELECT)
    .eq('game_id', gameId);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return 0;

  // Slås opp ÉN gang for hele seeden, ikke per rad: konflikt-regelen trenger
  // den, og en auth-tur per hull ville vært 18 turer for ingenting.
  const currentUserId = await currentDeviceUserId();

  for (const row of data) {
    await mergeServerScore(
      {
        gameId: row.game_id,
        userId: row.user_id,
        holeNumber: row.hole_number,
        strokes: row.strokes,
        putts: row.putts ?? null,
        enteredBy: row.entered_by,
        clientUpdatedAt: row.client_updated_at,
        serverUpdatedAt: row.updated_at,
      },
      currentUserId,
    );
  }

  return data.length;
}
