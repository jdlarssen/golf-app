// #2579: tavlas norske tekster i appen.
//
// To blokker, samme mønster som `sideTournamentCopy.ts`:
//
//  1. **Webbens strenger**, tegn for tegn fra `messages/no.json`
//     (`leaderboard.board`, og sideturneringens to panel-etiketter). Hver
//     streng i appen som er lik en verdi der, står her og er paritetslåst i
//     `boardCopy.test.ts`. Appen importerer ikke kildefila (den er stor, og
//     Metro shaker ikke JSON).
//  2. **Appens egne**, for det tegningene viser og webben ikke har: den
//     ferdige tavla, den korte avstanden i stripa, ordene i tegnforklaringen
//     og lagtavla (#2579 PR 2; webben har ingen lagtavle ennå, #2316).
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
  colVsPar: 'Mot par',
  you: 'Du',
  tiedRank: 'T{rank}',
  srPlace: '{rank}. plass',
  srTiedPlace: 'Delt {rank}. plass',
  srPoints: '{total} poeng',
  srOverPar: '{count} over par',
  srUnderPar: '{count} under par',
  srPointsOverPar: '{count} poeng over par',
  srPointsUnderPar: '{count} poeng under par',
  srEven: 'På par',
  srNet: '{total} slag netto',
  srNoTotal: 'Ingen hull spilt ennå',
  srUp: 'Opp {count, plural, one {# plass} other {# plasser}} siden forrige hull',
  srDown: 'Ned {count, plural, one {# plass} other {# plasser}} siden forrige hull',
  srSame: 'Uendret siden forrige hull',
  srRecent: 'Siste hull: {tones}',
  srYou: 'Dette er deg',
  tone: {
    under: 'under par',
    par: 'par',
    over1: 'bogey',
    over2: 'dobbel bogey eller verre',
  },
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

/**
 * `leaderboard.common`: antall hull i radens opplesning, navnet som mangler,
 * lagets navn, «poeng» under en poengsum (som webbens podier) og «mot par»
 * under lagets mot par (#2625).
 */
export const BOARD_COMMON_TEXT = {
  holesPlayedCount: '{count} hull spilt',
  unknownPlayerFull: '(ukjent spiller)',
  // #1954 A3: navnet under «Trukne spillere» når profilen mangler det.
  unknownPlayer: '(ukjent)',
  teamLabel: 'Lag {number}',
  poengLabel: 'poeng',
  vsParLabel: 'mot par',
} as const;

/**
 * `leaderboard.withdrawn`: seksjonen under tavla med spillerne som har trukket
 * seg (#1954 A3), ordene fra webbens `WithdrawnPlayersSection`.
 */
export const WITHDRAWN_BOARD_TEXT = {
  sectionTitle: 'Trukne spillere',
  badge: 'Trukket',
} as const;

/**
 * `leaderboard.state35`: best ball mens runden pågår (#2579 PR 2). Overskriften
 * over lagene og låskortet, de samme ordene som webbens tavle.
 */
export const STATE35_TEXT = {
  segmentHalfLabel: 'HULL {from}–{to}',
  lockedHeading: 'Vi sees ved hull {last}',
  lockedSub: 'Hull {from}–{to} vises når arrangøren avslutter spillet.',
} as const;

/**
 * `leaderboard.sideTournament.panel.rows`: etikettene for lengste drive og
 * nærmest pinnen i sideturneringen under tavla (#2579).
 */
export const SIDE_PANEL_TEXT = {
  longestDrive: 'Lengste drive',
  closestToPin: 'Nærmest pinnen',
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
  /** Plassen når kategorien har flere enn én: «Lengste drive #2». */
  sidePosition: ' #{pos}',
} as const;

/**
 * Lagtavlas egne tekster (#2579 PR 2, `Lagtavle-forslag`,
 * `Lagtavle-ferdig-forslag-*`, `Lagtavle-bestball-forslag-*`). Ingen av dem
 * finnes i `leaderboard.board`.
 */
export const BOARD_TEAM_TEXT = {
  title: 'Lagtavla',
  /** Båndets linje: «4 lag à 4», eller «4 lag» når lagene er ulikt store. */
  teams: '{count} lag',
  teamsOfSize: '{count} lag à {size}',
  /** Enheten under summen og i båndet; poeng er webbens `common.poengLabel`. */
  net: 'netto',
  gross: 'brutto',
  /** Seeren først i navnelinja, og inne i setningen «Ballen til deg talte». */
  you: 'Deg',
  youInSentence: 'deg',
  yourTeam: 'Ditt lag',
  winnerTeam: 'Vinnerlaget',
  stripKicker: 'Laget ditt',
  /** Hullene laget har spilt: ved prikkene, eller under summen. */
  holes: 'hull {holes}',
  /** Best ball: «8 av 9» under summen og «8 av 9 hull» i stripa. */
  ofHoles: '{played} av {total}',
  stripOfHoles: '{played} av {total} hull',
  /** Under summen på den ferdige tavla, der laget har handicap: «netto · lag-hcp 7». */
  teamHandicap: '{unit} · lag-hcp {hcp}',
  holeCardHeading: 'Ditt lag på hull {hole}',
  /** Scramble: slagene laget slo og ordet for dem, «3 slag, birdie». */
  scrambleScore: '{strokes} slag, {term}',
  /** Best ball: hvem sin ball som talte, og lagets netto med ordet for den. */
  bestBallBall: 'Ballen til {names} talte',
  bestBallScore: 'netto {net}, {term}',
  /** Overskriften til høyre over lagene i best ball: «HULL 10–18 ER SKJULT». */
  hiddenHalf: 'Hull {from}–{to} er skjult',
  /** Opplesningen: brutto-shamble, og ditt lag. */
  srGross: '{total} slag brutto',
  srYourTeam: 'Dette er laget ditt',
} as const;
