// native/app/src/lib/courseCopy.test.ts
// #2757: paritets-porten mellom «Ny bane» i appen og nettets
// `messages/no.json` → `courseForm.*`. Samme grep som `createGameCopy.test.ts`:
// rettes en tekst på nettet uten at appen følger etter, blir CI rød.
import source from '../../../../messages/no.json';
import { isFinishedSentence } from '../test/copy';
import type { CourseDraftProblem } from './courseDraft';
import {
  COURSE_TEXT,
  addAnywayLabel,
  describeCourseProblem,
  describeCourseSaveFailure,
  describeMissingCount,
  describeMissingList,
  indexCellLabel,
  parCellLabel,
  parTotalLine,
  parTotalNineLine,
  similarCourseMeta,
  teeCellLabel,
  teeLengthLabel,
  teeMaxReached,
  teeNameDuplicate,
} from './courseCopy';

const { form, door, errors, similar } = source.courseForm;

describe('paritet med courseForm i messages/no.json', () => {
  it.each([
    ['topTitle', door.kicker],
    ['subtitle', door.subtitle],
    ['nameLabel', form.nameLabel],
    ['namePlaceholder', form.namePlaceholder],
    ['holeCountLegend', form.holeCountLegend],
    ['holeCount18', form.holeCount18],
    ['holeCount9', form.holeCount9],
    ['gridHole', form.gridHole],
    ['gridPar', form.gridPar],
    ['gridIndex', form.gridIndex],
    ['gridIndexRound1', form.gridIndexRound1],
    ['gridIndexRound2', form.gridIndexRound2],
    ['holesHint', form.holesHint],
    ['nineHint', form.nineHint],
    ['splitButton', form.splitButton],
    ['splitDone', form.splitDone],
    ['teeChipsKicker', form.teeChipsKicker],
    ['teeChipOther', form.teeChipOther],
    ['teeCustomNameLabel', form.teeCustomNameLabel],
    ['teeCustomNamePlaceholder', form.teeCustomNamePlaceholder],
    ['teeCustomNameAdd', form.teeCustomNameAdd],
    ['teeTableKicker', form.teeTableKicker],
    ['teeColMens', form.teeColMens],
    ['teeColLadies', form.teeColLadies],
    ['teeColJuniors', form.teeColJuniors],
    ['teeGenderMens', form.teeGenderMens],
    ['teeGenderLadies', form.teeGenderLadies],
    ['teeGenderJuniors', form.teeGenderJuniors],
    ['teeFieldSlope', form.teeFieldSlope],
    ['teeFieldCr', form.teeFieldCr],
    ['teeEmptyHint', form.teeEmptyHint],
    ['teeNineHint', form.teeNineHint],
    ['removeJuniors', form.removeJuniorsColumn],
    ['teeLength', form.teeLengthKicker],
    ['similarHeading', similar.heading],
    ['useThis', similar.useThis],
    ['save', door.submitLabel],
    ['saving', form.pendingLabel],
    ['saveFailed', errors.db_course],
  ] as const)('%s', (key, web) => {
    expect(COURSE_TEXT[key]).toBe(web);
  });

  it('feilene med plassholdere', () => {
    expect(describeCourseProblem({ code: 'name_required' })).toBe(errors.name_required);
    expect(describeCourseProblem({ code: 'bad_par' })).toBe(errors.bad_par);
    expect(describeCourseProblem({ code: 'tee_required' })).toBe(form.teeNoneSelected);
    expect(describeCourseProblem({ code: 'tee_partial_rating', name: 'Gul' })).toBe(
      form.teeRatingPartial.replace('{name}', 'Gul'),
    );
    expect(describeCourseProblem({ code: 'tee_no_rating', name: 'Gul' })).toBe(
      form.teeRatingMissing.replace('{name}', 'Gul'),
    );
    expect(describeMissingList([3, 7])).toBe(form.siMissingList.replace('{numbers}', '3 og 7'));
    expect(describeMissingCount(9)).toBe(form.siMissingCountRule.replace('{count}', '9'));
    expect(parTotalLine(72)).toBe(form.parTotalShort.replace('{total}', '72'));
    expect(parTotalNineLine(36, 72)).toBe(
      form.parTotalNine.replace('{nine}', '36').replace('{total}', '72'),
    );
    expect(parCellLabel(3, '4')).toBe(form.parCellAria.replace('{number}', '3').replace('{par}', '4'));
    expect(indexCellLabel(3, 1)).toBe(form.indexCellLabel.replace('{number}', '3'));
    expect(indexCellLabel(3, 2)).toBe(form.indexCellLabelRound2.replace('{number}', '3'));
    expect(teeCellLabel('Gul', 'herre', 'slope')).toBe(
      form.teeCellAria.replace('{name}', 'Gul').replace('{gender}', 'herre').replace('{field}', 'slope'),
    );
    expect(teeLengthLabel('Gul')).toBe(form.teeLengthAria.replace('{name}', 'Gul'));
    expect(teeNameDuplicate('Gul')).toBe(form.teeCustomNameDuplicate.replace('{name}', 'Gul'));
    expect(teeMaxReached(7)).toBe(form.teeMaxReached.replace('{max}', '7'));
    expect(addAnywayLabel('Byneset')).toBe(similar.addAnyway.replace('{name}', 'Byneset'));
    expect(addAnywayLabel('Byneset Golfklubb')).toBe(similar.addAnywayShort.replace('{name}', 'Byneset Golf'));
  });
});

describe('describeCourseProblem', () => {
  it.each<[CourseDraftProblem, string]>([
    [{ code: 'si_invalid', holes: [3] }, 'Indeksen på hull 3 må være et helt tall fra 1 til 18'],
    [{ code: 'si_invalid', holes: [3, 4] }, 'Indeksene på hull 3 og 4 må være hele tall fra 1 til 18'],
    [{ code: 'si_duplicate', numbers: [7] }, 'Indeks 7 er brukt mer enn én gang'],
    [{ code: 'si_duplicate', numbers: [5, 7, 9] }, 'Indeksene 5, 7 og 9 er brukt mer enn én gang'],
    [{ code: 'si_missing', count: 1 }, 'Mangler én indeks'],
    [{ code: 'si_missing', count: 18 }, 'Mangler 18 indekser'],
    [{ code: 'tee_out_of_range', name: 'Gul', field: 'slope' }, 'Slope på Gul må være et helt tall fra 55 til 165'],
    [{ code: 'tee_out_of_range', name: 'Gul', field: 'cr' }, 'CR på Gul må være et tall fra 50 til 90'],
    [
      { code: 'tee_out_of_range', name: 'Gul', field: 'length' },
      'Lengden på Gul må være et helt tall fra 1\u00a0000 til 12\u00a0000 meter',
    ],
  ])('%j', (problem, text) => {
    expect(describeCourseProblem(problem)).toBe(text);
    expect(isFinishedSentence(text)).toBe(true);
  });
});

describe('describeCourseSaveFailure', () => {
  it('nettet får nett-setningen, resten den generelle', () => {
    expect(describeCourseSaveFailure('network')).toBe('Fikk ikke kontakt. Sjekk nettet og prøv igjen.');
    expect(describeCourseSaveFailure('db')).toBe(errors.db_course);
    expect(describeCourseSaveFailure('no_row')).toBe(errors.db_course);
    expect(describeCourseSaveFailure('not_authenticated')).toBe(errors.db_course);
  });
});

describe('similarCourseMeta', () => {
  it.each([
    [{ holeCount: 18, par: 72, teeCount: 2, roundCount: 41 }, '18 hull · par 72 · to tee-er · brukt i 41 runder'],
    [{ holeCount: 18, par: 70, teeCount: 1, roundCount: 1 }, '18 hull · par 70 · én tee · brukt i én runde'],
    [{ holeCount: 9, par: 36, teeCount: 0, roundCount: 0 }, '9 hull · par 36 · ingen tee-er · ikke brukt ennå'],
    [{ holeCount: 18, par: 72, teeCount: 13, roundCount: 2 }, '18 hull · par 72 · 13 tee-er · brukt i 2 runder'],
  ])('%j', (course, text) => {
    expect(similarCourseMeta(course)).toBe(text);
  });

  it('ordene er nettets', () => {
    for (const word of ['ingen tee-er', 'én tee', 'to tee-er', 'tolv tee-er', 'ikke brukt ennå', 'brukt i én runde']) {
      expect(similar.meta).toContain(word);
    }
  });
});

describe('app-egne setninger', () => {
  it('er ferdige setninger', () => {
    expect(isFinishedSentence(COURSE_TEXT.newCourseLink)).toBe(true);
    expect(isFinishedSentence(COURSE_TEXT.parTapHint)).toBe(true);
    expect(isFinishedSentence(COURSE_TEXT.addJuniors)).toBe(true);
    expect(isFinishedSentence(COURSE_TEXT.saveOffline)).toBe(true);
  });
});
