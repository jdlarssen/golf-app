// native/app/src/lib/appFormats.ts
// Native N6a (#1854): hvilke formater opprett-veiviseren i appen tilbyr, og hva
// de heter på norsk.
//
// Webben har 22 aktive formater og trenger et intent-steg for å ordne dem.
// Appen har færre (14 etter #2753), og en flat liste er riktigere native-IA (kontraktens Key
// Decision). Lista her er appens halvdel av den gaten — DB-halvdelen bor i
// `data/formatCatalog.ts`, og et format må stå i BEGGE for å vises.
//
// **Etikettene er en håndkopi**, av samme grunn som `sideTournamentCopy.ts`:
// `messages/no.json` er 341 KB for de 8 strengene appen trenger, og Metro
// tree-shaker ikke JSON. Prisen er drift, og `appFormats.test.ts` er
// forsikringen — den leser `no.json` fra node-siden (testen bundles aldri) og
// krever tegn-for-tegn likhet med `modes.<slug>`.
import type { GameMode } from '../../../../lib/scoring/modes/types';

/**
 * Modiene appen kan opprette. `satisfies` binder dem til webbens
 * `GameMode`-union: en slug som ikke finnes der, stopper `tsc` her og ikke
 * først i en PostgREST-feil på enheten.
 *
 * Rekkefølgen i lista er IKKE visningsrekkefølgen — den kommer fra
 * `format_intent_mapping.sort_order` (se `formatCatalog.ts`).
 */
export const APP_SUPPORTED_MODES = [
  'stableford',
  'modified_stableford',
  'singles_matchplay',
  'best_ball',
  'greensome_matchplay',
  'wolf',
  'bingo_bango_bongo',
  'skins',
  // #2753 D3: slagspill og Patsome er synlige for både kompis og klubb.
  'solo_strokeplay',
  'patsome',
  // #2753 D3b: scramble-familien og shamble.
  'texas_scramble',
  'ambrose',
  'florida_scramble',
  'shamble',
] as const satisfies readonly GameMode[];

export type AppGameMode = (typeof APP_SUPPORTED_MODES)[number];

/** Speilet fra `messages/no.json` → `modes.<slug>`. Låst av paritetstesten. */
export const APP_MODE_LABELS: Record<AppGameMode, string> = {
  stableford: 'Stableford',
  modified_stableford: 'Modifisert Stableford',
  singles_matchplay: 'Matchplay',
  best_ball: 'Best ball',
  greensome_matchplay: 'Greensome',
  wolf: 'Wolf',
  bingo_bango_bongo: 'Bingo Bango Bongo',
  skins: 'Skins',
  solo_strokeplay: 'Slagspill',
  patsome: 'Patsome',
  texas_scramble: 'Texas scramble',
  ambrose: 'Ambrose',
  florida_scramble: 'Florida Scramble',
  shamble: 'Shamble / Champagne Scramble',
};

const SUPPORTED = new Set<string>(APP_SUPPORTED_MODES);

/** Type-guard: er slug-en et format appen kan opprette? */
export function isAppSupportedMode(slug: string): slug is AppGameMode {
  return SUPPORTED.has(slug);
}

/**
 * Modiene der veiviseren tildeler lag/side per spiller.
 *
 * **Wolf står med vilje IKKE her.** Rotasjonsslottene trekkes ved START over
 * den aktive rosteren (#969, `assignRotationSlots` — N6b), så et wolf-spill
 * publiseres med `team_number: null` på hver rad. Setter veiviseren en verdi
 * her, blir den overskrevet ved start — og fram til da lyver skjermen.
 *
 * De øvrige fire (stableford, modified_stableford, skins, bingo_bango_bongo)
 * er solo-formater uten lag-begrep i det hele tatt.
 */
export const MODES_WITH_TEAM_ASSIGNMENT: readonly AppGameMode[] = [
  'best_ball',
  'singles_matchplay',
  'greensome_matchplay',
  // Patsome spilles i par hele runden (4BBB, greensome, foursomes).
  'patsome',
  // #2753 D3b: lagene settes i spillersteget, som på nettet.
  'texas_scramble',
  'ambrose',
  'florida_scramble',
  'shamble',
];

const TEAM_ASSIGNED = new Set<string>(MODES_WITH_TEAM_ASSIGNMENT);

/** Skal veiviseren vise lag-/side-tildeling for denne modusen? */
export function usesTeamAssignment(mode: AppGameMode): boolean {
  return TEAM_ASSIGNED.has(mode);
}
