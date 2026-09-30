// #2255: teksten på «Hull for hull» i appen.
//
// Det meste står også på webbens «Hull for hull» (`leaderboard.common.*`,
// `leaderboard.soloStrokeplay.*`, `game.home.hullForHull`) og låses tegn for
// tegn mot `messages/no.json` i `holesCopy.test.ts`. To unntak: `pointsUnit`
// er hardkodet «p» i webbens visning, ikke en melding, og `notAvailable` finnes
// bare i appen. Samme mønster som `ticketCopy.ts`: appen har ingen i18n, så
// teksten er en håndkopi.

export const HOLES_TEXT = {
  /** Overskriften, og flisa på spillets side når runden er avsluttet. */
  heading: 'Hull for hull',
  standings: 'Stillingen',
  frontHeading: 'Ut',
  frontSub: 'Hull 1–9',
  backHeading: 'Inn',
  backSub: 'Hull 10–18',
  waiting: 'Venter',
  revealHiddenTitle: 'Resultatene avsløres etter runden',
  revealHiddenSub: 'Hull for hull åpnes når admin avslutter spillet.',
  goodLuck: 'Lykke til.',
  /** Bunnteksten når runden er ferdig, som webbens `LeaderboardFooter`. */
  wellPlayed: 'Vel spilt!',
  unknownPlayerFull: '(ukjent spiller)',
  unknownPlayer: '(ukjent)',
  /** Undertittelen i slagspill. */
  strokeplaySubtitle: 'Slagspill · Netto',
  /** Enheten bak poengene på hvert hull. */
  pointsUnit: 'p',
  notAvailable: 'Hull for hull finnes ikke for denne runden.',
} as const;

/** «7 hull». */
export function holesPlayedChip(count: number): string {
  return `${count} hull`;
}

/** «82 brutto». */
export function grossChip(count: number): string {
  return `${count} brutto`;
}

/** «Hull 4». */
export function holeNumberLabel(holeNumber: number): string {
  return `Hull ${holeNumber}`;
}

/** «Par 4 · SI 7». */
export function parSiChip(par: number, strokeIndex: number): string {
  return `Par ${par} · SI ${strokeIndex}`;
}

/**
 * Wolf (#2255 PR 3b): webbens `leaderboard.wolf.*` og `leaderboard.common.netto`
 * / `brutto`, låst i `holesCopy.test.ts`. «Wolf · » foran scoringen er
 * hardkodet i webbens visning, som «p» over.
 */
export const WOLF_HOLES_TEXT = {
  wolfLabel: 'Wolf:',
  choiceLone: 'Lone Wolf',
  choiceBlind: 'Blind Wolf',
  choiceWaiting: 'Venter…',
  outcomeWolfVant: 'Wolf vant',
  outcomeAndreVant: 'Andre vant',
  outcomeLik: 'Lik',
  outcomeVenter: 'Venter',
  wolfSide: 'Wolf-side',
  andreSide: 'Andre',
  netto: 'Netto',
  brutto: 'Brutto',
} as const;

/** «Partner: Ola». */
export function wolfChoicePartner(partnerName: string): string {
  return `Partner: ${partnerName}`;
}

/** «brutto 5», ved siden av netto. */
export function wolfBruttoLabel(count: number): string {
  return `brutto ${count}`;
}

/** Linja under overskriften: «Wolf · Netto». */
export function wolfSubtitle(scoring: 'gross' | 'net'): string {
  return `Wolf · ${scoring === 'net' ? WOLF_HOLES_TEXT.netto : WOLF_HOLES_TEXT.brutto}`;
}
