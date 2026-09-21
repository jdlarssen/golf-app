// native/app/src/lib/allowanceCopy.ts
// Native #1980: tekstene i HCP-andel-feltet i veiviseren.
//
// Webben viser `AllowanceField` for best ball, stableford-familien og singles
// matchplay (`GameForm.tsx`), med netto/brutto-valg, et tallfelt og en
// brutto-tekst per format (`bruttoHelperKeyFor`). Appen speiler de samme
// ordene, og `allowanceCopy.test.ts` låser dem tegn for tegn mot
// `messages/no.json` (`wizard.allowanceProps.scoring` og `allowance`).
import type { AppGameMode } from './appFormats';

/** Formatene som har feltet. Greensome har sitt eget (`greensome_allowance_pct`). */
export const HCP_ALLOWANCE_MODES = [
  'stableford',
  'modified_stableford',
  'singles_matchplay',
  'best_ball',
] as const satisfies readonly AppGameMode[];

export type HcpAllowanceMode = (typeof HCP_ALLOWANCE_MODES)[number];

export function hasHcpAllowanceField(mode: AppGameMode): mode is HcpAllowanceMode {
  return (HCP_ALLOWANCE_MODES as readonly AppGameMode[]).includes(mode);
}

export const ALLOWANCE_TEXT = {
  legend: 'Scoring',
  description:
    'Styrer hvor stor andel av handicap som regnes med. Brutto = ingen handicap, bare bruttoscoren teller.',
  nettoHelper:
    'Andel av spillerens handicap som teller. 100 = fullt banehandicap (standard).',
  nettoLabel: 'Netto',
  bruttoLabel: 'Brutto',
  inputLabel: 'Handicap-andel (%)',
} as const;

/** Webbens `allowance.bruttoHelper.<mode>`. */
export const BRUTTO_HELPER: Record<HcpAllowanceMode, string> = {
  stableford: 'Stableford-poeng beregnes på bruttoscore mot par. Scratch-format.',
  modified_stableford:
    'Modified-stableford-poeng beregnes på bruttoscore mot par (pro-skala). Scratch-format.',
  singles_matchplay: 'Scratch-matchplay — laveste bruttoscore per hull vinner.',
  best_ball: 'Ingen handicap — laveste bruttoscore per hull per lag vinner.',
};
