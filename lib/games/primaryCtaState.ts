// The state behind a game home's primary button (#2228): one home, read by
// the web's `PrimaryCta.tsx` and the native app's game home and Home cards.
// Import-free on purpose, so Metro can bundle it.
//
// The order of the branches IS the rule: submitted beats everything else, so a
// player who submitted with holes left never gets «Fortsett» back.

export type PrimaryCtaState =
  | 'not_started'
  | 'in_progress'
  | 'ready_to_submit'
  | 'submitted_pending_approval'
  | 'submitted_approved';

export function computePrimaryCtaState(opts: {
  /** Number of holes the player has strokes on. */
  strokesCount: number;
  /** Holes in the game's scope: 9 for front9/back9, 18 for 'full'. */
  totalHoles: number;
  submittedAt: string | null;
  approvedAt: string | null;
  requirePeerApproval: boolean;
}): PrimaryCtaState {
  const { strokesCount, totalHoles, submittedAt, approvedAt, requirePeerApproval } =
    opts;
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
