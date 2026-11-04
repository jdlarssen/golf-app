// #2756: tekstene til resultatsetningen på den ferdige tavla og resultatkortet
// «Del resultat» sender.
//
// To blokker, samme mønster som `boardCopy.ts`:
//
//  1. **Webbens strenger**, tegn for tegn fra `messages/no.json`
//     (`leaderboard.shareCard` og formatnavnene i `modes`), låst i
//     `resultCardCopy.test.ts`. Appen importerer ikke kildefila (den er stor, og
//     Metro shaker ikke JSON).
//  2. **Appens egne**, for det setningen sier og kortet ikke gjør: kortet regner
//     lagets resultat mot par, tavla (og derfor setningen) i netto.
//
// Malene fylles med `formatMessage`; `<gold>` leses av `templateWords`.

/** `leaderboard.shareCard` i `messages/no.json`. */
export const RESULT_CARD_TEXT = {
  finalResult: 'Sluttresultat',
  gameFinished: 'Spillet er ferdig',
  winnerWon: '{name} vant <gold>{margin}</gold>',
  tied: 'Uavgjort',
  approved: 'Godkjent',
  headlineWon: '{names} vant med <gold>{result}</gold>',
  headlineWonAt: '{names} vant på <gold>{result}</gold>',
  headlineShared: '{names} delte seieren med <gold>{result}</gold>',
  headlineSharedAt: '{names} delte seieren på <gold>{result}</gold>',
  headlineSharedMany: 'Delt seier med <gold>{result}</gold>',
  headlineSharedManyAt: 'Delt seier på <gold>{result}</gold>',
  points: '{n, plural, one {# poeng} other {# poeng}}',
  skins: '{n, plural, one {# skin} other {# skins}}',
  par: 'par',
  holes: '{n} hull',
  players: '{n, plural, one {# spiller} other {# spillere}}',
  playerFallback: 'Spiller',
  tagline: 'Fyr opp golfturneringen på et par minutter',
  taglinePun: 'Fyr opp golfturneringen på et <gold>par</gold> minutter',
} as const;

/**
 * `modes` i `messages/no.json`: formatnavnet på kortets metalinje, som nettet
 * slår opp med `formatDisplayLabelKey`.
 */
export const RESULT_MODE_TEXT = {
  best_ball: 'Best ball',
  stableford: 'Stableford',
  modified_stableford: 'Modifisert Stableford',
  singles_matchplay: 'Matchplay',
  solo_strokeplay: 'Slagspill',
  texas_scramble: 'Texas scramble',
  ambrose: 'Ambrose',
  florida_scramble: 'Florida Scramble',
  fourball_matchplay: 'Fourball',
  foursomes_matchplay: 'Foursomes',
  greensome_matchplay: 'Greensome',
  chapman_matchplay: 'Chapman',
  wolf: 'Wolf',
  nassau: 'Nassau',
  skins: 'Skins',
  bingo_bango_bongo: 'Bingo Bango Bongo',
  nines: 'Nines / Split Sixes',
  round_robin: 'Round Robin',
  acey_deucey: 'Acey Deucey',
  shamble: 'Shamble / Champagne Scramble',
  patsome: 'Patsome',
  gruesome_matchplay: 'Gruesome',
  modeVariants: {
    stableford_team: '4BBB Stableford',
    modified_stableford_team: '4BBB Modifisert Stableford',
    shamble_champagne: 'Champagne Scramble',
    shamble_shamble: 'Shamble',
  },
} as const;

/** `leaderboard.common.shareResult`. */
export const SHARE_RESULT_LABEL = 'Del resultat';

/** Appens egne. Testen holder dem ulike alle verdiene i `leaderboard.shareCard`. */
export const RESULT_APP_TEXT = {
  /** Setningen på en tavle som teller netto eller brutto: «på 62 netto». */
  net: '{n} netto',
  gross: '{n} brutto',
  shareFailed: 'Fikk ikke delt resultatet. Prøv igjen.',
} as const;
