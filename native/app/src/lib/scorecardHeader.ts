// #2262: hodet på scorekortet — «Byneset North · Gul tee · Stableford ·
// banehandicap 15» (#2385: som designet, uten kjønn).
//
// Handicapdelen viser tallet NETTO- og POENG-raden faktisk er regnet med, ikke
// alltid banehandicapen. I fourball med 85 % er slagene fordelt fra 17, ikke
// 20, og da ville «banehandicap 20» i hodet motsagt radene under. Tallene
// kommer derfor fra de samme stedene som radene: `playerStrokeHandicapFor`
// (vanlige kort) og `teamHandicapFor` (scramble-lagkort).
import { fromSignedHcp } from '../../../../lib/handicap/sign';
import {
  isScrambleFamily,
  MODE_LABELS,
  type GameMode,
} from '../../../../lib/scoring/modes/types';
import type { BundleGame } from '../data/gameBundle';
import { playerStrokeHandicapFor } from './scoringContext';

/**
 * Ordene i toppen av scorekortet (#2385): kickeren i navigatorens header og
 * skjermens navn for systemet.
 */
export const SCORECARD_TEXT = {
  kicker: 'Mitt scorekort',
  screenTitle: 'Scorekort',
} as const;

/** Kickeren på et lagkort: «Lagets scorekort · Lag 2», eller uten laget. */
export function teamScorecardKicker(teamLabel: string | null | undefined): string {
  return `Lagets scorekort${teamLabel ? ` · ${teamLabel}` : ''}`;
}

export type HandicapPart = { kind: 'course' | 'playing' | 'team'; value: number };

/**
 * Handicapdelen av hodet, eller `null` når hodet ikke skal ha noen:
 * reveal-spill som pågår (handicapen er en del av det reveal holder tilbake),
 * ukjent handicap eller config, og lagkort i alternate shot, der slagene per
 * hull er en forskjell mellom sidene og ikke ett tall.
 */
export function scorecardHandicapPart(opts: {
  game: Pick<BundleGame, 'gameMode' | 'modeConfig'>;
  courseHandicap: number | null;
  /** Kortet viser lagets rader (formatet deler én ball). */
  teamMode: boolean;
  /** Lagets handicap fra motoren (`teamHandicapFor`), eller `null`. */
  teamHandicap: number | null;
  revealActive: boolean;
}): HandicapPart | null {
  if (opts.revealActive) return null;
  if (opts.teamMode) {
    if (!isScrambleFamily(opts.game.gameMode as GameMode) || opts.teamHandicap == null) {
      return null;
    }
    return { kind: 'team', value: opts.teamHandicap };
  }
  if (opts.courseHandicap == null) return null;
  const playing = playerStrokeHandicapFor(opts.game, opts.courseHandicap);
  if (playing == null) return null;
  return playing === opts.courseHandicap
    ? { kind: 'course', value: opts.courseHandicap }
    : { kind: 'playing', value: playing };
}

const PART_LABELS: Record<HandicapPart['kind'], string> = {
  course: 'banehandicap',
  playing: 'spillehandicap',
  team: 'lagshandicap',
};

/**
 * «banehandicap 15». Pluss-handicap er lagret negativt og vises «+2», som i
 * Golfbox. Fortegnsregelen har ett hjem (`lib/handicap/sign.ts`); `Intl` går
 * vi utenom, fordi Hermes mangler dataene.
 */
export function handicapPartText(part: HandicapPart): string {
  const { magnitude, isPlus } = fromSignedHcp(part.value);
  return `${PART_LABELS[part.kind]} ${isPlus ? '+' : ''}${magnitude}`;
}

/**
 * Linja under spillnavnet, som designet: «Byneset North · Gul tee ·
 * Stableford · banehandicap 15» (#2385, uten kjønn i parentes). Det som
 * mangler, hoppes over.
 */
export function scorecardHeaderLine(opts: {
  courseName: string | null;
  teeBoxName: string | null;
  gameMode: string;
  handicapPart: HandicapPart | null;
}): string {
  const tee = opts.teeBoxName ? `${opts.teeBoxName} tee` : null;
  return [
    opts.courseName,
    tee,
    MODE_LABELS[opts.gameMode as GameMode] ?? null,
    opts.handicapPart ? handicapPartText(opts.handicapPart) : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}
