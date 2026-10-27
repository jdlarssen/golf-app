import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { endGameCore } from '@/lib/games/endGameCore';
import { readSimulatorLeagueFlight } from './leagueFlight';

/**
 * What the last approval did to a simulator-league flight (#2661).
 *  - `not_simulator`: not a simulator-league flight; the caller goes on as
 *    before (the organiser's «Alle har levert»);
 *  - `waiting`: a card in the flight is not delivered or not approved yet;
 *  - `finished`: the flight is finished and counts in the table;
 *  - `failed`: a read or the finish failed. Logged; the flight stays active,
 *    and the player can still finish it themselves.
 */
export type SimulatorFlightFinish = 'not_simulator' | 'waiting' | 'finished' | 'failed';

/**
 * The owner's answer 2026-10-27: «Ja, av seg selv». When the marker approves
 * the last card in a simulator-league flight, the flight finishes on its own,
 * so the round counts without the player coming back to tap «Avslutt». Only
 * here: every other game is still finished by its organiser (the owner's rule
 * of 2026-09-25, «ingenting avslutter et spill av seg selv»).
 *
 * The finish is the real pipeline (`endGameCore`, through the admin client:
 * the marker is not the game's creator), so the finish gate decides: a card
 * not delivered or not approved yet answers `waiting`, nothing is written. A
 * finish that lost the race to the player's own tap is `finished` too.
 * The finish pipeline sends the players «Resultatet er klart» as for any
 * finished game.
 * Never throws: the approval it follows is already written.
 */
export async function finishSimulatorFlightIfApproved(
  gameId: string,
  approverUserId: string,
): Promise<SimulatorFlightFinish> {
  try {
    const flight = await readSimulatorLeagueFlight(gameId);
    if (!flight) return 'not_simulator';

    const { data: approver } = await getAdminClient()
      .from('users')
      .select('name')
      .eq('id', approverUserId)
      .maybeSingle<{ name: string | null }>();
    const result = await endGameCore(
      getAdminClient(),
      gameId,
      { id: approverUserId, name: approver?.name?.trim() || 'Markør' },
      { logContext: 'finishSimulatorFlight' },
    );
    // `not_active`: the player's own «Avslutt» got there first.
    if (result.ok || result.reason === 'not_active') return 'finished';
    if (result.reason === 'not_all_submitted' || result.reason === 'not_all_approved') {
      return 'waiting';
    }
    console.error('[finishSimulatorFlight] finish refused', { gameId, reason: result.reason });
    return 'failed';
  } catch (err) {
    console.error('[finishSimulatorFlight] finish threw', { gameId, err });
    return 'failed';
  }
}
