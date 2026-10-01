// Puttetaket: ett hjem (#2222).
//
// Samme tall som DB-sperren `scores.putts` (`putts is null or putts between 0
// and 10`, migrasjon 0123). `puttsDbCheck.test.ts` holder de to like. Hever
// noen taket i én komponent alene, godtar UI-et en verdi databasen avviser, og
// via sync-køen blir det en skrivefeil på enheten i stedet for en melding.
//
// Konsumenter: `components/hole/PuttsChips.tsx` (web), server-actionen i
// `app/[locale]/games/[id]/putter/actions.ts` og
// `native/app/src/components/hole/ScoreRail.tsx` (appen). Appen importerer
// fila rett fra `lib/`, så den holdes dependency-fri, som `strokeEntry.ts`.

/** Færrest putter på et hull: en chip-in er 0. */
export const MIN_PUTTS = 0;
/** Flest putter på et hull. */
export const MAX_PUTTS = 10;
