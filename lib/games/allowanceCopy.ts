import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Returnerer brutto-helper-tekst per spillmodus. Brukes av `AllowanceField`
 * i Section 3 (Format) for å forklare hva «brutto» betyr i akkurat den
 * modusen — formatet endrer karakter (stableford-poeng vs match-vinnere vs
 * laveste team-gross), så generisk tekst blir misvisende.
 *
 * Fourball matchplay, foursomes matchplay og texas scramble har sine egne
 * helper-tekster definert inline i call-sites (forskjellige felt-navn og
 * defaults).
 */
export function bruttoHelperFor(mode: GameMode): string {
  switch (mode) {
    case 'best_ball':
      return 'Ingen handicap — laveste gross-score per hull per lag vinner.';
    case 'stableford':
      return 'Stableford-poeng beregnes på gross-score mot par. Scratch-format.';
    case 'singles_matchplay':
      return 'Scratch-matchplay — laveste gross-score per hull vinner.';
    case 'solo_strokeplay':
      return 'Scratch-slagspill — lavest sum av gross-slag vinner.';
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
    case 'texas_scramble':
      // Disse modusene har egne brutto-tekster i call-sites, ikke denne.
      return 'Ingen handicap — kun gross teller.';
    case 'wolf':
      // Wolf har egen scoring-toggle (gross|net) i WolfSetup-step. Denne
      // helperen brukes av Section 3 sin generiske allowance-field som ikke
      // vises for wolf, men returverdien defineres for type-completeness.
      return 'Ingen handicap — point-utdeling bruker gross-score.';
  }
}
