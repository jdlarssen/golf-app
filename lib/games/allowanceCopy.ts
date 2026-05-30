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
    case 'modified_stableford':
      return 'Modified-stableford-poeng beregnes på gross-score mot par (pro-skala). Scratch-format.';
    case 'singles_matchplay':
      return 'Scratch-matchplay — laveste gross-score per hull vinner.';
    case 'solo_strokeplay':
      return 'Scratch-slagspill — lavest sum av gross-slag vinner.';
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
    case 'texas_scramble':
    case 'ambrose':
      // Disse modusene har egne brutto-tekster i call-sites, ikke denne.
      return 'Ingen handicap — kun gross teller.';
    case 'wolf':
      // Wolf har egen scoring-toggle (gross|net) i WolfSetup-step. Denne
      // helperen brukes av Section 3 sin generiske allowance-field som ikke
      // vises for wolf, men returverdien defineres for type-completeness.
      return 'Ingen handicap — point-utdeling bruker gross-score.';
    case 'nassau':
      // Nassau har egen scoring-toggle (gross|net) i NassauSetup-step. Som
      // for wolf vises ikke generisk allowance-field; returverdien er for
      // type-completeness.
      return 'Ingen handicap — slag-sum per seksjon bruker gross-score.';
    case 'skins':
      // Skins har egen scoring-toggle (gross|net) i SkinsSetup-step. Som for
      // wolf og nassau vises ikke generisk allowance-field; returverdien er
      // for type-completeness.
      return 'Ingen handicap — lavest gross-score per hull vinner skinnet.';
    case 'bingo_bango_bongo':
      // BBB bruker ikke handicap — poeng er rene prestasjons-poeng (bingo/bango/
      // bongo) som ikke utledes fra slag. Generisk allowance-field vises ikke
      // for BBB; returverdien er kun for type-completeness.
      return 'Ingen handicap — Bingo Bango Bongo-poeng teller uavhengig av slag.';
    case 'nines':
      // Nines har egen scoring-toggle (gross|net) i NinesSetup-step. Generisk
      // allowance-field vises ikke for nines; returverdien er for type-completeness.
      return 'Ingen handicap — lavest gross-score per hull gir flest poeng.';
    case 'round_robin':
      // Round Robin har eget allowance-felt (`round_robin_allowance_pct`) i
      // RoundRobinSetup-step. Generisk allowance-field vises ikke for round_robin;
      // returverdien er kun for type-completeness.
      return 'Ingen handicap — besteball matchplay bruker gross-score per hull.';
    case 'acey_deucey':
      // Acey Deucey har egen scoring-toggle (gross|net) i sin setup-steg. Som
      // for Wolf/Nassau/Skins vises ikke generisk allowance-field; returverdien
      // er kun for type-completeness.
      return 'Ingen handicap — per-hull-poeng bruker gross-score.';
    case 'shamble':
      // Shamble har egen scoring-toggle (gross|net) i ShambleSetup-step.
      // Generisk allowance-field vises ikke for shamble; returverdien er for
      // type-completeness.
      return 'Ingen handicap — de laveste gross-scorene per hull teller for laget.';
  }
}
