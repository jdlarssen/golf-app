import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/Skeleton';
import { LinkButton } from '@/components/ui/Button';
import { holeNumbersForSegment } from '@/lib/games/holeScope';
import type { HoleSegment } from '@/lib/scoring';
import { getGameContext } from './gameContext';

type UiState =
  | 'not_started'
  | 'in_progress'
  | 'ready_to_submit'
  | 'submitted_pending_approval'
  | 'submitted_approved';

function computeState(opts: {
  strokesCount: number;
  totalHoles: number;
  submittedAt: string | null;
  approvedAt: string | null;
  requirePeerApproval: boolean;
}): UiState {
  const { strokesCount, totalHoles, submittedAt, approvedAt, requirePeerApproval } = opts;
  if (submittedAt) {
    if (requirePeerApproval && !approvedAt) {
      return 'submitted_pending_approval';
    }
    return 'submitted_approved';
  }
  if (strokesCount === 0) return 'not_started';
  if (strokesCount >= totalHoles) return 'ready_to_submit';
  return 'in_progress';
}

export async function PrimaryCtaSection({
  gameId,
  currentUserId,
  submittedAt,
  approvedAt,
  requirePeerApproval,
  holeSegment,
}: {
  gameId: string;
  currentUserId: string;
  submittedAt: string | null;
  approvedAt: string | null;
  requirePeerApproval: boolean;
  /** #1441: limits «all holes filled» + the next-hole scan to the game's segment. */
  holeSegment: HoleSegment;
}) {
  const { supabase } = await getGameContext();

  const { data: filledRows } = await supabase
    .from('scores')
    .select('hole_number')
    .eq('game_id', gameId)
    .eq('user_id', currentUserId)
    .not('strokes', 'is', null);
  const filledHoles = (filledRows ?? []).map((r) => r.hole_number);
  const strokesCount = filledHoles.length;

  // Issue #164: «Fortsett runden»-knappen skal peke på første tomme hull,
  // ikke hardkodet hull 1. #1441: scanner segmentets hull-numre i stedet for
  // en hardkodet 1..18-løkke — på et back9-spill ville 1..18 startet på hull
  // 1, som ligger utenfor spillets scope. Ved full runde havner vi i
  // ready_to_submit-state og denne verdien brukes ikke (CTA-en routes til
  // /submit i stedet).
  const segmentHoles = holeNumbersForSegment(holeSegment);
  const filledSet = new Set(filledHoles);
  let nextHole = segmentHoles[0];
  for (const h of segmentHoles) {
    if (!filledSet.has(h)) {
      nextHole = h;
      break;
    }
  }

  const state = computeState({
    strokesCount,
    totalHoles: segmentHoles.length,
    submittedAt,
    approvedAt,
    requirePeerApproval,
  });

  return (
    <PrimaryCta
      gameId={gameId}
      state={state}
      strokesCount={strokesCount}
      totalHoles={segmentHoles.length}
      nextHole={nextHole}
    />
  );
}

export function PrimaryCtaSkeleton() {
  return <Skeleton className="h-12 w-full rounded-full" />;
}

function PrimaryCta({
  gameId,
  state,
  strokesCount,
  totalHoles,
  nextHole,
}: {
  gameId: string;
  state: UiState;
  strokesCount: number;
  /** #1441: holes in the game's scope — 9 for front9/back9, 18 for 'full'. */
  totalHoles: number;
  nextHole: number;
}) {
  const t = useTranslations('game.home');
  const subtext =
    state === 'in_progress' || state === 'ready_to_submit'
      ? t('ctaHolesFilled', { count: strokesCount, total: totalHoles })
      : null;

  if (state === 'not_started') {
    return (
      <LinkButton href={`/games/${gameId}/holes/${nextHole}`} full>
        {t('ctaStartRound')}
      </LinkButton>
    );
  }

  if (state === 'in_progress') {
    return (
      <div className="space-y-1.5">
        <LinkButton href={`/games/${gameId}/holes/${nextHole}`} full>
          {t('ctaContinueRound')}
        </LinkButton>
        {subtext && (
          <p className="text-center text-xs text-muted tabular-nums">
            {subtext}
          </p>
        )}
      </div>
    );
  }

  if (state === 'ready_to_submit') {
    return (
      <div className="space-y-1.5">
        <LinkButton href={`/games/${gameId}/submit`} full>
          {t('ctaReviewAndSubmit')}
        </LinkButton>
        {subtext && (
          <p className="text-center text-xs text-muted tabular-nums">
            {subtext}
          </p>
        )}
      </div>
    );
  }

  if (state === 'submitted_pending_approval') {
    return (
      <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted text-center">
        {t('ctaSubmittedPendingApproval')}
      </div>
    );
  }

  // submitted_approved
  return (
    <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted text-center">
      {t('ctaSubmittedApproved')}
    </div>
  );
}
