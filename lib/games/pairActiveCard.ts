import type { ActiveCardExtras } from './getActiveGameCardData';
import type { ActiveCardState } from './activeCardState';

/**
 * Merges the two host halves of a split cup day (#1449) into ONE active Home
 * card's state + route. Pure — the per-half `ActiveCardExtras` come from the
 * shared `getActiveGameCardData` (one source of truth for card state), and this
 * only folds the pair together.
 */

/**
 * The pair's state is its EARLIEST stage, so the card keeps sending the player
 * forward: any half still `continue` (holes left, or filled-but-undelivered)
 * keeps the whole round in «Fortsett»; otherwise a pending approval outranks a
 * plain submit; both submitted → submitted; both withdrawn → withdrawn.
 */
export function mergePairState(
  front9: ActiveCardState,
  back9: ActiveCardState,
): ActiveCardState {
  if (front9 === 'continue' || back9 === 'continue') return 'continue';
  if (front9 === 'pending_approval' || back9 === 'pending_approval') {
    return 'pending_approval';
  }
  if (front9 === 'submitted' || back9 === 'submitted') return 'submitted';
  return 'withdrawn';
}

export function mergePairExtras(
  front9: { id: string; extras: ActiveCardExtras },
  back9: { id: string; extras: ActiveCardExtras },
): ActiveCardExtras {
  const state = mergePairState(front9.extras.state, back9.extras.state);

  let href: string;
  if (
    state === 'continue' &&
    front9.extras.state === 'continue' &&
    front9.extras.nextHole != null
  ) {
    // Still scoring the front nine — the player starts on hole 1 and works up.
    href = `/games/${front9.id}/holes/${front9.extras.nextHole}`;
  } else if (
    state === 'continue' &&
    back9.extras.state === 'continue' &&
    back9.extras.nextHole != null
  ) {
    // Front nine done, back nine still open — cross into the back9 host.
    href = `/games/${back9.id}/holes/${back9.extras.nextHole}`;
  } else {
    // All 18 filled (deliver), or already delivered / awaiting approval: the
    // round's one home is the back9 host, where the single delivery for BOTH
    // halves happens. #1466 Builder B: one-delivery lands here.
    href = `/games/${back9.id}`;
  }

  return {
    state,
    href,
    pendingApprovalsForMe:
      front9.extras.pendingApprovalsForMe + back9.extras.pendingApprovalsForMe,
    nextHole: null,
  };
}
