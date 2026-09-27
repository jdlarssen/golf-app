import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { startDerivedGames } from '@/lib/games/syncDerivedGamesStatus';
import { notifyPlayersGameStarted } from '@/lib/notifications/events';

/**
 * Det som skal skje når en arrangør vant start-flippen med et trykk (#2215):
 * start de avledede spillene (#1441 D3) og send `game_started` til alle aktive
 * spillere unntatt den som trykket (#502).
 *
 * Flyttet fra `startScheduledGameAction` (webbens «Start runden nå») da appen
 * fikk `POST /api/games/[id]/start`. Begge kaller hit, så de to trykk-veiene
 * kan ikke drifte. E1-fallbacken på spill-hjem (kjører i `after()` fordi den
 * starter under render) og cron-sweepen (ingen aktør, og ett varsel per spiller
 * per cup) har egne varianter som ikke er samlet her.
 *
 * Egen fil, ikke i `startScheduledGame.ts`: `syncDerivedGamesStatus.ts`
 * importerer alt `startScheduledGame`, så en import tilbake ville gitt en sirkel.
 *
 * **Kall kun ved `started: true`.** Taperen av et kappløp (cron, E1, et annet
 * trykk) har `started: false`, og vinneren eier utsendingen — ellers dobles
 * varslene.
 *
 * Best-effort, kaster aldri: runden ER startet når vi er her, og en feil i
 * etterarbeidet skal ikke gjøre en vellykket start til en feilmelding. De to
 * stegene har hver sin fangst, så et kast i det ene ikke tar det andre med seg.
 */
export async function announceStartedGame(
  client: SupabaseClient<Database>,
  gameId: string,
  actorUserId: string,
  logPrefix: string,
): Promise<void> {
  try {
    await startDerivedGames(client, gameId);
  } catch (err) {
    console.error(`[${logPrefix}] derived games start threw`, { gameId, err });
  }

  try {
    const [gameRes, rosterRes] = await Promise.all([
      client
        .from('games')
        .select('name, source_game_id')
        .eq('id', gameId)
        .single<{ name: string; source_game_id: string | null }>(),
      client
        .from('game_players')
        .select('user_id')
        .eq('game_id', gameId)
        .is('withdrawn_at', null)
        .returns<{ user_id: string }[]>(),
    ]);
    if (!gameRes.data || !rosterRes.data) {
      // Navnet eller rosteret mangler: varselet hoppes over, starten står.
      console.error(`[${logPrefix}] game_started skipped: game or roster read failed`, {
        gameId,
        gameError: gameRes.error,
        rosterError: rosterRes.error,
      });
      return;
    }
    await notifyPlayersGameStarted(
      rosterRes.data.filter((p) => p.user_id !== actorUserId),
      // #1450: et avledet spill varsler aldri seg selv — verten eier
      // cup-start-varselet.
      {
        id: gameId,
        name: gameRes.data.name,
        sourceGameId: gameRes.data.source_game_id,
      },
      logPrefix,
    );
  } catch (err) {
    console.error(`[${logPrefix}] game_started fan-out threw`, { gameId, err });
  }
}
