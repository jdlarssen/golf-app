// Native N3 (#1825): speil av webbens `computeState` i
// `app/[locale]/games/[id]/(home)/PrimaryCta.tsx`.
//
// Funksjonen kunne ikke deles: den bor inne i en server-komponent i
// app-router-katalogen, som drar med seg `next-intl` og resten av web-grafen.
// Kopien er derfor tynn med vilje — fem grener, ingen egen tolkning — og
// testet gren for gren, slik at et avvik fra webben dukker opp som en rød test
// og ikke som to flater som sier ulike ting om samme kort.
//
// Rekkefølgen på grenene ER regelen: levert slår alt annet, så en spiller som
// har levert med hull igjen aldri får «Fortsett»-knappen tilbake.

export type PrimaryCtaState =
  | 'not_started'
  | 'in_progress'
  | 'ready_to_submit'
  | 'submitted_pending_approval'
  | 'submitted_approved';

export function computePrimaryCtaState(opts: {
  /** Antall hull spilleren har slag på. */
  strokesCount: number;
  /** Hull i spillets scope — 18 i appen (segment-spill gates bort). */
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

/**
 * Hullet «Fortsett runden» skal peke på: det første uten slag (#164).
 *
 * Faller tilbake til første hull når alt er fylt — samme som webben. Den
 * verdien brukes uansett ikke da, for spilleren er i `ready_to_submit` og
 * CTA-en peker på scorekortet.
 */
export function nextUnfilledHole(
  filledHoles: readonly number[],
  totalHoles = 18,
): number {
  const filled = new Set(filledHoles);
  for (let hole = 1; hole <= totalHoles; hole += 1) {
    if (!filled.has(hole)) return hole;
  }
  return 1;
}
