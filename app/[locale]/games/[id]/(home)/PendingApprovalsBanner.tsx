import { getTranslations } from 'next-intl/server';
import { Banner } from '@/components/ui/Banner';
import { SmartLink } from '@/components/ui/SmartLink';
import { isSingleFlightGame } from '@/lib/games/flightScope';
import type { GameMode } from '@/lib/scoring/modes/types';
import { getGameContext } from './gameContext';

type FlightMatePlayerRow = {
  user_id: string;
  flight_number: number;
  submitted_at: string | null;
  approved_at: string | null;
};

export async function PendingApprovalsBanner({
  gameId,
  gameMode,
  flightNumber,
  currentUserId,
  requirePeerApproval,
  isActive,
}: {
  gameId: string;
  gameMode: GameMode;
  flightNumber: number | null;
  currentUserId: string;
  requirePeerApproval: boolean;
  isActive: boolean;
}) {
  if (!requirePeerApproval || !isActive) return null;

  const { supabase } = await getGameContext();
  // Hent alle aktive spillere for å avgjøre singleFlight.
  const { data: allMates } = await supabase
    .from('game_players')
    .select('user_id, flight_number, submitted_at, approved_at, withdrawn_at')
    .eq('game_id', gameId)
    .returns<(FlightMatePlayerRow & { withdrawn_at: string | null })[]>();

  // #543: én-flight-regelen — alle i spillet er attestanter.
  const singleFlight = isSingleFlightGame(
    gameMode,
    (allMates ?? []).map((m) => ({
      user_id: m.user_id,
      flight_number: m.flight_number,
      withdrawn_at: m.withdrawn_at,
    })),
  );
  const mates = singleFlight
    ? (allMates ?? [])
    : (allMates ?? []).filter(
        (m) =>
          flightNumber != null && m.flight_number === flightNumber,
      );

  const pendingApprovalsForMe = (mates ?? []).filter(
    (m) =>
      m.user_id !== currentUserId &&
      m.submitted_at != null &&
      m.approved_at == null,
  ).length;

  if (pendingApprovalsForMe === 0) return null;

  const tHome = await getTranslations('game.home');
  return (
    <div className="mb-4">
      <Banner tone="info">
        <div className="flex items-center justify-between gap-3">
          <span>
            {tHome('pendingApprovals', { count: pendingApprovalsForMe })}
          </span>
          <SmartLink
            href={`/games/${gameId}/approve`}
            className="text-sm font-medium text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary whitespace-nowrap"
          >
            {tHome('reviewLink')}
          </SmartLink>
        </div>
      </Banner>
    </div>
  );
}
