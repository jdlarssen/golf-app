import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  CourseForm,
  hasHoleChanges,
  sumHolePars,
  type HoleData,
} from './CourseForm';
import { REAL_SI } from '@/lib/courses/__fixtures__/courseForm';

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

describe('CourseForm — auto-beregnet par-total', () => {
  it('viser ikke par-total per kjønn så lenge slope/CR mangler', () => {
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [
            {
              name: 'Gul',
              length_meters: '',
              slope_mens: '',
              course_rating_mens: '',
              slope_ladies: '',
              course_rating_ladies: '',
              slope_juniors: '',
              course_rating_juniors: '',
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('viser par-total = 72 når slope/CR er fylt ut for herrer (ny bane)', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    fillMensRating(container);
    expect(screen.getByText('72')).toBeTruthy();
  });

  it('oppdaterer par-total fra 72 til 73 når et hull endres fra par 4 til par 5', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    fillMensRating(container);

    expect(screen.getByText('72')).toBeTruthy();

    fireEvent.click(parCell(1, 4));

    expect(screen.getByText('73')).toBeTruthy();
  });
});

describe('CourseForm — progressive disclosure for kjønn-rating', () => {
  it('viser kun herre-rating som default; ingen dame/junior-input synlig', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    expect(screen.getByText('Herrer')).toBeTruthy();
    expect(screen.queryByText('Damer')).toBeNull();
    expect(screen.queryByText('Junior')).toBeNull();
    expect(screen.getByRole('button', { name: /legg til dame-rating/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /legg til junior-rating/i })).toBeTruthy();
  });

  it('eksponerer dame-rating-blokk når «+ Legg til dame-rating» klikkes', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(screen.getByRole('button', { name: /legg til dame-rating/i }));

    expect(screen.getByText('Damer')).toBeTruthy();
  });

  it('viser ikke «Fjern X-rating»-knapper i UI-en (erstattet av Tøm)', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    fireEvent.click(screen.getByRole('button', { name: /legg til dame-rating/i }));
    fireEvent.click(screen.getByRole('button', { name: /legg til junior-rating/i }));

    expect(screen.queryByRole('button', { name: /fjern dame-rating/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /fjern junior-rating/i })).toBeNull();
  });

  it('viser ikke Tøm-knappen i dame-blokken så lenge feltene er tomme etter ekspander', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(screen.getByRole('button', { name: /legg til dame-rating/i }));

    // Tøm-knappen rendres i header med same legend som Damer — den finnes kun
    // når minst ett av feltene har innhold. Akkurat etter ekspander er begge
    // tomme, så knappen skal ikke vises.
    expect(screen.queryAllByRole('button', { name: /tøm dette kjønnet/i }).length).toBe(0);
  });

  it('eksponerer dame-rating-blokken expand\'et fra start på edit-flyt med lagrede tall', () => {
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [
            {
              id: 'tee-1',
              name: 'Gul',
              length_meters: '',
              slope_mens: '113',
              course_rating_mens: '70.0',
              slope_ladies: '120',
              course_rating_ladies: '71.5',
              slope_juniors: '',
              course_rating_juniors: '',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Damer')).toBeTruthy();
    expect(screen.queryByText('Junior')).toBeNull();
    expect(screen.getByRole('button', { name: /legg til junior-rating/i })).toBeTruthy();
  });
});

describe('CourseForm — Tøm dette kjønnet', () => {
  it('viser IKKE Tøm-knappen på herrer-blokken på new-flyten når feltene er tomme', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    // En ny bane starter med tomme herrer-felt (#2279) — ingenting å tømme.
    expect(screen.queryByRole('button', { name: /tøm dette kjønnet/i })).toBeNull();
  });

  it('viser Tøm-knappen på herrer-blokken så snart admin fyller inn slope', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    expect(screen.queryByRole('button', { name: /tøm dette kjønnet/i })).toBeNull();

    const mensSlope = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_slope_mens"]',
    );
    fireEvent.change(mensSlope!, { target: { value: '120' } });

    expect(screen.getAllByRole('button', { name: /tøm dette kjønnet/i }).length).toBe(1);
  });

  it('viser Tøm-knappen på herrer-blokken på edit-flyten når feltene har lagrede verdier', () => {
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Edit Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [
            {
              id: 'tee-1',
              name: 'Gul',
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

    expect(screen.getAllByRole('button', { name: /tøm dette kjønnet/i }).length).toBe(1);
  });

  it('skjuler Tøm-knappen på herrer-blokken på edit-flyten når BÅDE slope og CR er tomme', () => {
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Edit Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [
            {
              id: 'tee-1',
              name: 'Gul',
              length_meters: '',
              slope_mens: '',
              course_rating_mens: '',
              slope_ladies: '',
              course_rating_ladies: '',
              slope_juniors: '',
              course_rating_juniors: '',
            },
          ],
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: /tøm dette kjønnet/i })).toBeNull();
  });

  it('nullstiller begge feltene og skjuler Tøm-knappen igjen ved klikk på herrer', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    const mensSlope = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_slope_mens"]',
    );
    const mensCr = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_cr_mens"]',
    );
    fireEvent.change(mensSlope!, { target: { value: '120' } });

    fireEvent.click(screen.getByRole('button', { name: /tøm dette kjønnet/i }));

    expect(mensSlope?.value).toBe('');
    expect(mensCr?.value).toBe('');
    // Begge felter er nå tomme → Tøm-knappen skal forsvinne.
    expect(screen.queryByRole('button', { name: /tøm dette kjønnet/i })).toBeNull();
  });

  it('viser Tøm-knappen på damer-blokken så snart admin fyller ett felt', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(screen.getByRole('button', { name: /legg til dame-rating/i }));
    expect(screen.queryAllByRole('button', { name: /tøm dette kjønnet/i }).length).toBe(0);

    const ladiesSlope = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_slope_ladies"]',
    );
    fireEvent.change(ladiesSlope!, { target: { value: '120' } });

    expect(screen.getAllByRole('button', { name: /tøm dette kjønnet/i }).length).toBe(1);
  });

  it('nullstiller damer-feltene MEN beholder blokken ekspandert etter Tøm', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(screen.getByRole('button', { name: /legg til dame-rating/i }));
    const ladiesSlope = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_slope_ladies"]',
    );
    const ladiesCr = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_cr_ladies"]',
    );
    fireEvent.change(ladiesSlope!, { target: { value: '120' } });
    fireEvent.change(ladiesCr!, { target: { value: '71.5' } });

    fireEvent.click(screen.getByRole('button', { name: /tøm dette kjønnet/i }));

    expect(ladiesSlope?.value).toBe('');
    expect(ladiesCr?.value).toBe('');
    // Blokken skal fortsatt være ekspandert — admin kan fylle på nytt
    // uten å klikke «+ Legg til dame-rating» igjen.
    expect(screen.getByText('Damer')).toBeTruthy();
    // Collapsed-state-knappen skal IKKE finnes (blokken er fortsatt åpen).
    expect(screen.queryByRole('button', { name: /legg til dame-rating/i })).toBeNull();
  });

  it('viser Tøm-knappen for hver gender-blokk som har innhold på edit-flyten (3 knapper for full tee)', () => {
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Edit Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [
            {
              id: 'tee-1',
              name: 'Gul',
              length_meters: '',
              slope_mens: '113',
              course_rating_mens: '70.0',
              slope_ladies: '120',
              course_rating_ladies: '71.5',
              slope_juniors: '105',
              course_rating_juniors: '68.5',
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByRole('button', { name: /tøm dette kjønnet/i }).length).toBe(3);
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

  it('dame-raden i kortet styrer dame-par-totalen i dame-blokken under tee-en', () => {
    const holes = makeHoles(Array(18).fill(4));
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
              length_meters: '',
              slope_mens: '113',
              course_rating_mens: '70.0',
              slope_ladies: '134',
              course_rating_ladies: '73.6',
              slope_juniors: '',
              course_rating_juniors: '',
            },
          ],
        }}
      />,
    );

    // Dame-blokken: «Par-total: 72», så 73 når hull 1 i kortets dame-rad blir 5.
    const ladies = within(screen.getByRole('group', { name: 'Damer' }));
    expect(ladies.getByText(/par-total:/i)).toBeTruthy();
    expect(ladies.getByText('72')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /legg til avvikende par for damer/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Par for hull 1 (damer): 4. Trykk for å endre' }),
    );
    expect(ladies.getByText('73')).toBeTruthy();
  });
});

describe('CourseForm — dupliser-tee', () => {
  it('legger til ny tee under med kopierte numre og blankt navn ved klikk på Dupliser', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    expect(screen.queryByText('Tee-boks 2')).toBeNull();

    fillMensRating(container);
    // Fyll inn navn på første tee så vi kan verifisere at duplikatet er blankt.
    const tee0Name = container.querySelector<HTMLInputElement>('input[name="tee_0_name"]');
    fireEvent.change(tee0Name!, { target: { value: 'Gul' } });
    expect(tee0Name?.value).toBe('Gul');

    fireEvent.click(screen.getByRole('button', { name: /^dupliser tee-boks 1$/i }));

    expect(screen.getByText('Tee-boks 2')).toBeTruthy();
    const tee1Name = container.querySelector<HTMLInputElement>('input[name="tee_1_name"]');
    expect(tee1Name?.value).toBe('');
    const tee1Slope = container.querySelector<HTMLInputElement>(
      'input[name="tee_1_slope_mens"]',
    );
    expect(tee1Slope?.value).toBe('113');
    const tee1Cr = container.querySelector<HTMLInputElement>(
      'input[name="tee_1_cr_mens"]',
    );
    expect(tee1Cr?.value).toBe('70.0');
  });

  it('skjuler Dupliser-knappen når MAX_TEE_BOXES (7) er nådd', () => {
    const fullTees = Array.from({ length: 7 }, (_, i) => ({
      id: `tee-${i}`,
      name: `Tee ${i}`,
      length_meters: '',
      slope_mens: '113',
      course_rating_mens: '70.0',
      slope_ladies: '',
      course_rating_ladies: '',
      slope_juniors: '',
      course_rating_juniors: '',
    }));
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: fullTees,
        }}
      />,
    );

    expect(screen.queryAllByRole('button', { name: /^dupliser tee-boks/i })).toHaveLength(0);
  });

  it('dupliserer også dame-rating-data uavhengig av om blokken er kollapset', () => {
    const { container } = render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [
            {
              id: 'tee-1',
              name: 'Gul',
              length_meters: '',
              slope_mens: '113',
              course_rating_mens: '70.0',
              slope_ladies: '120',
              course_rating_ladies: '71.5',
              slope_juniors: '',
              course_rating_juniors: '',
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /^dupliser tee-boks/i })[0]);

    const tee1LadiesSlope = container.querySelector<HTMLInputElement>(
      'input[name="tee_1_slope_ladies"]',
    );
    expect(tee1LadiesSlope?.value).toBe('120');
  });
});

describe('CourseForm — typisk slope/CR-range hint', () => {
  it('viser herre-spesifikk hint under slope og CR i default-state', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    expect(screen.getByText('Typisk 110–135')).toBeTruthy();
    expect(screen.getByText('Typisk 67–72')).toBeTruthy();
  });

  it('viser dame-spesifikk hint når dame-blokken ekspanderes', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(screen.getByRole('button', { name: /legg til dame-rating/i }));

    expect(screen.getByText('Typisk 115–140')).toBeTruthy();
    expect(screen.getByText('Typisk 68–73')).toBeTruthy();
  });

  it('viser junior-spesifikk hint når junior-blokken ekspanderes', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(screen.getByRole('button', { name: /legg til junior-rating/i }));

    expect(screen.getByText('Typisk 95–125')).toBeTruthy();
    expect(screen.getByText('Typisk 60–68')).toBeTruthy();
  });

  it('skjuler dame-hint så lenge dame-blokken er kollapset (default-state for new-flyten)', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    // Dame-blokken er kollapset som default på new-flyten — hint skal ikke
    // vises i UI-en før admin klikker «+ Legg til dame-rating».
    expect(screen.queryByText('Typisk 115–140')).toBeNull();
    expect(screen.queryByText('Typisk 68–73')).toBeNull();
  });
});

describe('CourseForm — kopier til alle kjønn', () => {
  function teeWith(overrides: Partial<{
    id: string;
    name: string;
    slope_mens: string;
    course_rating_mens: string;
    slope_ladies: string;
    course_rating_ladies: string;
    slope_juniors: string;
    course_rating_juniors: string;
  }>) {
    return {
      id: 'tee-1',
      name: 'Gul',
      length_meters: '',
      slope_mens: '',
      course_rating_mens: '',
      slope_ladies: '',
      course_rating_ladies: '',
      slope_juniors: '',
      course_rating_juniors: '',
      ...overrides,
    };
  }

  it('skjuler kopier-knappen så lenge herrer-rating ikke er fullt utfylt', () => {
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [teeWith({ slope_mens: '113', course_rating_mens: '' })],
        }}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /kopier til alle kjønn/i }),
    ).toBeNull();
  });

  it('viser kopier-knappen når herrer er fullt utfylt og dame/junior er tomme', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    fillMensRating(container);

    expect(
      screen.getByRole('button', { name: /kopier til alle kjønn/i }),
    ).toBeTruthy();
  });

  it('skjuler kopier-knappen når både dame og junior har full slope + CR', () => {
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [
            teeWith({
              slope_mens: '113',
              course_rating_mens: '70.0',
              slope_ladies: '120',
              course_rating_ladies: '71.5',
              slope_juniors: '108',
              course_rating_juniors: '67.0',
            }),
          ],
        }}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /kopier til alle kjønn/i }),
    ).toBeNull();
  });

  it('ekspanderer kollapsede dame/junior-blokker og fyller med herrer-verdier ved klikk', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    fillMensRating(container);

    // Herrer 113/70.0, dame+junior kollapset.
    expect(screen.queryByText('Damer')).toBeNull();
    expect(screen.queryByText('Junior')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /kopier til alle kjønn/i }));

    expect(screen.getByText('Damer')).toBeTruthy();
    expect(screen.getByText('Junior')).toBeTruthy();

    const ladiesSlope = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_slope_ladies"]',
    );
    const ladiesCr = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_cr_ladies"]',
    );
    const juniorsSlope = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_slope_juniors"]',
    );
    const juniorsCr = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_cr_juniors"]',
    );

    expect(ladiesSlope?.value).toBe('113');
    expect(ladiesCr?.value).toBe('70.0');
    expect(juniorsSlope?.value).toBe('113');
    expect(juniorsCr?.value).toBe('70.0');
  });

  it('overskriver eksisterende dame-verdier med herrer-verdiene', () => {
    const { container } = render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [
            teeWith({
              slope_mens: '113',
              course_rating_mens: '70.0',
              slope_ladies: '125',
              course_rating_ladies: '72.5',
              // Junior tom så knappen vises.
            }),
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /kopier til alle kjønn/i }));

    const ladiesSlope = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_slope_ladies"]',
    );
    const ladiesCr = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_cr_ladies"]',
    );
    expect(ladiesSlope?.value).toBe('113');
    expect(ladiesCr?.value).toBe('70.0');
  });

  it('skjuler kopier-knappen på den tee-en hvor klikket skjedde, men ikke på andre tee-er', () => {
    render(
      <CourseForm
        action={NO_OP}
        submitLabel="Lagre"
        initialData={{
          name: 'Test',
          holes: makeHoles(Array(18).fill(4)),
          teeBoxes: [
            teeWith({
              id: 'tee-1',
              slope_mens: '113',
              course_rating_mens: '70.0',
            }),
            teeWith({
              id: 'tee-2',
              slope_mens: '120',
              course_rating_mens: '71.5',
            }),
          ],
        }}
      />,
    );

    const copyButtons = screen.getAllByRole('button', {
      name: /kopier til alle kjønn/i,
    });
    expect(copyButtons).toHaveLength(2);

    fireEvent.click(copyButtons[0]);

    const remaining = screen.getAllByRole('button', {
      name: /kopier til alle kjønn/i,
    });
    expect(remaining).toHaveLength(1);
  });
});

describe('CourseForm — confirm-gate ved par/SI-endring + aktive spill', () => {
  const baselineHoles = makeHoles(Array(18).fill(4));
  const teeBoxes = [
    {
      id: 'tee-1',
      name: 'Gul',
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
    // Uten 18 indekser og slope/CR er «Lagre» grå, og klikket beviser ingenting.
    fillStrokeIndices(container);
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
    expect(value('tee_0_slope_mens')).toBe('');
    expect(value('tee_0_cr_mens')).toBe('');
    expect(container.querySelector('input[name="tee_0_slope_mens"]')!.getAttribute('placeholder')).toBeNull();
    expect(container.querySelector('input[name="tee_0_cr_mens"]')!.getAttribute('placeholder')).toBeNull();
    expect(screen.queryByRole('button', { name: /sett si/i })).toBeNull();
    expect(save().disabled).toBe(true);
    expect(save().getAttribute('aria-describedby')).toBe('course-save-status');
    expect(lines()).toEqual(['Mangler 18 indekser', 'Tee-boks 1 mangler slope og CR']);
    fireEvent.click(save());
    expect(action).not.toHaveBeenCalled();

    // 17 indekser: én mangler.
    fillStrokeIndices(container, REAL_SI.slice(0, 17));
    expect(lines()).toEqual(['Mangler én indeks', 'Tee-boks 1 mangler slope og CR']);
    // 19 er utenfor området: hullet nevnes.
    setField(container, 'hole_18_si', '19');
    expect(lines()).toEqual([
      'Indeksen på hull 18 må være et helt tall fra 1 til 18',
      'Tee-boks 1 mangler slope og CR',
    ]);
    // 7 på to hull: duplikatet nevnes.
    setField(container, 'hole_18_si', '7');
    expect(lines()).toEqual(['Indeks 7 er brukt mer enn én gang', 'Tee-boks 1 mangler slope og CR']);
    // 14 på hull 14 i tillegg til hull 17: to duplikater gir flertall.
    setField(container, 'hole_14_si', '14');
    expect(lines()).toEqual([
      'Indeksene 7 og 14 er brukt mer enn én gang',
      'Tee-boks 1 mangler slope og CR',
    ]);
    setField(container, 'hole_14_si', '2');
    // Bare slope: begge trengs.
    setField(container, 'tee_0_slope_mens', '120');
    expect(lines()).toEqual(['Indeks 7 er brukt mer enn én gang', 'Tee-boks 1 trenger både slope og CR']);
    expect(save().disabled).toBe(true);

    setField(container, 'hole_18_si', '10');
    setField(container, 'tee_0_cr_mens', '70.1');
    expect(save().disabled).toBe(false);
    expect(save().getAttribute('aria-describedby')).toBeNull();
    expect(container.querySelector('#course-save-status')).toBeNull();
  });

  it('redigering: knappen er aktiv fra start, og en ny tee-boks må fylles ut', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /legg til tee-boks/i }));
    expect(container.querySelector<HTMLInputElement>('input[name="tee_1_slope_mens"]')!.value).toBe('');
    expect(save().disabled).toBe(true);
    expect(
      Array.from(container.querySelectorAll('#course-save-status p'), (p) => p.textContent),
    ).toEqual(['Tee-boks 2 mangler slope og CR']);

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
