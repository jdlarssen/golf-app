// #2283 (part D3): the words and numbers of the side-contest row and sheet.
// The wording is the app's (`native/app/src/lib/sideContestCopy.ts`, approved
// with the drawings 15.11); here it comes from the message catalog
// (`holes.sideContest.*`, `holes.girContest.*`) so the English catalog can
// follow. In a cup it says «kampen» where a normal game says «flighten»: the
// match is the flight (`side_claim_flight_key` gives 0 in a match of at most
// four players).
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatNumber, intlLocaleTag } from '@/lib/i18n/format';
import type { SideClaimFailure } from '@/lib/games/sideClaims';
import {
  CLAIM_DISTANCE_MAX_M,
  CLAIM_DISTANCE_MIN_M,
  girQuestionForPar,
  type GirQuestionKey,
  type HoleContest,
  type HoleContestCategory,
  type SideContestCategory,
} from '@/lib/games/sideContest';

/** The step on − and +. */
export const DISTANCE_STEP_M = 0.5;

/**
 * The distance after a tap on − or +, or `null` when the tap would leave
 * 0,1–99,9 m. From an empty field, + gives the first step (0,5 m). Rounded to
 * one decimal so a run of taps never drifts (0.1 + 0.2).
 */
export function stepDistance(current: number | null, direction: -1 | 1): number | null {
  if (current == null) return direction === 1 ? DISTANCE_STEP_M : null;
  const next = Math.round((current + direction * DISTANCE_STEP_M) * 10) / 10;
  if (next < CLAIM_DISTANCE_MIN_M || next > CLAIM_DISTANCE_MAX_M) return null;
  return next;
}

/** One decimal with the locale's separator: «2,5» in Norwegian, «2.5» in English. */
export function formatDistance(distanceM: number, locale: AppLocale): string {
  return distanceM.toLocaleString(intlLocaleTag(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Who saved last: «deg» or the first name. `name: null` when unknown. */
export type SavedBy = { me: true } | { me: false; name: string | null };

const GIR_QUESTION_KEY = {
  afterTeeShot: 'questionAfterTeeShot',
  onTwo: 'questionOnTwo',
  onThree: 'questionOnThree',
  onFour: 'questionOnFour',
} as const satisfies Record<GirQuestionKey, string>;

const FAILURE_KEY = {
  not_authenticated: 'notAuthenticated',
  not_active: 'notActive',
  not_player: 'notPlayer',
  wrong_flight: 'wrongFlight',
  no_slot: 'noSlot',
  bad_distance: 'badDistance',
  db_error: 'dbError',
} as const satisfies Record<SideClaimFailure, string>;

export function useSideContestText() {
  const t = useTranslations('holes.sideContest');
  const g = useTranslations('holes.girContest');
  const locale = useLocale() as AppLocale;

  /** «flighten» in a normal game, «kampen» in a cup. */
  const group = (contest: HoleContest) => t(contest.source === 'cup' ? 'groupCup' : 'groupGame');

  /** The row's subtitle before anything is reported: «Sidekonkurranse», «+2 p til laget», «+1,5 p per GIR». */
  const pointsLine = (contest: HoleContest): string => {
    if (contest.source === 'game') return t('rowGame');
    const points = formatNumber(contest.points, locale);
    return t(contest.category === 'gir' ? 'pointsPerGir' : 'pointsToTeam', { points });
  };

  const savedByText = (savedBy: SavedBy): string => {
    if (savedBy.me) return t('savedByMe');
    return savedBy.name ? t('savedByName', { name: savedBy.name }) : t('savedUnknown');
  };

  return {
    locale,
    report: t('report'),
    rowOffline: t('rowOffline'),
    rowFetchFailed: t('rowFetchFailed'),
    sheetOffline: t('sheetOffline'),
    you: t('you'),
    title: (category: HoleContestCategory): string => t(`title.${category}`),
    noneLabel: (category: HoleContestCategory): string => t(`none.${category}`),
    pointsLine,
    /** The sheet's kicker: «Sidekonkurranse · hull 7», «Sidepoeng · hull 3 · +2 p til laget». */
    kicker: (contest: HoleContest, holeNumber: number): string =>
      contest.source === 'game'
        ? t('kickerGame', { hole: holeNumber })
        : t('kickerCup', { hole: holeNumber, points: pointsLine(contest) }),
    sideQuestion: (contest: HoleContest & { category: SideContestCategory }): string =>
      t(contest.category === 'closest_to_pin' ? 'questionClosestToPin' : 'questionLongestDrive', {
        group: group(contest),
      }),
    girQuestion: (par: number): string => `${g(GIR_QUESTION_KEY[girQuestionForPar(par)])} ${g('tapAllWhoHit')}`,
    /**
     * The line above «Ferdig». Before anything is saved: who the answer is
     * shared with. After: who saved, and that everyone can change it. Offline
     * nobody can change it now, so only who saved.
     */
    sideStatus: (contest: HoleContest, savedBy: SavedBy | null, offline: boolean): string => {
      if (!savedBy) return t(contest.source === 'cup' ? 'statusSharedCup' : 'statusSharedGame');
      if (offline) return savedByText(savedBy);
      return `${savedByText(savedBy)} ${t('anyoneCanChange', { group: group(contest) })}`;
    },
    /** The same line for GIR. The foursomes family plays one ball per side. */
    girStatus: (maxPerTeam: number, oneBallPerSide: boolean, savedBy: SavedBy | null, offline: boolean): string => {
      const rule = oneBallPerSide ? g('oneBall') : g('maxPerTeam', { max: maxPerTeam });
      if (!savedBy) return `${g('sharedWithMatch')} ${rule}`;
      if (offline) return savedByText(savedBy);
      return `${savedByText(savedBy)} ${rule}`;
    },
    formatDistance: (distanceM: number): string => formatDistance(distanceM, locale),
    /** The row's answer: «Marte · 2,5 m», «Deg», «Ingen på green». */
    sideAnswer: (category: SideContestCategory, winnerName: string | null, distanceM: number | null): string => {
      if (winnerName == null) return t(`none.${category}`);
      if (distanceM == null) return winnerName;
      return t('answerWithDistance', {
        name: winnerName,
        distance: formatDistance(distanceM, locale),
        unit: t('metre'),
      });
    },
    /** The GIR row's answer: «2 av 4 traff», or «Ingen traff greenen» when every ball missed. */
    girAnswer: (hits: number, balls: number, allMissed: boolean): string =>
      allMissed ? t('none.gir') : g('answer', { hits, balls }),
    /** The names of a foursomes side: «Deg og Marte». */
    nameList: (names: readonly string[]): string =>
      new Intl.ListFormat(intlLocaleTag(locale), { type: 'conjunction' }).format(names),
    /** What the player is told when a report was not saved. The choice snaps back; the text stands in the sheet. */
    describeFailure: (failure: SideClaimFailure, contest: HoleContest): string =>
      t(`failure.${FAILURE_KEY[failure]}`, { group: group(contest) }),
  };
}

export type SideContestText = ReturnType<typeof useSideContestText>;
