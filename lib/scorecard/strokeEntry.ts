// Tasteregelen for slag på et hull — ett hjem, to konsumenter.
//
// Regelen bor her og ikke i `lib/scoring/`: den avgjør hvilket tall neste tapp
// setter, ikke hva tallet er verdt. Scoringen leser resultatet, den er ikke
// med på å bestemme det.
//
// Konsumenter: `components/hole/ScoreCard.tsx` (web) og
// `native/app/src/screens/Hole.tsx` (appen). Appen importerer denne fila rett
// fra `lib/`, så modulen holdes bevisst dependency-fri — en ny import her må
// også finnes i `native/app/`, og bare `expo export` fanger det (#1901).
//
// Nullstilling ligger IKKE her: «Angre» skriver `strokes: null` og er en
// skrivehandling, ikke en stegning. «−» kan derfor aldri nå tomt.

/** Én slag-verdi er alltid mellom 1 og 15. */
export const MIN_STROKES = 1;
// Netto dobbel bogey for en 54 i handicap på slope 155 lander på ~12 brutto på
// par 5; 15 gir rom for ærlige kollapshull og avviser fortsatt tastefeil.
export const MAX_STROKES = 15;

function clamp(n: number): number {
  return Math.max(MIN_STROKES, Math.min(MAX_STROKES, n));
}

/**
 * Tallet et «+»- eller «−»-tapp skal sette.
 *
 * Fra et tomt kort er PAR baselinjen, ikke null: en bogey på par 5 er da to
 * tapp, ikke seks. Er en verdi allerede satt, stepper vi fra den.
 */
export function nextStrokes({
  current,
  par,
  delta,
}: {
  current: number | null;
  par: number;
  delta: number;
}): number {
  return clamp((current ?? par) + delta);
}

/**
 * Tallet et tapp på selve kortet skal sette når ingen score er ført ennå.
 *
 * Kun for første føring — et tapp på et kort som alt har en verdi er en
 * no-op hos begge konsumentene, så en tommel på avveie ikke visker ut
 * spillerens tall.
 */
export function firstEntryStrokes(par: number): number {
  return clamp(par);
}
