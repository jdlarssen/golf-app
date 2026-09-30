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
