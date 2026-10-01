// Wizard-intent: «hva slags arrangement?»-valget i step 1 av opprett-spill-
// wizarden. Driver hvilken format-katalog som vises i step 2 (Kompis/Klubb/
// Solo → grid fra format_intent_mapping; Cup → multi-select av cup-eligible
// formats + lag-oppsett).
//
// `parseIntent` leser `?intent=` fra URL-en i admin/games/new/page.tsx og
// opprett-spill/page.tsx (F2, #272); ukjent verdi gir undefined.

export type Intent = 'kompis' | 'klubb' | 'cup' | 'solo';

export function parseIntent(raw: string | undefined): Intent | undefined {
  if (raw === 'kompis' || raw === 'klubb' || raw === 'cup' || raw === 'solo') {
    return raw;
  }
  return undefined;
}

