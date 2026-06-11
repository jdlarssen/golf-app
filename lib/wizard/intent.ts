// Wizard-intent: «hva slags arrangement?»-valget i step 1 av opprett-spill-
// wizarden. Driver hvilken format-katalog som vises i step 2 (Kompis/Klubb/
// Solo → grid fra format_intent_mapping; Cup → multi-select av cup-eligible
// formats + lag-oppsett).
//
// Foundation for F2 (issue #272). Ikke konsumert ennå — neste chunks legger
// til IntentSelector, FormatGrid, CupSetup som faktisk leser denne.

export type Intent = 'kompis' | 'klubb' | 'cup' | 'solo';

export const INTENTS: readonly Intent[] = ['kompis', 'klubb', 'cup', 'solo'] as const;

export function parseIntent(raw: string | undefined): Intent | undefined {
  if (raw === 'kompis' || raw === 'klubb' || raw === 'cup' || raw === 'solo') {
    return raw;
  }
  return undefined;
}

// Cup-intent setter game_mode-løypet til en match-format-velger heller enn
// en standard format-grid. Brukes av wizard og format-mapping-konsumenter.
export function isCupIntent(intent: Intent | undefined): boolean {
  return intent === 'cup';
}

