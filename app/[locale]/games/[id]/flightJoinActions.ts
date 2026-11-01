'use server';

import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { joinFlightCore, type JoinFlightError } from '@/lib/games/joinFlight';

export type FlightJoinResult =
  | { ok: true }
  | { ok: false; error: FlightJoinError };

export type FlightJoinError = 'not_authed' | JoinFlightError;

/**
 * Spiller velger eller bytter flight selv i venterommet (#543).
 *
 * The wrapper is the login gate. The rule lives in `lib/games/joinFlight.ts`
 * (#2750), which the app's route calls too.
 */
export async function joinFlight(
  gameId: string,
  targetFlight: number,
): Promise<FlightJoinResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return { ok: false, error: 'not_authed' };

  return joinFlightCore(gameId, userId, targetFlight);
}
