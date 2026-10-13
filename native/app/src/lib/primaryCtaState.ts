// Native N3 (#1825): hullet «Fortsett runden» peker på.
//
// Selve CTA-tilstanden (`computePrimaryCtaState`) bor i
// `lib/games/primaryCtaState.ts`, delt med webbens PrimaryCta (#2228).

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
