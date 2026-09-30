// #2255: teksten på «Hull for hull» i appen.
//
// Det meste står også på webbens «Hull for hull» (`leaderboard.common.*`,
// `leaderboard.soloStrokeplay.*`, `leaderboard.wolf.*`, `leaderboard.nines.*`,
// `leaderboard.roundRobin.*`, `leaderboard.aceyDeucey.*`,
// `game.home.hullForHull`) og låses tegn for tegn mot `messages/no.json` i
// `holesCopy.test.ts`. Unntakene er hardkodet i webbens visninger, ikke
// meldinger: `pointsUnit` («p»), «Wolf · » foran scoringen, « · » mellom
// Nines-varianten og scoringen, «Round Robin» under overskriften, « + » mellom
// partnerne i Round Robin og «Acey Deucey · » foran scoringen. `notAvailable`
// finnes bare i appen. Samme mønster som `ticketCopy.ts`: appen har ingen
// i18n, så teksten er en håndkopi.
import {
  ninesPointsText,
  type NinesScoringKey,
  type NinesVariantKey,
} from '../../../../lib/leaderboard/ninesHoles';
import type { RoundRobinSegmentHolesKey } from '../../../../lib/leaderboard/roundRobinHoles';
import type { AceyDeuceyScoringKey } from '../../../../lib/leaderboard/aceyDeuceyHoles';

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
  /** Scoringen i undertittelen (Wolf, Nines). */
  netto: 'Netto',
  brutto: 'Brutto',
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
 * Wolf (#2255 PR 3b): webbens `leaderboard.wolf.*`, låst i `holesCopy.test.ts`.
 * Netto og brutto står i `HOLES_TEXT`.
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
  return `Wolf · ${scoring === 'net' ? HOLES_TEXT.netto : HOLES_TEXT.brutto}`;
}

/**
 * Nines / Split Sixes (#2255 PR 3c): webbens `leaderboard.nines.*`, låst i
 * `holesCopy.test.ts`. Nøklene er de samme som modellen bærer
 * (`lib/leaderboard/ninesHoles.ts`).
 */
export const NINES_HOLES_TEXT = {
  variantNines: 'Nines',
  variantSplitSixes: 'Split Sixes',
  /** Til høyre i hodet på et hull som ikke er ferdig spilt. */
  ventePaaScore: 'Venter på score',
} as const;

/** Linja under overskriften: «Nines · Netto», «Split Sixes · Brutto». */
export function ninesSubtitle(variantKey: NinesVariantKey, scoringKey: NinesScoringKey): string {
  return `${NINES_HOLES_TEXT[variantKey]} · ${HOLES_TEXT[scoringKey]}`;
}

/** «9 poeng», potten på hullet. */
export function ninesPotLabel(pot: number): string {
  return `${pot} poeng`;
}

/** «brutto 5», ved siden av netto. */
export function ninesBruttoLabel(gross: number): string {
  return `brutto ${gross}`;
}

/**
 * Poengene fra potten: «4», og del-poeng med én desimal og norsk komma
 * («2,3»). Regelen er webbens (`ninesPointsText`); desimalen bygges her,
 * for Hermes har ikke ICU (samme grunn som `formatHcpNb` i `profileCopy.ts`).
 * Testen låser den mot webbens `formatNumber` for hver andel potten kan gi.
 */
export function ninesPoints(points: number): string {
  return ninesPointsText(points, (n) => n.toFixed(1).replace('.', ','));
}

/**
 * Round Robin (#2255 PR 3c): webbens `leaderboard.roundRobin.*`, låst i
 * `holesCopy.test.ts`. Utfallet og hull-spennet har de samme nøklene som
 * modellen bærer (`lib/leaderboard/roundRobinHoles.ts`).
 */
export const ROUND_ROBIN_HOLES_TEXT = {
  /** Linja under overskriften, hardkodet i webbens visning. */
  subtitle: 'Round Robin',
  /** Mellom de to sidene i konstellasjonen. */
  vsLabel: 'vs',
  /** Over siden som vant hullet. */
  vantHulletLabel: 'Vant hullet',
  /** Til høyre i hodet: delt hull, eller et hull som ikke er ferdig spilt. */
  outcomeChipTied: 'Delt',
  outcomeChipVenter: 'Venter',
  segmentHoles1: 'Hull 1–6',
  segmentHoles2: 'Hull 7–12',
  segmentHoles3: 'Hull 13–18',
} as const;

/** «Segment 2 · Hull 7–12». */
export function roundRobinSegmentLabel(segment: number, holesKey: RoundRobinSegmentHolesKey): string {
  return `Segment ${segment} · ${ROUND_ROBIN_HOLES_TEXT[holesKey]}`;
}

/** Partnerne på en side: «Ola + Kari». */
export function roundRobinSideNames(names: readonly string[]): string {
  return names.join(' + ');
}

/** «brutto 5», ved siden av netto. */
export function roundRobinBruttoLabel(gross: number): string {
  return `brutto ${gross}`;
}

/**
 * Acey Deucey (#2255 PR 3c): webbens `leaderboard.aceyDeucey.*`, låst i
 * `holesCopy.test.ts`. Poengene («+3», «0», «−3») kommer ferdig skrevet fra
 * modellen (`lib/leaderboard/aceyDeuceyHoles.ts`); «Venter» og netto/brutto
 * står i `HOLES_TEXT`.
 */
export const ACEY_DEUCEY_HOLES_TEXT = {
  /** Formatet foran scoringen under overskriften, hardkodet i webbens visning. */
  formatName: 'Acey Deucey',
} as const;

/** Linja under overskriften: «Acey Deucey · Netto». */
export function aceyDeuceySubtitle(scoringKey: AceyDeuceyScoringKey): string {
  return `${ACEY_DEUCEY_HOLES_TEXT.formatName} · ${HOLES_TEXT[scoringKey]}`;
}

/** «brutto 5», ved siden av netto. */
export function aceyDeuceyBruttoLabel(gross: number): string {
  return `brutto ${gross}`;
}
