// Hva Wolf-valget er verdt på et hull (#2313).
//
// Et delt hull gjør neste hull dyrere: innsatsen går fra 1 til 2, så 3, og
// gevinsten ganges med den. Valget og kontekstlinja må vise det tavla faktisk
// gir, ellers lover appen halvparten etter ett delt hull.
//
// Motorens hjem for regelen er `buildHoleRow` i `lib/scoring/modes/wolf.ts`,
// og motoren leser ikke denne fila. At de to gir samme tall, låses i
// `lib/scoring/modes/wolf.test.ts` («gevinsten er enig med wolfPayout»).
//
// Ingen `@/`-importer og ingen runtime-avhengigheter: appen (`native/app`)
// leser fila med relativ sti, akkurat som `wolfRotation.ts`.

/** Gevinsten til vinnersiden for hvert av de tre valgene. */
export type WolfPayout = {
  /** Partner-valg: hver av de to på vinnersiden får dette. */
  partnerEach: number;
  /** Lone Wolf som vinner. */
  lone: number;
  /** Blind Wolf som vinner. */
  blind: number;
};

/**
 * Gevinsten med `n` spillere (3–5) og innsatsen på hullet.
 *
 * Partner gir 2 × innsats til hver, lone n × innsats og blind (n + 2) × innsats.
 */
export function wolfPayout(n: number, stake: number): WolfPayout {
  return {
    partnerEach: 2 * stake,
    lone: n * stake,
    blind: (n + 2) * stake,
  };
}

/**
 * Innsatsen på hullet slik motoren regnet den (`WolfHoleRow.stake`).
 *
 * Grunninnsatsen 1 når hullet mangler i radene, eller når motoren ikke kjørte.
 */
export function wolfStakeForHole(
  holes: ReadonlyArray<{ holeNumber: number; stake: number }> | undefined,
  holeNumber: number,
): number {
  return holes?.find((row) => row.holeNumber === holeNumber)?.stake ?? 1;
}
