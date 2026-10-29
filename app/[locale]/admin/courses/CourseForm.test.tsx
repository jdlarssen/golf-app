import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import {
  CourseForm,
  hasHoleChanges,
  sumHolePars,
  type HoleData,
  type TeeBoxData,
} from './CourseForm';
import { REAL_SI } from '@/lib/courses/__fixtures__/courseForm';
import { TEE_BOUNDS } from '@/lib/courses/coursePayload';
import { emptyTee } from '@/lib/courses/teeChips';
import type { SimilarCourse } from '@/lib/courses/similarCourses';

// #2485: the similar-courses panel asks a server action; here it answers from a stub.
const findSimilarCourses = vi.fn<(query: string) => Promise<SimilarCourse[]>>();
vi.mock('@/lib/courses/similarCourses', () => ({
  findSimilarCourses: (query: string) => findSimilarCourses(query),
}));

function makeHoles(pars: number[]): HoleData[] {
  return pars.map((par, i) => ({
    hole_number: i + 1,
    par_mens: String(par),
    par_ladies: String(par),
    par_juniors: String(par),
    stroke_index: String(i + 1),
  }));
}

const NO_OP = async () => {};

function setField(container: HTMLElement, name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  fireEvent.change(input!, { target: { value } });
}

function fillStrokeIndices(container: HTMLElement, order: readonly number[] = REAL_SI) {
  order.forEach((si, i) => setField(container, `hole_${i + 1}_si`, String(si)));
}

/** The par cell for a hole on the course card, found by its current par. */
function parCell(hole: number, par: number) {
  return screen.getByRole('button', { name: `Par for hull ${hole}: ${par}. Trykk for å endre` });
}

/** A tee chip, by the text it shows. */
function chip(name: string) {
  return screen.getByRole('button', { name });
}

function fillMensRating(container: HTMLElement, tee = 0, slope = '113', cr = '70.0') {
  setField(container, `tee_${tee}_slope_mens`, slope);
  setField(container, `tee_${tee}_cr_mens`, cr);
}

describe('hasHoleChanges', () => {
  const baseline = makeHoles(Array(18).fill(4));

  it('returnerer false når current er identisk med initial', () => {
    expect(hasHoleChanges(baseline, makeHoles(Array(18).fill(4)))).toBe(false);
  });

  it('returnerer true når par på ett hull er endret', () => {
    const current = makeHoles(Array(18).fill(4));
    current[4].par_mens = '5';
    expect(hasHoleChanges(baseline, current)).toBe(true);
  });

  it('returnerer true når stroke_index på ett hull er endret', () => {
    const current = makeHoles(Array(18).fill(4));
    current[3].stroke_index = '17';
    expect(hasHoleChanges(baseline, current)).toBe(true);
  });

  it('returnerer false når initial er undefined (create-flyten har ingen baseline)', () => {
    expect(hasHoleChanges(undefined, makeHoles(Array(18).fill(4)))).toBe(false);
  });

  it('returnerer true når initial mangler et hull som finnes i current (defensive default)', () => {
    const truncated = baseline.slice(0, 17);
    expect(hasHoleChanges(truncated, makeHoles(Array(18).fill(4)))).toBe(true);
  });
});

describe('sumHolePars', () => {
  it('summerer 18 fire-er til 72', () => {
    expect(sumHolePars(makeHoles(Array(18).fill(4)))).toBe(72);
  });

  it('ignorerer hull med ugyldig par-streng', () => {
    const holes = makeHoles([4, 4, 4]);
    holes[1].par_mens = '';
    expect(sumHolePars(holes)).toBe(8);
  });

  it('summerer blandet par-sekvens med par 3/4/5 til riktig sum', () => {
    // 4 par-3 + 11 par-4 + 3 par-5 = 12 + 44 + 15 = 71
    const sequence = [3, 4, 5, 4, 3, 4, 4, 4, 4, 4, 5, 4, 3, 3, 4, 4, 5, 4];
    expect(sumHolePars(makeHoles(sequence))).toBe(71);
  });
});

describe('CourseForm — par-celler', () => {
  it('rendrer én par-knapp per hull, ikke number-input for par', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    expect(parCell(1, 4).textContent).toBe('4');
    expect(
      container.querySelector('input[type="hidden"][name="hole_1_par_mens"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('input[type="number"][name="hole_1_par_mens"]'),
    ).toBeNull();
  });

  it('viser default par 4 i knappens navn på mount', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    const hole1 = screen.getByRole('button', { name: /^Par for hull 1:/ });
    expect(hole1.getAttribute('aria-label')).toContain(': 4.');
  });

  it('endrer par til 5 ved klikk og oppdaterer hidden-input', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(parCell(1, 4));

    expect(parCell(1, 5)).toBeTruthy();
    const hidden = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="hole_1_par_mens"]',
    );
    expect(hidden?.value).toBe('5');
  });
});

describe('CourseForm — per-kjønn-par-overstyring', () => {
  it('viser kollapset toggle for damer og junior som default på new-flyt', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    expect(
      screen.getByRole('button', { name: /legg til avvikende par for damer/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /legg til avvikende par for junior/i }),
    ).toBeTruthy();
    // Når kollapset: ingen ekstra par-rad for damer i kortet.
    expect(
      screen.queryByRole('button', { name: /^Par for hull 1 \(damer\)/ }),
    ).toBeNull();
  });

  it('eksponerer 18 nye par-rader når «avvikende par for damer» klikkes', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(
      screen.getByRole('button', { name: /legg til avvikende par for damer/i }),
    );

    // Dame-raden står i begge tabellene: 18 par-knapper.
    const dameCells = screen.getAllByRole('button', {
      name: /^Par for hull \d+ \(damer\)/,
    });
    expect(dameCells).toHaveLength(18);
  });

  it('rendrer hidden-inputs hole_${n}_par_ladies når dame-par-seksjonen er utvidet', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(
      screen.getByRole('button', { name: /legg til avvikende par for damer/i }),
    );

    const ladiesHidden = container.querySelectorAll<HTMLInputElement>(
      'input[type="hidden"][name^="hole_"][name$="_par_ladies"]',
    );
    expect(ladiesHidden.length).toBe(18);
    expect(ladiesHidden[0].value).toBe('4');
  });

  it('rendrer mirror-input par_ladies = par_mens når dame-par-seksjonen er kollapset', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    // Kollapset = mirror-inputs sender samme verdi som par_mens.
    const ladiesHidden = container.querySelectorAll<HTMLInputElement>(
      'input[type="hidden"][name^="hole_"][name$="_par_ladies"]',
    );
    expect(ladiesHidden.length).toBe(18);
    expect(ladiesHidden[0].value).toBe('4');
  });

  it('hovedrad-endring speiles til par_ladies/par_juniors så lenge seksjonene er kollapset', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(parCell(1, 4));

    const ladies1 = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="hole_1_par_ladies"]',
    );
    const juniors1 = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="hole_1_par_juniors"]',
    );
    expect(ladies1?.value).toBe('5');
    expect(juniors1?.value).toBe('5');
  });

  it('når dame-seksjonen er åpen, fryses dame-par uavhengig av hovedraden', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    // Åpne avvikende-par-seksjonen for damer.
    fireEvent.click(
      screen.getByRole('button', { name: /legg til avvikende par for damer/i }),
    );

    // Sett hovedraden hull 1 til par 5.
    fireEvent.click(parCell(1, 4));

    // Dame-par-hull-1 skal fremdeles være 4 (frosset på sin egen verdi).
    const ladies1 = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="hole_1_par_ladies"]',
    );
    expect(ladies1?.value).toBe('4');

    // Junior-par-hull-1 skal speile par_mens siden seksjonen er kollapset.
    const juniors1 = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="hole_1_par_juniors"]',
    );
    expect(juniors1?.value).toBe('5');
  });

  it('fjern-knapp tilbakestiller par_ladies til par_mens og kollapser seksjonen', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    // Åpne dame-par + endre hull 1 til par 5.
    fireEvent.click(
      screen.getByRole('button', { name: /legg til avvikende par for damer/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Par for hull 1 (damer): 4. Trykk for å endre' }),
    );

    let ladies1 = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="hole_1_par_ladies"]',
    );
    expect(ladies1?.value).toBe('5');

    // Trykk «Fjern dame-overstyring»
    fireEvent.click(
      screen.getByRole('button', { name: /fjern dame-overstyring/i }),
    );

    // Dame-raden er borte fra kortet.
    expect(
      screen.queryByRole('button', { name: /^Par for hull 1 \(damer\)/ }),
    ).toBeNull();

    // Mirror-input har resatt par_ladies til par_mens (= 4).
    ladies1 = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="hole_1_par_ladies"]',
    );
    expect(ladies1?.value).toBe('4');
  });

  it('åpner dame-par-seksjonen automatisk på edit-flyt når initialData har avvik', () => {
    const holes = makeHoles(Array(18).fill(4));
    holes[3].par_ladies = '5'; // Hull 4: dame-par 5 vs herre-par 4
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes,
          teeBoxes: [
            {
              name: 'Gul',
              color: 'yellow',
              length_meters: '',
              slope_mens: '113',
              course_rating_mens: '70.0',
              slope_ladies: '',
              course_rating_ladies: '',
              slope_juniors: '',
              course_rating_juniors: '',
            },
          ],
        }}
      />,
    );

    // Dame-raden står i kortet: 18 par-knapper.
    const dameCells = screen.getAllByRole('button', {
      name: /^Par for hull \d+ \(damer\)/,
    });
    expect(dameCells).toHaveLength(18);

    // Junior-seksjonen forblir kollapset (ingen junior-avvik i initialData).
    expect(
      screen.getByRole('button', { name: /legg til avvikende par for junior/i }),
    ).toBeTruthy();
  });
});

describe('CourseForm — confirm-gate ved par/SI-endring + aktive spill', () => {
  const baselineHoles = makeHoles(Array(18).fill(4));
  const teeBoxes: TeeBoxData[] = [
    {
      id: 'tee-1',
      name: 'Gul',
      color: 'yellow',
      length_meters: '',
      slope_mens: '113',
      course_rating_mens: '70.0',
      slope_ladies: '',
      course_rating_ladies: '',
      slope_juniors: '',
      course_rating_juniors: '',
    },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('viser confirm-dialog når par endres og affectedGamesCount > 0', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const action = vi.fn(async () => {});

    render(
      <CourseForm
        action={action}
        submitLabel="Lagre"
        affectedGamesCount={2}
        initialData={{ name: 'Test', holes: baselineHoles, teeBoxes }}
      />,
    );

    fireEvent.click(parCell(1, 4));

    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const msg = confirmSpy.mock.calls[0][0] as string;
    expect(msg).toMatch(/2 spill/);
    expect(msg).toMatch(/par eller stroke-indeks/);
  });

  it('viser IKKE confirm-dialog når ingen hull-endring er gjort, selv om affectedGamesCount > 0', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <CourseForm
        action={async () => {}}
        submitLabel="Lagre"
        affectedGamesCount={3}
        initialData={{ name: 'Test', holes: baselineHoles, teeBoxes }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('viser IKKE confirm-dialog når par endres men affectedGamesCount = 0', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <CourseForm
        action={async () => {}}
        submitLabel="Lagre"
        affectedGamesCount={0}
        initialData={{ name: 'Test', holes: baselineHoles, teeBoxes }}
      />,
    );

    fireEvent.click(parCell(1, 4));
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('viser IKKE confirm-dialog på /new-flyten (ingen initialData)', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { container } = render(
      <CourseForm action={async () => {}} submitLabel="Lagre" />,
    );
    // Uten 18 indekser og en tee med slope/CR er «Lagre» grå, og klikket beviser ingenting.
    fillStrokeIndices(container);
    fireEvent.click(chip('Gul'));
    fillMensRating(container);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Lagre' }).disabled).toBe(false);

    fireEvent.click(parCell(1, 4));
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('bruker entall-form «ett spill» når affectedGamesCount = 1', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <CourseForm
        action={async () => {}}
        submitLabel="Lagre"
        affectedGamesCount={1}
        initialData={{ name: 'Test', holes: baselineHoles, teeBoxes }}
      />,
    );

    fireEvent.click(parCell(1, 4));
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/ett spill/);
  });
});

describe('CourseForm: tomme felt på ny bane (#2279)', () => {
  it('starter tom, holder «Lagre» grå og sier hva som mangler til alt er fylt ut', () => {
    const action = vi.fn();
    const { container } = render(<CourseForm action={action} submitLabel="Lagre" />);
    const value = (name: string) =>
      container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value;
    const save = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Lagre' });
    const lines = () =>
      Array.from(container.querySelectorAll('#course-save-status p'), (p) => p.textContent);

    for (let n = 1; n <= 18; n++) expect(value(`hole_${n}_si`)).toBe('');
    // No tee until a chip is tapped (#2486).
    expect(container.querySelector('input[name^="tee_"]')).toBeNull();
    expect(lines()).toEqual(['Mangler 18 indekser', 'Velg minst én tee']);
    fireEvent.click(chip('Gul'));
    expect(value('tee_0_slope_mens')).toBe('');
    expect(value('tee_0_cr_mens')).toBe('');
    expect(container.querySelector('input[name="tee_0_slope_mens"]')!.getAttribute('placeholder')).toBeNull();
    expect(container.querySelector('input[name="tee_0_cr_mens"]')!.getAttribute('placeholder')).toBeNull();
    expect(screen.queryByRole('button', { name: /sett si/i })).toBeNull();
    expect(save().disabled).toBe(true);
    expect(save().getAttribute('aria-describedby')).toBe('course-save-status');
    expect(lines()).toEqual(['Mangler 18 indekser', 'Gul mangler slope og CR']);
    fireEvent.click(save());
    expect(action).not.toHaveBeenCalled();

    // 17 indekser: én mangler.
    fillStrokeIndices(container, REAL_SI.slice(0, 17));
    expect(lines()).toEqual(['Mangler én indeks', 'Gul mangler slope og CR']);
    // 19 er utenfor området: hullet nevnes.
    setField(container, 'hole_18_si', '19');
    expect(lines()).toEqual([
      'Indeksen på hull 18 må være et helt tall fra 1 til 18',
      'Gul mangler slope og CR',
    ]);
    // 7 på to hull: duplikatet nevnes.
    setField(container, 'hole_18_si', '7');
    expect(lines()).toEqual(['Indeks 7 er brukt mer enn én gang', 'Gul mangler slope og CR']);
    // 14 på hull 14 i tillegg til hull 17: to duplikater gir flertall.
    setField(container, 'hole_14_si', '14');
    expect(lines()).toEqual([
      'Indeksene 7 og 14 er brukt mer enn én gang',
      'Gul mangler slope og CR',
    ]);
    setField(container, 'hole_14_si', '2');
    // Bare slope: begge trengs.
    setField(container, 'tee_0_slope_mens', '120');
    expect(lines()).toEqual(['Indeks 7 er brukt mer enn én gang', 'Gul trenger både slope og CR']);
    expect(save().disabled).toBe(true);

    setField(container, 'hole_18_si', '10');
    setField(container, 'tee_0_cr_mens', '70.1');
    expect(save().disabled).toBe(false);
    expect(save().getAttribute('aria-describedby')).toBeNull();
    expect(container.querySelector('#course-save-status')).toBeNull();
  });

  it('redigering: knappen er aktiv fra start, og en ny tee må fylles ut', () => {
    const { container } = render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes: makeHoles(Array(18).fill(4)).map((h, i) => ({
            ...h,
            stroke_index: String(REAL_SI[i]),
          })),
          teeBoxes: [
            {
              id: 'tee-1',
              name: 'Gul',
              color: 'yellow',
              length_meters: '',
              slope_mens: '124',
              course_rating_mens: '71.2',
              slope_ladies: '',
              course_rating_ladies: '',
              slope_juniors: '',
              course_rating_juniors: '',
            },
          ],
        }}
      />,
    );
    const save = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Lagre' });

    expect(save().disabled).toBe(false);
    expect(container.querySelector('#course-save-status')).toBeNull();
    expect(screen.queryByRole('button', { name: /overskriv si/i })).toBeNull();

    fireEvent.click(chip('Rød'));
    expect(container.querySelector<HTMLInputElement>('input[name="tee_1_slope_mens"]')!.value).toBe('');
    expect(save().disabled).toBe(true);
    expect(
      Array.from(container.querySelectorAll('#course-save-status p'), (p) => p.textContent),
    ).toEqual(['Rød mangler slope og CR']);

    fillMensRating(container, 1);
    expect(save().disabled).toBe(false);
  });
});

describe('CourseForm: banekortet (#2278)', () => {
  it('viser hullene i to tabeller, og par går 4 → 5 → 3 → 4 med beskjed til skjermleseren', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    const hidden = () =>
      container.querySelector<HTMLInputElement>('input[type="hidden"][name="hole_1_par_mens"]')!
        .value;
    const live = () => container.querySelector('[aria-live="polite"]')!.textContent;

    expect(screen.getByRole('table', { name: 'Hull 1–9' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Hull 10–18' })).toBeTruthy();

    fireEvent.click(parCell(1, 4));
    expect(hidden()).toBe('5');
    expect(live()).toBe('Hull 1: par 5');
    fireEvent.click(parCell(1, 5));
    expect(hidden()).toBe('3');
    fireEvent.click(parCell(1, 3));
    expect(hidden()).toBe('4');
  });

  it('ny bane: tomme indekser viser «?», kortet lister de som mangler, og et tall to ganger er ugyldig', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    const si = (n: number) =>
      container.querySelector<HTMLInputElement>(`input[name="hole_${n}_si"]`)!;

    for (let n = 1; n <= 18; n++) expect(si(n).getAttribute('placeholder')).toBe('?');

    // Hull 1 har indeks 7 og hull 17 indeks 14 i REAL_SI.
    fillStrokeIndices(container);
    setField(container, 'hole_1_si', '');
    setField(container, 'hole_17_si', '');
    expect(
      screen.getByText('Mangler indeks 7 og 14. Hvert tall fra 1 til 18 brukes én gang.'),
    ).toBeTruthy();

    // 3 står alt på hull 3.
    setField(container, 'hole_1_si', '3');
    expect(si(1).getAttribute('aria-invalid')).toBe('true');
    expect(si(3).getAttribute('aria-invalid')).toBe('true');
    expect(si(2).getAttribute('aria-invalid')).toBeNull();

    // Utenfor 1–18 er også ugyldig.
    setField(container, 'hole_1_si', '19');
    expect(si(1).getAttribute('aria-invalid')).toBe('true');
    expect(si(3).getAttribute('aria-invalid')).toBeNull();

    // Mellomrom tas bort mens du skriver, så feltet og regelen leser likt.
    setField(container, 'hole_1_si', ' 7 ');
    expect(si(1).value).toBe('7');
    expect(si(1).getAttribute('aria-invalid')).toBeNull();
  });

  it('lagrelinja: det som mangler står under «Lagre»', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    const save = screen.getByRole('button', { name: 'Lagre' });
    const status = container.querySelector('#course-save-status')!;

    expect(save.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('CourseForm — «Finnes banen alt?» (#2485)', () => {
  const NORTH: SimilarCourse = {
    id: 'north',
    name: 'Byneset North',
    holeCount: 18,
    par: 72,
    teeCount: 3,
    roundCount: 41,
  };

  function typeName(container: HTMLElement, value: string) {
    fireEvent.change(container.querySelector<HTMLInputElement>('input[name="name"]')!, {
      target: { value },
    });
  }

  it('lists similar courses under the name while you type, and the name still posts', async () => {
    findSimilarCourses.mockReset().mockResolvedValue([NORTH]);
    const { container } = render(
      <CourseForm action={NO_OP} submitLabel="Lagre" similarCourses={{ kind: 'wizard' }} />,
    );
    typeName(container, 'Byneset n');

    const link = await screen.findByRole('link', { name: 'Bruk denne: Byneset North' });
    expect(link).toHaveAttribute('href', '/opprett-spill?bane=north');
    expect(findSimilarCourses).toHaveBeenCalledWith('Byneset n');

    // The list stands between the name field and the course card.
    const nameInput = container.querySelector('input[name="name"]')!;
    const firstPar = parCell(1, 4);
    expect(nameInput.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.compareDocumentPosition(firstPar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const form = container.querySelector('form')!;
    expect(new FormData(form).get('name')).toBe('Byneset n');
  });

  it('«Nei, legg til …» hides the list and moves on to the first par cell', async () => {
    findSimilarCourses.mockReset().mockResolvedValue([NORTH]);
    const { container } = render(
      <CourseForm action={NO_OP} submitLabel="Lagre" similarCourses={{ kind: 'wizard' }} />,
    );
    typeName(container, 'Byneset n');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nei, legg til «Byneset n» som ny bane' }),
    );

    expect(screen.queryByRole('link', { name: /Bruk denne/ })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(parCell(1, 4));
  });

  it('the edit page (no similarCourses) never searches', async () => {
    findSimilarCourses.mockReset().mockResolvedValue([NORTH]);
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    typeName(container, 'Byneset n');
    await new Promise((resolve) => setTimeout(resolve, 400));
    await waitFor(() => expect(findSimilarCourses).not.toHaveBeenCalled());
    expect(screen.queryByText('Finnes banen alt?')).not.toBeInTheDocument();
  });
});

describe('CourseForm: tee-tabellen (#2486)', () => {
  const rowHeader = (name: string) => screen.getByRole('rowheader', { name });
  const teeRows = () =>
    within(screen.getByRole('table', { name: 'Slope og course rating per tee' })).getAllByRole('rowheader');

  it('ny bane: brikkene legger til og fjerner rader, og «+ Annen» spør etter et navn', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(chip('Gul'));
    expect(chip('Gul').getAttribute('aria-pressed')).toBe('true');
    expect(rowHeader('Gul').querySelector('[data-tee-dot]')).not.toBeNull();
    const fields = within(rowHeader('Gul').closest('tr')!).getAllByRole('spinbutton');
    expect(
      fields.map((f) => [f.getAttribute('aria-label'), Number(f.getAttribute('min')), Number(f.getAttribute('max'))]),
    ).toEqual([
      ['Gul, herre, slope', TEE_BOUNDS.slope.min, TEE_BOUNDS.slope.max],
      ['Gul, herre, CR', TEE_BOUNDS.cr.min, TEE_BOUNDS.cr.max],
      ['Gul, dame, slope', TEE_BOUNDS.slope.min, TEE_BOUNDS.slope.max],
      ['Gul, dame, CR', TEE_BOUNDS.cr.min, TEE_BOUNDS.cr.max],
    ]);
    expect(container.querySelector<HTMLInputElement>('input[name="tee_0_color"]')!.value).toBe('yellow');

    fireEvent.click(chip('Gul'));
    expect(chip('Gul').getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('table', { name: /per tee/ })).toBeNull();

    fireEvent.click(chip('+ Annen'));
    const name = screen.getByRole('textbox', { name: 'Navn på tee-en' });
    fireEvent.change(name, { target: { value: '57' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(chip('57').getAttribute('aria-pressed')).toBe('true');
    expect(rowHeader('57').querySelector('[data-tee-dot]')).toBeNull();
    expect(container.querySelector('input[name="tee_0_color"]')).toBeNull();

    fireEvent.click(chip('+ Annen'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Navn på tee-en' }), {
      target: { value: '57' },
    });
    expect(screen.getByText('Banen har alt en tee som heter 57')).toBeTruthy();
    fireEvent.click(chip('Legg til'));
    expect(teeRows()).toHaveLength(1);
  });

  it('redigering: lagrede tee-er står trykket, og av og på igjen gir samme tee tilbake', () => {
    const { container } = render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [
            { ...emptyTee('Gul', 'yellow'), id: 'tee-gul', slope_mens: '131', course_rating_mens: '71.2' },
            { ...emptyTee("Men's I", null), id: 'tee-m1', slope_mens: '128', course_rating_mens: '70.4' },
          ],
        }}
      />,
    );
    // The hidden id that rides with a tee's row.
    const idOf = (name: string) =>
      rowHeader(name).querySelector<HTMLInputElement>('input[name$="_id"]')!.value;

    expect(chip('Gul').getAttribute('aria-pressed')).toBe('true');
    expect(chip("Men's I").getAttribute('aria-pressed')).toBe('true');
    expect(rowHeader("Men's I").querySelector('[data-tee-dot]')).toBeNull();

    fireEvent.click(chip('Gul'));
    expect(container.querySelector('input[value="tee-gul"]')).toBeNull();
    fireEvent.click(chip('Gul'));
    expect(idOf('Gul')).toBe('tee-gul');
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Gul, herre, slope' }).value).toBe('131');
    expect(idOf("Men's I")).toBe('tee-m1');
  });

  it('junior-kolonnen og lengden står åpne når banen har tall der, og sju tee-er er taket', () => {
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [
            {
              ...emptyTee('Gul', 'yellow'),
              id: 'tee-gul',
              length_meters: '4000',
              slope_mens: '131',
              course_rating_mens: '71.2',
              slope_juniors: '110',
              course_rating_juniors: '64.0',
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Junior · slope / CR' })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Gul, lengde i meter' }).value).toBe('4000');
    expect(screen.getByText(/Uvanlig kort/)).toBeTruthy();

    fireEvent.click(chip('Fjern junior-kolonnen'));
    expect(screen.queryByRole('columnheader', { name: 'Junior · slope / CR' })).toBeNull();
    fireEvent.click(chip('+ Junior-kolonne'));
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Gul, junior, slope' }).value).toBe('');

    for (const name of ['Hvit', 'Blå', 'Rød', 'Oransje']) fireEvent.click(chip(name));
    fireEvent.click(chip('+ Annen'));
    for (const name of ['57', '58']) {
      fireEvent.change(screen.getByRole('textbox', { name: 'Navn på tee-en' }), {
        target: { value: name },
      });
      fireEvent.click(chip('Legg til'));
      if (name === '57') fireEvent.click(chip('+ Annen'));
    }
    expect(teeRows()).toHaveLength(7);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '+ Annen' }).disabled).toBe(true);
    expect(screen.getByText('Banen kan ha opptil 7 tee-er')).toBeTruthy();
  });
});

describe('CourseForm — 9-hullsbane som spilles to ganger (#2484)', () => {
  const NINE_R1 = [7, 3, 17, 1, 11, 5, 15, 9, 13];
  const NINE_R2 = [8, 4, 18, 2, 12, 6, 16, 10, 14];

  function formData(container: HTMLElement) {
    return new FormData(container.querySelector('form')!);
  }

  function chooseNine() {
    fireEvent.click(screen.getByRole('radio', { name: '9 hull, spilles to ganger' }));
  }

  function fillNine(container: HTMLElement, r1 = NINE_R1, r2 = NINE_R2) {
    r1.forEach((si, i) => setField(container, `hole_${i + 1}_si`, String(si)));
    r2.forEach((si, i) => setField(container, `hole_${i + 1}_si2`, String(si)));
  }

  const saveButton = () => screen.getByRole('button', { name: 'Lagre' });

  it('spør «Hvor mange hull?» med 18 hull valgt på ny bane', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    const group = screen.getByRole('radiogroup', { name: 'Hvor mange hull?' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: '18 hull' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '9 hull, spilles to ganger' })).not.toBeChecked();
    expect(formData(container).get('hole_count')).toBe('18');
    expect(container.querySelector('input[name="hole_1_si2"]')).toBeNull();
    expect(container.querySelector('input[name="hole_18_si"]')).not.toBeNull();
  });

  it('viser hull 1–9 i én tabell med to indeksrader ved 9 hull', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    chooseNine();

    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(screen.getByRole('table', { name: 'Hull 1–9' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Indeks 1. runde' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Indeks 2. runde' })).toBeTruthy();
    expect(screen.getByText('Par 36 · 72 for 18 hull')).toBeTruthy();
    expect(screen.getByLabelText(/^Indeks for hull 3, 2\. runde/)).toBeTruthy();

    const fd = formData(container);
    expect(fd.get('hole_count')).toBe('9');
    for (let n = 1; n <= 9; n++) {
      expect(fd.has(`hole_${n}_si`)).toBe(true);
      expect(fd.has(`hole_${n}_si2`)).toBe(true);
      expect(fd.get(`hole_${n}_par_mens`)).toBe('4');
      expect(fd.has(`hole_${n}_par_ladies`)).toBe(true);
    }
    expect(fd.has('hole_10_si')).toBe(false);
    expect(fd.has('hole_10_par_mens')).toBe(false);
    expect(fd.has('hole_10_par_ladies')).toBe(false);
  });

  it('holder «Lagre» grå til hvert tall 1–18 står én gang i de to radene', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    chooseNine();
    fireEvent.click(chip('Gul'));
    fillMensRating(container);

    fillNine(container, NINE_R1, NINE_R2.map((v, i) => (i === 0 ? 7 : v)));
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Indeks 7 er brukt mer enn én gang')).toBeTruthy();
    // The duplicate is marked in both rows.
    expect(screen.getByLabelText(/^Indeks for hull 1(?!,)/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Indeks for hull 1, 2\. runde/)).toHaveAttribute('aria-invalid', 'true');

    setField(container, 'hole_1_si2', '8');
    expect(saveButton()).toBeEnabled();
  });

  it('teller par for 18 hull: et par-trykk på hull 3 gir «Par 37 · 74»', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    chooseNine();

    fireEvent.click(parCell(3, 4));
    expect(screen.getByText('Par 37 · 74 for 18 hull')).toBeTruthy();
  });

  it('viser «Fordel» bare når rad 1 har 1–9 og rad 2 er tom, og fyller oddetall og partall', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    chooseNine();
    fireEvent.click(chip('Gul'));
    fillMensRating(container);
    const split = () => screen.queryByRole('button', { name: 'Fordel: oddetall 1. runde, partall 2. runde' });

    expect(split()).toBeNull();
    const single = [7, 3, 9, 1, 5, 2, 8, 4, 6];
    single.forEach((si, i) => setField(container, `hole_${i + 1}_si`, String(si)));
    expect(split()).not.toBeNull();
    expect(saveButton()).toBeDisabled();

    fireEvent.click(split()!);

    const fd = formData(container);
    single.forEach((k, i) => {
      expect(fd.get(`hole_${i + 1}_si`)).toBe(String(2 * k - 1));
      expect(fd.get(`hole_${i + 1}_si2`)).toBe(String(2 * k));
    });
    expect(screen.getByText('Fordelt. Rett tallene hvis scorekortet sier noe annet.')).toBeTruthy();
    expect(split()).toBeNull();
    expect(saveButton()).toBeEnabled();

    // The fields stay editable, and the line goes once one changes.
    setField(container, 'hole_1_si2', '13');
    expect(screen.queryByText('Fordelt. Rett tallene hvis scorekortet sier noe annet.')).toBeNull();
  });

  it('beholder par og indekser ved bytte fra 18 til 9 hull på en ubrukt bane', () => {
    const holes = makeHoles([4, 4, 5, 3, 4, 4, 3, 5, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    const { container } = render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{ name: 'Bane', holes, teeBoxes: [] }}
      />,
    );
    chooseNine();

    const fd = formData(container);
    expect(fd.get('hole_3_par_mens')).toBe('5');
    expect(fd.get('hole_3_si')).toBe('3');
    expect(fd.get('hole_3_si2')).toBe('12');
    expect(screen.getByText('Par 36 · 72 for 18 hull')).toBeTruthy();

    // And back: holes 10–18 are their own again, with the par of 1–9.
    fireEvent.click(screen.getByRole('radio', { name: '18 hull' }));
    const back = formData(container);
    expect(back.get('hole_count')).toBe('18');
    expect(back.get('hole_12_par_mens')).toBe('5');
    expect(back.get('hole_12_si')).toBe('12');
  });

  it('åpner en lagret 9-hullsbane i 9-hullsmodus med rad 2 fra hull 10–18', () => {
    const pars = [4, 4, 5, 3, 4, 4, 3, 5, 4];
    const holes: HoleData[] = [...NINE_R1, ...NINE_R2].map((si, i) => ({
      hole_number: i + 1,
      par_mens: String(pars[i % 9]),
      par_ladies: String(pars[i % 9]),
      par_juniors: String(pars[i % 9]),
      stroke_index: String(si),
    }));
    const { container } = render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{ name: 'Ni hull', nineHoles: true, holes, teeBoxes: [] }}
      />,
    );

    expect(screen.getByRole('radio', { name: '9 hull, spilles to ganger' })).toBeChecked();
    const fd = formData(container);
    expect(fd.get('hole_count')).toBe('9');
    expect(fd.get('hole_3_si')).toBe('17');
    expect(fd.get('hole_3_si2')).toBe('18');
    // The hint stands with the slope table, which shows once a tee is picked (#2486).
    fireEvent.click(chip('Gul'));
    expect(screen.getByText('Slope, CR og lengde gjelder 18 hull, altså to runder. Står det bare 9-hullstall på scorekortet, ganger du CR og lengden med to. Slope er den samme.')).toBeTruthy();
  });

  it('låser antall hull når banen er brukt i en runde', () => {
    const { container } = render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        usedInGamesCount={2}
        initialData={{ name: 'Ni hull', nineHoles: true, holes: makeHoles(Array(18).fill(4)), teeBoxes: [] }}
      />,
    );

    expect(screen.getByRole('radio', { name: '18 hull' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '9 hull, spilles to ganger' })).toBeDisabled();
    expect(screen.getByText('Antall hull er låst fordi banen er brukt i en runde.')).toBeTruthy();
    // The hidden field still sends the choice, so a save keeps the course a 9-hole one.
    expect(formData(container).get('hole_count')).toBe('9');
  });

  it('lar antall hull stå åpent på en ubrukt bane', () => {
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        usedInGamesCount={0}
        initialData={{ name: 'Bane', holes: makeHoles(Array(18).fill(4)), teeBoxes: [] }}
      />,
    );
    expect(screen.getByRole('radio', { name: '9 hull, spilles to ganger' })).toBeEnabled();
    expect(screen.queryByText('Antall hull er låst fordi banen er brukt i en runde.')).toBeNull();
  });
});
