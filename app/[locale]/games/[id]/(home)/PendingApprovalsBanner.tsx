import { getTranslations } from 'next-intl/server';
import { Banner } from '@/components/ui/Banner';
import { SmartLink } from '@/components/ui/SmartLink';
import { pendingApprovalsFor } from '@/lib/games/flightScope';
import type { GameMode } from '@/lib/scoring/modes/types';
import { getGameContext } from './gameContext';

type FlightMatePlayerRow = {
  user_id: string;
  flight_number: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
};

export async function PendingApprovalsBanner({
  gameId,
  gameMode,
  currentUserId,
  requirePeerApproval,
  isActive,
}: {
  gameId: string;
  gameMode: GameMode;
  currentUserId: string;
  requirePeerApproval: boolean;
  isActive: boolean;
}) {
  if (!requirePeerApproval || !isActive) return null;

  const { supabase } = await getGameContext();
  // Hele rosteret — attestant-regelen trenger både flight og withdrawn_at.
  const { data: allMates } = await supabase
    .from('game_players')
    .select('user_id, flight_number, submitted_at, approved_at, withdrawn_at')
    .eq('game_id', gameId)
    .returns<FlightMatePlayerRow[]>();

  // #543/#1359: samme selektor som /approve-siden bruker, så telleren i
  // banneret og lista på siden aldri kan si ulike ting.
  const pendingApprovalsForMe = pendingApprovalsFor(
    allMates ?? [],
    gameMode,
    currentUserId,
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
