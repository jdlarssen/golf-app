// #2579: tavlas norske tekster i appen.
//
// To blokker, samme mønster som `sideTournamentCopy.ts`:
//
//  1. **Webbens strenger**, tegn for tegn fra `messages/no.json`
//     (`leaderboard.board`). Hver streng i appen som er lik en verdi der, står
//     her og er paritetslåst i `boardCopy.test.ts`. Appen importerer ikke
//     kildefila (den er stor, og Metro shaker ikke JSON).
//  2. **Appens egne**, for det tegningene viser og webben ikke har: den
//     ferdige tavla, den korte avstanden i stripa og ordene i tegnforklaringen.
//     Testen holder dem ulike alle verdiene i `leaderboard.board`.
//
// Malene fylles med `formatMessage` (ICU som next-intl, også flertall).

/** `leaderboard.board` i `messages/no.json`, den delen appen viser. */
export const BOARD_TEXT = {
  title: 'Tavla',
  pillLive: 'Live',
  pillLiveAfter: 'Live · etter {holes} hull',
  players: '{count, plural, one {# spiller} other {# spillere}}',
  flights: '{count} flighter',
  colPlace: 'Plass',
  colPlayer: 'Spiller',
  colHoles: 'Hull',
  colPoints: 'Poeng',
  colNet: 'Netto',
  you: 'Du',
  tiedRank: 'T{rank}',
  tone: { par: 'par' },
  legendRecent: 'Siste 5 hull',
  showAll: 'Vis alle {count} spillere',
  showFewer: 'Vis færre',
  stripKicker: 'Din runde',
  stripPlace: '{rank}. plass',
  stripTiedPlace: 'Delt {rank}. plass',
  behindPoints: '{gap} poeng bak {name}',
  behindStrokes: '{gap} slag bak {name}',
  behindPointsLead: '{gap} poeng bak ledelsen',
  behindStrokesLead: '{gap} slag bak ledelsen',
  stripHole: 'Hull {hole} →',
  stripSubmit: 'Lever scorekort →',
} as const;

/** Appens egne tekster på tavla. Ingen av dem finnes i `leaderboard.board`. */
export const BOARD_APP_TEXT = {
  pillFinished: 'Sluttresultat · {holes} hull',
  winner: 'Vinner',
  resultKicker: 'Ditt resultat',
  scorecard: 'Scorekortet →',
  /** Den korte avstanden i «Ditt resultat»: den lange bryter linja ved knappen. */
  behindShort: '{gap} bak {name}',
  behindShortLead: '{gap} bak ledelsen',
  /** «Likt med X · avgjort på …», etter trinnet som skilte radene. */
  decidedBack9: 'Likt med {name} · avgjort på siste ni',
  decidedBack6: 'Likt med {name} · avgjort på siste seks',
  decidedBack3: 'Likt med {name} · avgjort på siste tre',
  decidedHole18: 'Likt med {name} · avgjort på hull 18',
  /** Tegnforklaringen: «under», «par» (webbens `tone.par`) og «over». */
  legendUnder: 'under',
  legendOver: 'over',
} as const;
