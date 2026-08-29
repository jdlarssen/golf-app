import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/Skeleton';
import { LinkButton } from '@/components/ui/Button';
import { firstHoleForSegment, holeNumbersForSegment } from '@/lib/games/holeScope';
import { findSegmentSibling } from '@/lib/games/segmentSibling';
import { scoredHoleNumbers, scoreOwnerUserIds } from '@/lib/games/scoreOwner';
import type { GameMode } from '@/lib/scoring/modes/types';
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
  tournamentId,
  gameMode,
  teamScoreOwnerId,
}: {
  gameId: string;
  currentUserId: string;
  submittedAt: string | null;
  approvedAt: string | null;
  requirePeerApproval: boolean;
  /** #1441: limits «all holes filled» + the next-hole scan to the game's segment. */
  holeSegment: HoleSegment;
  /**
   * #1441 (owner-QA finding B): non-null only for cup matches. Only used to
   * look up the front9 ⇄ back9 sibling so a finished front9 host's CTA can
   * continue into hole 10 instead of dead-ending on the static "submitted"
   * message. Callers only ever render this section for HOST games (the
   * derived-game branch on game-home is a separate, earlier branch), so no
   * extra `sourceGameId` check is needed here.
   */
  tournamentId: string | null;
  /** #1624: needed to resolve whose scores rows complete the round. */
  gameMode: GameMode;
  /**
   * #1624: the captain owning the team's shared rows (lex-min, #1538), null
   * when the viewer has no team or the mode never collapses. Computed by the
   * caller from the already-loaded gwp.players — no extra fetch here.
   */
  teamScoreOwnerId: string | null;
}) {
  const { supabase } = await getGameContext();

  // #1624: in the team-collapsed modes (scramble family, alternate-shot
  // matchplay, patsome from hole 7) the captain owns the team's scores rows —
  // a non-captain has none of their own, so counting `eq(user_id, me)` never
  // reached ready_to_submit. Same figure as the hole page (#1577/PR #1625):
  // fetch both ids' rows, then keep only the row the per-hole owner rule
  // points at — the captain's row counts only where the mode collapses
  // (patsome's 4BBB half does not).
  const { data: filledRows } = await supabase
    .from('scores')
    .select('hole_number, user_id')
    .eq('game_id', gameId)
    .in('user_id', scoreOwnerUserIds(gameMode, currentUserId, teamScoreOwnerId))
    .not('strokes', 'is', null);
  const filledHoles = scoredHoleNumbers(
    (filledRows ?? []).map((r) => ({
      holeNumber: r.hole_number,
      userId: r.user_id,
    })),
    gameMode,
    currentUserId,
    teamScoreOwnerId,
  );
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

  // #1441 (owner-QA finding B) + #1466 §2: a front9 host otherwise dead-ends
  // here — either the static "waiting for approval"/"approved" message once
  // submitted, or a deliver-CTA that shouldn't exist in broModus. When the
  // player has a back9 sibling, resolve it so the CTA can continue into hole 10
  // instead. Scoped tight: only the front9→back9 direction (a finished back9 is
  // genuinely the end of the round). #1466 extends the lookup to
  // 'ready_to_submit' too — in broModus (sibling undelivered) that state shows
  // the bridge as the PRIMARY action instead of «Se over og lever».
  const siblingMatch =
    tournamentId != null &&
    holeSegment === 'front9' &&
    (state === 'submitted_pending_approval' ||
      state === 'submitted_approved' ||
      state === 'ready_to_submit')
      ? await findSegmentSibling(currentUserId, {
          gameId,
          holeSegment,
          sourceGameId: null,
          tournamentId,
        })
      : null;
  const sibling = siblingMatch
    ? {
        gameId: siblingMatch.gameId,
        gameMode: siblingMatch.gameMode,
        holeNumber: firstHoleForSegment('back9'),
        mySubmittedAt: siblingMatch.mySubmittedAt,
      }
    : null;

  return (
    <PrimaryCta
      gameId={gameId}
      state={state}
      strokesCount={strokesCount}
      totalHoles={segmentHoles.length}
      nextHole={nextHole}
      sibling={sibling}
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
  sibling,
}: {
  gameId: string;
  state: UiState;
  strokesCount: number;
  /** #1441: holes in the game's scope — 9 for front9/back9, 18 for 'full'. */
  totalHoles: number;
  nextHole: number;
  /** #1441 (owner-QA finding B) + #1466 §2: resolved back9 sibling, set for a
   *  submitted OR ready-to-submit front9 host. `mySubmittedAt` gates broModus:
   *  when null the ready_to_submit state shows the bridge as the primary CTA.
   *  Null everywhere else — see `PrimaryCtaSection`. */
  sibling: {
    gameId: string;
    gameMode: GameMode;
    holeNumber: number;
    mySubmittedAt: string | null;
  } | null;
}) {
  const t = useTranslations('game.home');
  const tModes = useTranslations('modes');
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
    // #1466 §2 (broModus): a front9 host whose back9 sibling is undelivered
    // never delivers here — the whole round is delivered once, on the back9
    // host. Show the bridge to hole 10 as the PRIMARY action instead of «Se
    // over og lever». Self-heals: once the sibling is delivered (mySubmittedAt
    // set — e.g. the front9 card was rejected after the cascade), broModus is
    // false and the deliver-CTA returns.
    if (sibling && sibling.mySubmittedAt == null) {
      return (
        <div className="space-y-1.5">
          <LinkButton
            href={`/games/${sibling.gameId}/holes/${sibling.holeNumber}`}
            full
          >
            {t('ctaContinueToSibling', {
              hole: sibling.holeNumber,
              format: tModes(sibling.gameMode as Parameters<typeof tModes>[0]),
            })}
          </LinkButton>
          {subtext && (
            <p className="text-center text-xs text-muted tabular-nums">
              {subtext}
            </p>
          )}
        </div>
      );
    }
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
      <div className="space-y-1.5">
        <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted text-center">
          {t('ctaSubmittedPendingApproval')}
        </div>
        {sibling && (
          <LinkButton
            href={`/games/${sibling.gameId}/holes/${sibling.holeNumber}`}
            variant="secondary"
            full
          >
            {t('ctaContinueToSibling', {
              hole: sibling.holeNumber,
              format: tModes(sibling.gameMode as Parameters<typeof tModes>[0]),
            })}
          </LinkButton>
        )}
      </div>
    );
  }

  // submitted_approved
  return (
    <div className="space-y-1.5">
      <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted text-center">
        {t('ctaSubmittedApproved')}
      </div>
      {sibling && (
        <LinkButton
          href={`/games/${sibling.gameId}/holes/${sibling.holeNumber}`}
          variant="secondary"
          full
        >
          {t('ctaContinueToSibling', {
            hole: sibling.holeNumber,
            format: tModes(sibling.gameMode as Parameters<typeof tModes>[0]),
          })}
        </LinkButton>
      )}
    </div>
  );
}
