// #2265: copyen i Rundedagboka og statistikken. Type A.
//
// To jobber, samme mønster som `profileCopy.test.ts` og `homeCopy.test.ts`:
//  1. **Paritetsport mot webben.** Alt som også står på `/profile/historikk`
//     hentes fra `messages/no.json` og sammenlignes tegn for tegn. Flertall og
//     plassholdere låses som webbens mal, og appens utfall testes for seg.
//  2. **Ingen tekst uten setning**, og tallene med norsk komma.
import source from '../../../../messages/no.json';
import { isFinishedSentence } from '../test/copy';
import {
  HISTORY_TEXT,
  bestLabel,
  diffCurveLabel,
  fieldSizeShort,
  formCurveLabel,
  formSentence,
  formatOneDecimal,
  placementSpoken,
  pointsShort,
  puttsNearMiss,
  seasonLine,
  seasonVsPrevious,
  streakSeason,
} from './historyCopy';

const web = source.profile.historikk;
const webStats = source.profile.myStats;
const webResult = source.finishedCard.result;

describe('parity with /profile/historikk', () => {
  it.each([
    [HISTORY_TEXT.kicker, web.kicker],
    [HISTORY_TEXT.statsTitle, web.tabStats],
    [HISTORY_TEXT.emptyState, web.emptyState],
    [HISTORY_TEXT.unknownCourse, web.unknownCourse],
    [HISTORY_TEXT.myStatsHeading, webStats.heading],
    [HISTORY_TEXT.myStatsRounds, webStats.roundsPlayed],
    [HISTORY_TEXT.myStatsAverage, webStats.grossAverage],
    [HISTORY_TEXT.myStatsBest, webStats.bestRound],
    [HISTORY_TEXT.diffHeading, web.diffHeading],
    [HISTORY_TEXT.seasonHeading, web.seasonHeading],
    [HISTORY_TEXT.seasonSubtitle, web.seasonSubtitle],
    [HISTORY_TEXT.seasonColRounds, web.seasonColRounds],
    [HISTORY_TEXT.seasonColAvg, web.seasonColAvg],
    [HISTORY_TEXT.seasonColBest, web.seasonColBest],
    [HISTORY_TEXT.seasonBragderLabel, web.seasonBragderLabel],
    [HISTORY_TEXT.seasonEmpty, web.seasonEmpty],
    [HISTORY_TEXT.seasonYearAriaLabel, web.seasonYearAriaLabel],
    [HISTORY_TEXT.streakHeading, web.streakHeading],
    [HISTORY_TEXT.streakSubtitle, web.streakSubtitle],
    [HISTORY_TEXT.streakWeeksLabel, web.streakWeeksLabel],
    [HISTORY_TEXT.streakDormant, web.streakDormant],
    [HISTORY_TEXT.achievementsHeading, web.achievementsHeading],
    [HISTORY_TEXT.achievementsSubtitle, web.achievementsSubtitle],
    [HISTORY_TEXT.brag.holeInOne, web.achievementsBadge_holeInOne],
    [HISTORY_TEXT.brag.eagle, web.achievementsBadge_eagle],
    [HISTORY_TEXT.brag.birdie, web.achievementsBadge_birdie],
    [HISTORY_TEXT.brag.turkey, web.achievementsBadge_turkey],
    [HISTORY_TEXT.brag.holeInOne, web.seasonBrag_holeInOne],
    [HISTORY_TEXT.brag.eagle, web.seasonBrag_eagle],
    [HISTORY_TEXT.brag.birdie, web.seasonBrag_birdie],
    [HISTORY_TEXT.brag.turkey, web.seasonBrag_turkey],
    [HISTORY_TEXT.puttsHeading, web.puttsHeading],
    [HISTORY_TEXT.puttsSubtitle, web.puttsSubtitle],
    [HISTORY_TEXT.puttsColPph, web.puttsColPph],
    [HISTORY_TEXT.puttsColRounds, web.puttsColRounds],
    [HISTORY_TEXT.puttsColAvg, web.puttsColAvg],
    [HISTORY_TEXT.puttsColBest, web.puttsColBest],
    [HISTORY_TEXT.puttsEmpty, web.puttsEmpty],
    [HISTORY_TEXT.coursesHeading, web.coursesHeading],
    [HISTORY_TEXT.coursesSubtitle, web.coursesSubtitle],
    [HISTORY_TEXT.coursesColRounds, web.coursesColRounds],
    [HISTORY_TEXT.coursesColAvg, web.coursesColAvg],
    [HISTORY_TEXT.coursesColBest, web.coursesColBest],
    [HISTORY_TEXT.coursesEmpty, web.coursesEmpty],
  ])('«%s» is the web’s text', (app, webText) => {
    expect(app).toBe(webText);
  });

  it('builds the templated sentences from the web’s templates', () => {
    expect(web.seasonVsPrevious).toBe('Sammenlignet med {year}');
    expect(seasonVsPrevious(2025)).toBe(web.seasonVsPrevious.replace('{year}', '2025'));

    expect(webResult.placement).toBe('{rank}. plass av {fieldSize}');
    expect(placementSpoken({ kind: 'placement', rank: 2, fieldSize: 8, isTeam: false })).toBe(
      '2. plass av 8',
    );
    expect(placementSpoken({ kind: 'skins', skins: 0, rank: 4, fieldSize: 6 })).toBe('4. plass av 6');
    expect(webResult.teamPlacement).toBe('Laget ble nr {rank} av {fieldSize}');
    expect(placementSpoken({ kind: 'placement', rank: 1, fieldSize: 5, isTeam: true })).toBe(
      'Laget ble nr 1 av 5',
    );
  });

  it('gives the plural forms the web’s ICU templates give', () => {
    expect(web.streakSeason).toBe('{count, plural, one {# runde} other {# runder}} i {year}');
    expect(streakSeason(1, 2026)).toBe('1 runde i 2026');
    expect(streakSeason(12, 2026)).toBe('12 runder i 2026');

    expect(web.diffAriaLabel).toBe(
      '{count, plural, one {Handicap-form over 1 fullført runde, fra eldst til nyest.} other {Handicap-form over # fullførte runder, fra eldst til nyest.}}',
    );
    expect(diffCurveLabel(1)).toBe('Handicap-form over 1 fullført runde, fra eldst til nyest.');
    expect(diffCurveLabel(7)).toBe('Handicap-form over 7 fullførte runder, fra eldst til nyest.');

    expect(web.puttsNearMiss).toBe(
      'Nesten! Du mangler putt på {missingHoles} hull i {partialRounds, plural, one {# runde} other {# runder}}.',
    );
    expect(puttsNearMiss(3, 1)).toBe('Nesten! Du mangler putt på 3 hull i 1 runde.');
    expect(puttsNearMiss(5, 2)).toBe('Nesten! Du mangler putt på 5 hull i 2 runder.');
  });
});

describe('the design canvas’ lines', () => {
  it('reads the subtitle for one and for many rounds', () => {
    expect(seasonLine(16, 2026)).toBe('16 runder i 2026');
    expect(seasonLine(1, 2026)).toBe('1 runde i 2026');
  });

  it('says better or worse, to one decimal, without «i snitt»', () => {
    expect(formSentence(3.8)).toBe('3,8 slag bedre enn de fem rundene før');
    expect(formSentence(-2.1)).toBe('2,1 slag dårligere enn de fem rundene før');
    expect(formSentence(2)).toBe('2,0 slag bedre enn de fem rundene før');
  });

  it('labels the gold dot', () => {
    expect(bestLabel('82', true)).toBe('82 · ny rekord');
    expect(bestLabel('82', false)).toBe('82 · beste');
  });

  it('sums up the curve as the canvas’ aria-label', () => {
    expect(formCurveLabel(11, 92, 82)).toBe('Brutto de siste 11 rundene, fra 92 til 82 slag');
  });

  it('gives points and the field as the canvas writes them', () => {
    expect(pointsShort(38)).toBe('38 p');
    expect(fieldSizeShort(8)).toBe('av 8');
  });
});

describe('formatOneDecimal', () => {
  it.each([
    [86.6, '86,6'],
    [86.6667, '86,7'],
    [3, '3,0'],
    [-1.25, '−1,3'],
    [-0.04, '0,0'],
    [0, '0,0'],
  ])('%s → %s', (value, text) => {
    expect(formatOneDecimal(value)).toBe(text);
  });
});

describe('every line is a finished sentence', () => {
  const lines: [string, string][] = Object.entries(HISTORY_TEXT).flatMap(
    ([key, value]): [string, string][] =>
      typeof value === 'string' ? [[key, value]] : Object.entries(value),
  );

  it.each(lines)('%s', (_key, text) => {
    expect(isFinishedSentence(text)).toBe(true);
  });
});
