// native/app/src/lib/courseDraft.test.ts
// #2757: banen i appen, Type A. Utkastet går gjennom nettets egen parser
// (`parseCourseHolesAndTees`), så paritetstestene her er at de samme tallene gir
// de samme radene, og at det parseren stopper, også stopper skjermen.
import { emptyTee } from '../../../../lib/courses/teeChips';
import {
  CourseDraftError,
  addTeeChip,
  courseDraftProblem,
  courseDraftToFormData,
  emptyCourseDraft,
  indexAdvances,
  indexValues,
  nextParValue,
  parseCourseDraft,
  setHoleCount,
  setHoleIndex,
  setHolePar,
  setSecondRoundIndex,
  splitNineIndices,
  type CourseDraft,
  type TeeDraft,
} from './courseDraft';

// Indeksene 1–18 i hullrekkefølge: det enkleste gyldige banekortet.
function fullIndices(draft: CourseDraft): CourseDraft {
  return draft.holes.reduce((d, _hole, i) => setHoleIndex(d, i, String(i + 1)), draft);
}

const gul: TeeDraft = {
  ...emptyTee('Gul', 'yellow'),
  slope_mens: '125',
  course_rating_mens: '70,5',
  slope_ladies: '130',
  course_rating_ladies: '73,2',
};

function validDraft(tees: TeeDraft[] = [gul]): CourseDraft {
  return { ...fullIndices(emptyCourseDraft('Testbane 2757')), tees };
}

function validNineDraft(): CourseDraft {
  let draft = setHoleCount(emptyCourseDraft('Nibanen'), 9);
  for (let i = 0; i < 9; i++) {
    draft = setHoleIndex(draft, i, String(2 * i + 1));
    draft = setSecondRoundIndex(draft, i, String(2 * i + 2));
  }
  return { ...draft, tees: [gul] };
}

describe('courseDraftToFormData + den delte parseren', () => {
  it('gir 18 hull og par-summene på tee-raden', () => {
    const parsed = parseCourseDraft(validDraft());
    expect(parsed.name).toBe('Testbane 2757');
    expect(parsed.nineHoles).toBe(false);
    expect(parsed.holes).toHaveLength(18);
    expect(parsed.holes[0]).toEqual({
      hole_number: 1,
      par_mens: 4,
      par_ladies: 4,
      par_juniors: 4,
      stroke_index: 1,
    });
    expect(parsed.teeBoxes).toEqual([
      {
        id: null,
        name: 'Gul',
        color: 'yellow',
        length_meters: null,
        slope_mens: 125,
        course_rating_mens: 70.5,
        par_total_mens: 72,
        slope_ladies: 130,
        course_rating_ladies: 73.2,
        par_total_ladies: 72,
        slope_juniors: null,
        course_rating_juniors: null,
        par_total_juniors: null,
      },
    ]);
  });

  it('bruker nøyaktig nettets feltnavn', () => {
    const fields = courseDraftToFormData(validDraft()).toObject();
    expect(fields).toMatchObject({
      name: 'Testbane 2757',
      hole_count: '18',
      hole_1_par_mens: '4',
      hole_18_si: '18',
      tee_0_name: 'Gul',
      tee_0_color: 'yellow',
      tee_0_slope_mens: '125',
      tee_0_cr_mens: '70.5',
      tee_0_slope_ladies: '130',
      tee_0_cr_ladies: '73.2',
      tee_0_slope_juniors: '',
      tee_0_cr_juniors: '',
      tee_0_length_meters: '',
    });
    // Ett par per hull (eierens svar): parseren speiler herrenes par selv.
    expect(fields).not.toHaveProperty('hole_1_par_ladies');
    expect(fields).not.toHaveProperty('hole_1_par_juniors');
    expect(fields).not.toHaveProperty('hole_1_si2');
  });

  it('en tee uten farge sender ingen farge', () => {
    const fields = courseDraftToFormData(
      validDraft([{ ...emptyTee('57', null), slope_mens: '125', course_rating_mens: '70' }]),
    ).toObject();
    expect(fields).not.toHaveProperty('tee_0_color');
    expect(parseCourseDraft(validDraft([{ ...emptyTee('57', null), slope_mens: '125', course_rating_mens: '70' }])).teeBoxes[0]!.color).toBeNull();
  });

  it('9-hullsbanen gir hull 10–18 med par fra 1–9 og indeksen fra rad 2', () => {
    const draft = setHolePar(validNineDraft(), 0);
    const parsed = parseCourseDraft(draft);
    expect(parsed.nineHoles).toBe(true);
    expect(parsed.holes).toHaveLength(18);
    expect(parsed.holes[0]).toMatchObject({ hole_number: 1, par_mens: 5, stroke_index: 1 });
    expect(parsed.holes[9]).toMatchObject({ hole_number: 10, par_mens: 5, stroke_index: 2 });
    expect(parsed.holes[17]).toMatchObject({ hole_number: 18, par_mens: 4, stroke_index: 18 });
    expect(parsed.teeBoxes[0]!.par_total_mens).toBe(74);
  });

  it('sender lengden, og et tomt felt blir null', () => {
    const parsed = parseCourseDraft(validDraft([{ ...gul, length_meters: '5800' }, { ...emptyTee('Rød', 'red'), slope_ladies: '120', course_rating_ladies: '68' }]));
    expect(parsed.teeBoxes.map((t) => t.length_meters)).toEqual([5800, null]);
  });

  it('kaster CourseDraftError med parserens kode', () => {
    expect(() => parseCourseDraft(emptyCourseDraft())).toThrow(CourseDraftError);
    try {
      parseCourseDraft(emptyCourseDraft());
    } catch (error) {
      expect((error as CourseDraftError).code).toBe('name_required');
    }
  });
});

describe('courseDraftProblem', () => {
  it('et gyldig utkast har ingen problem', () => {
    expect(courseDraftProblem(validDraft())).toBeNull();
  });

  it('nytt utkast: navnet først, som parseren', () => {
    expect(courseDraftProblem(emptyCourseDraft())).toEqual({ code: 'name_required' });
    expect(courseDraftProblem(emptyCourseDraft('   '))).toEqual({ code: 'name_required' });
  });

  it('bare navn: alle 18 indekser mangler', () => {
    expect(courseDraftProblem(emptyCourseDraft('Banen'))).toEqual({ code: 'si_missing', count: 18 });
  });

  it('indeks 7 to ganger er en dobbel, også mens andre felt står tomme', () => {
    let draft = emptyCourseDraft('Banen');
    draft = setHoleIndex(draft, 0, '7');
    draft = setHoleIndex(draft, 1, '7');
    expect(courseDraftProblem(draft)).toEqual({ code: 'si_duplicate', numbers: [7] });
    expect(courseDraftProblem(setHoleIndex(validDraft(), 6, '8'))).toEqual({
      code: 'si_duplicate',
      numbers: [8],
    });
  });

  it('et tall utenfor 1–18 navngir hullet', () => {
    expect(courseDraftProblem(setHoleIndex(validDraft(), 2, '19'))).toEqual({
      code: 'si_invalid',
      holes: [3],
    });
  });

  it('på 9 hull er feil i rad 2 samme hull som i rad 1', () => {
    const draft = setSecondRoundIndex(validNineDraft(), 2, '19');
    expect(courseDraftProblem(draft)).toEqual({ code: 'si_invalid', holes: [3] });
    // Rad 2 gjentar rad 1: to like indekser, ikke to riktige runder.
    const repeated = setSecondRoundIndex(validNineDraft(), 0, '1');
    expect(courseDraftProblem(repeated)).toEqual({ code: 'si_duplicate', numbers: [1] });
  });

  it('ingen tee', () => {
    expect(courseDraftProblem(validDraft([]))).toEqual({ code: 'tee_required' });
  });

  it('halvt sett navngir den første teen som har det', () => {
    const ok = gul;
    const halv = { ...emptyTee('Rød', 'red'), slope_mens: '125' };
    expect(courseDraftProblem(validDraft([ok, halv]))).toEqual({
      code: 'tee_partial_rating',
      name: 'Rød',
    });
  });

  it('en tee uten tall navngis', () => {
    expect(courseDraftProblem(validDraft([gul, emptyTee('Hvit', 'white')]))).toEqual({
      code: 'tee_no_rating',
      name: 'Hvit',
    });
  });

  it.each([
    ['slope_mens', '55', 'course_rating_mens', '70'],
    ['slope_mens', '165', 'course_rating_mens', '70'],
    ['slope_mens', '125', 'course_rating_mens', '50'],
    ['slope_mens', '125', 'course_rating_mens', '90'],
    ['slope_mens', '125', 'course_rating_mens', '70,5'],
  ])('grensene på tee-tallene holder: %s %s, %s %s', (slopeKey, slope, crKey, cr) => {
    expect(courseDraftProblem(validDraft([{ ...emptyTee('Gul', 'yellow'), [slopeKey]: slope, [crKey]: cr }]))).toBeNull();
  });

  it.each([
    ['54', '70', 'slope'],
    ['166', '70', 'slope'],
    ['12,5', '70', 'slope'],
    ['125', '49,9', 'cr'],
    ['125', '90,1', 'cr'],
  ] as const)('slope %s / CR %s er utenfor grensene: %s', (slope, cr, field) => {
    // Alene: parseren ville sagt «mangler slope og CR».
    const alone = { ...emptyTee('Gul', 'yellow'), slope_mens: slope, course_rating_mens: cr };
    expect(courseDraftProblem(validDraft([alone]))).toEqual({
      code: 'tee_out_of_range',
      name: 'Gul',
      field,
    });
    // Ved siden av et gyldig sett: parseren ville godtatt og stille droppet tallet.
    const beside = { ...gul, slope_juniors: slope, course_rating_juniors: cr };
    expect(courseDraftProblem(validDraft([beside]))).toEqual({
      code: 'tee_out_of_range',
      name: 'Gul',
      field,
    });
  });

  it.each(['1000', '12000', ''])('lengde %j er gyldig', (length) => {
    expect(courseDraftProblem(validDraft([{ ...gul, length_meters: length }]))).toBeNull();
  });

  it.each(['999', '12001', '5800,5', 'abc'])('lengde %j stopper lagringen', (length) => {
    expect(courseDraftProblem(validDraft([{ ...gul, length_meters: length }]))).toEqual({
      code: 'tee_out_of_range',
      name: 'Gul',
      field: 'length',
    });
  });
});

describe('18 og 9 hull', () => {
  it('18 → 9 beholder hull 1–9 og gjør indeksene på 10–18 til rad 2', () => {
    const draft = setHoleCount(setHolePar(validDraft(), 0), 9);
    expect(draft.holeCount).toBe(9);
    expect(draft.holes).toHaveLength(9);
    expect(draft.holes[0]).toEqual({ par: '5', index: '1' });
    expect(draft.secondRound).toEqual(['10', '11', '12', '13', '14', '15', '16', '17', '18']);
  });

  it('9 → 18 lar tallene stå, med par fra 1–9 på 10–18', () => {
    const nine = setHolePar(validNineDraft(), 0);
    const draft = setHoleCount(nine, 18);
    expect(draft.holes).toHaveLength(18);
    expect(draft.holes[9]).toEqual({ par: '5', index: '2' });
    expect(draft.secondRound).toEqual([]);
    expect(setHoleCount(draft, 18)).toBe(draft);
  });

  it('indexValues gir de 18 tallene serveren ser', () => {
    expect(indexValues(validNineDraft())).toEqual(
      [1, 3, 5, 7, 9, 11, 13, 15, 17, 2, 4, 6, 8, 10, 12, 14, 16, 18].map(String),
    );
    expect(indexValues(validDraft())).toEqual(Array.from({ length: 18 }, (_, i) => String(i + 1)));
  });

  it('«Fordel» gir oddetall første runde og partall andre', () => {
    let draft = setHoleCount(emptyCourseDraft('Nibanen'), 9);
    for (let i = 0; i < 9; i++) draft = setHoleIndex(draft, i, String(i + 1));
    const split = splitNineIndices(draft);
    expect(split.holes.map((h) => h.index)).toEqual(['1', '3', '5', '7', '9', '11', '13', '15', '17']);
    expect(split.secondRound).toEqual(['2', '4', '6', '8', '10', '12', '14', '16', '18']);
  });
});

describe('nextParValue', () => {
  it.each([
    ['3', '4'],
    ['4', '5'],
    ['5', '6'],
    ['6', '3'],
  ])('%s → %s', (from, to) => {
    expect(nextParValue(from)).toBe(to);
  });
});

describe('indexAdvances: når fokus flytter seg til neste felt', () => {
  it.each([
    ['', '2', true],
    ['', '9', true],
    ['', '1', false],
    ['', '0', false],
    ['1', '12', true],
    ['1', '18', true],
    ['23', '2', false],
    ['12', '5', true],
    ['12', '1', false],
    ['1', '', false],
    ['5', '5', false],
  ])('%j → %j: %s', (previous, next, advances) => {
    expect(indexAdvances(previous, next)).toBe(advances);
  });
});

describe('addTeeChip', () => {
  it('fargen legges til med norsk navn', () => {
    expect(addTeeChip([], 'yellow').map((t) => [t.name, t.color])).toEqual([['Gul', 'yellow']]);
  });

  it('et nytt trykk tar teen bort', () => {
    expect(addTeeChip(addTeeChip([], 'yellow'), 'yellow')).toEqual([]);
  });
});
