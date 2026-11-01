// Native N3 (#1825): hullet «Fortsett runden» peker på.
//
// Selve CTA-tilstanden (`computePrimaryCtaState`) bor i
// `lib/games/primaryCtaState.ts`, delt med webbens PrimaryCta (#2228).

const ALL_HOLES: readonly number[] = Array.from({ length: 18 }, (_, i) => i + 1);

/**
 * Hullet «Fortsett runden» skal peke på: det første uten slag (#164).
 *
 * Faller tilbake til første hull når alt er fylt — samme som webben. Den
 * verdien brukes uansett ikke da, for spilleren er i `ready_to_submit` og
 * CTA-en peker på scorekortet.
 *
 * `holes` er hullene spillet eier (#2752): andre halvdel av en delt cup-dag
 * starter på hull 10.
 */
export function nextUnfilledHole(
  filledHoles: readonly number[],
  holes: readonly number[] = ALL_HOLES,
): number {
  const filled = new Set(filledHoles);
  return holes.find((hole) => !filled.has(hole)) ?? holes[0];
}
