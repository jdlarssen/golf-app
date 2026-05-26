import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CourseForm, sumHolePars, type HoleData } from './CourseForm';

function makeHoles(pars: number[]): HoleData[] {
  return pars.map((par, i) => ({
    hole_number: i + 1,
    par: String(par),
    stroke_index: String(i + 1),
  }));
}

const NO_OP = async () => {};

describe('sumHolePars', () => {
  it('summerer 18 fire-er til 72', () => {
    expect(sumHolePars(makeHoles(Array(18).fill(4)))).toBe(72);
  });

  it('ignorerer hull med ugyldig par-streng', () => {
    const holes = makeHoles([4, 4, 4]);
    holes[1].par = '';
    expect(sumHolePars(holes)).toBe(8);
  });

  it('summerer blandet par-sekvens med par 3/4/5 til riktig sum', () => {
    // 4 par-3 + 11 par-4 + 3 par-5 = 12 + 44 + 15 = 71
    const sequence = [3, 4, 5, 4, 3, 4, 4, 4, 4, 4, 5, 4, 3, 3, 4, 4, 5, 4];
    expect(sumHolePars(makeHoles(sequence))).toBe(71);
  });
});

describe('CourseForm — par tap-knapper', () => {
  it('rendrer [3] [4] [5] som radio-group per hull, ikke number-input for par', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    const hole1Group = screen.getByRole('radiogroup', { name: 'Par for hull 1' });
    expect(hole1Group).toBeTruthy();

    const buttons = within(hole1Group).getAllByRole('radio');
    expect(buttons.map((b) => b.textContent)).toEqual(['3', '4', '5']);
  });

  it('markerer default par 4 som aria-checked på mount', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    const hole1Group = screen.getByRole('radiogroup', { name: 'Par for hull 1' });
    const four = within(hole1Group).getByRole('radio', { name: '4' });
    expect(four.getAttribute('aria-checked')).toBe('true');
  });

  it('endrer par til 5 ved klikk og oppdaterer hidden-input', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    const hole1Group = screen.getByRole('radiogroup', { name: 'Par for hull 1' });
    const five = within(hole1Group).getByRole('radio', { name: '5' });
    fireEvent.click(five);

    expect(five.getAttribute('aria-checked')).toBe('true');
    const hidden = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="hole_1_par"]',
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

  it('viser par-total = 72 når slope/CR er fylt ut for herrer (default-state)', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);
    // Default-tee har slope 113 + CR 70.0 forhåndsfylt for herrer.
    expect(screen.getByText('72')).toBeTruthy();
  });

  it('oppdaterer par-total fra 72 til 73 når et hull endres fra par 4 til par 5', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    expect(screen.getByText('72')).toBeTruthy();

    const hole1Group = screen.getByRole('radiogroup', { name: 'Par for hull 1' });
    fireEvent.click(within(hole1Group).getByRole('radio', { name: '5' }));

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
    expect(screen.getByRole('button', { name: /fjern dame-rating/i })).toBeTruthy();
  });

  it('kollapser dame-rating-blokken og fjerner verdiene når «Fjern dame-rating» klikkes', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(screen.getByRole('button', { name: /legg til dame-rating/i }));
    const ladySlope = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_slope_ladies"]',
    );
    expect(ladySlope).toBeTruthy();
    fireEvent.change(ladySlope!, { target: { value: '120' } });
    expect(ladySlope?.value).toBe('120');

    fireEvent.click(screen.getByRole('button', { name: /fjern dame-rating/i }));

    expect(screen.queryByText('Damer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /legg til dame-rating/i }));
    const ladySlopeAgain = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_slope_ladies"]',
    );
    expect(ladySlopeAgain?.value).toBe('');
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

describe('CourseForm — dupliser-tee', () => {
  it('legger til ny tee under med kopierte numre og blankt navn ved klikk på Dupliser', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    expect(screen.queryByText('Tee-boks 2')).toBeNull();

    // Fyll inn navn på første tee så vi kan verifisere at duplikatet er blankt.
    const tee0Name = container.querySelector<HTMLInputElement>('input[name="tee_0_name"]');
    fireEvent.change(tee0Name!, { target: { value: 'Gul' } });
    expect(tee0Name?.value).toBe('Gul');

    fireEvent.click(screen.getByRole('button', { name: 'Dupliser' }));

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

    expect(screen.queryByRole('button', { name: 'Dupliser' })).toBeNull();
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

    fireEvent.click(screen.getAllByRole('button', { name: 'Dupliser' })[0]);

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

  it('skjuler dame-hint når dame-blokken kollapses (hint kun synlig på ekspanderte blokker)', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(screen.getByRole('button', { name: /legg til dame-rating/i }));
    expect(screen.getByText('Typisk 115–140')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /fjern dame-rating/i }));
    expect(screen.queryByText('Typisk 115–140')).toBeNull();
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
    // Default-tee i CourseForm har herrer prefylt 113/70.0 og dame/junior tomme.
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

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

    // Default-state: herrer 113/70.0, dame+junior kollapset.
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
