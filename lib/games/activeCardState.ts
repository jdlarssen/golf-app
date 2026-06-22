/**
 * Resolves the display state of an *active* game on the Home «Pågår nå» card
 * (#878). Pure mirror of the spill-hjem state machine (`PrimaryCta.computeState`
 * + the withdrawn branch at `(home)/page.tsx`), kept side-effect-free so the
 * home card and its unit test can share one source of truth.
 *
 * Precedence matches spill-hjem: a withdrawn player is out regardless of any
 * earlier submission, so `withdrawn` wins over `submitted`.
 */
export type ActiveCardState =
  | 'continue' // active, not yet submitted → «Fortsett»
  | 'submitted' // submitted, and either no peer approval needed or already approved → «Levert ✓»
  | 'pending_approval' // submitted, peer approval required and not yet given → «Til godkjenning»
  | 'withdrawn'; // player withdrew → «Trukket»

export function resolveActiveCardState(row: {
  submitted_at: string | null;
  withdrawn_at: string | null;
  approved_at: string | null;
  require_peer_approval: boolean;
}): ActiveCardState {
  if (row.withdrawn_at != null) return 'withdrawn';
  if (row.submitted_at != null) {
    if (row.require_peer_approval && row.approved_at == null) {
      return 'pending_approval';
    }
    return 'submitted';
  }
  return 'continue';
}
