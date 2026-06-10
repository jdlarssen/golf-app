import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  CourseForm,
  hasHoleChanges,
  sumHolePars,
  type HoleData,
} from './CourseForm';

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
  it('viser IKKE Tøm-knappen på herrer-blokken på new-flyten når defaults er intakte', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    // Default herrer-state er slope 113 + CR 70.0 — Tøm skal være skjult for
    // å hindre at admin utilsiktet tømmer defaults før de har lagt til noe.
    expect(screen.queryByRole('button', { name: /tøm dette kjønnet/i })).toBeNull();
  });

  it('viser Tøm-knappen på herrer-blokken så snart admin endrer slope vekk fra default', () => {
    const { container } = render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    expect(screen.queryByRole('button', { name: /tøm dette kjønnet/i })).toBeNull();

    const mensSlope = container.querySelector<HTMLInputElement>(
      'input[name="tee_0_slope_mens"]',
    );
    fireEvent.change(mensSlope!, { target: { value: '120' } });

    expect(screen.getAllByRole('button', { name: /tøm dette kjønnet/i }).length).toBe(1);
  });

  it('viser Tøm-knappen på herrer-blokken på edit-flyten selv om verdiene matcher defaults', () => {
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
    // Når kollapset: ingen ekstra radio-group for dame/junior-par på hull 1.
    expect(
      screen.queryByRole('radiogroup', {
        name: /par for hull 1 \(avvikende par for damer\)/i,
      }),
    ).toBeNull();
  });

  it('eksponerer 18 nye par-rader når «avvikende par for damer» klikkes', () => {
    render(<CourseForm action={NO_OP} submitLabel="Lagre" />);

    fireEvent.click(
      screen.getByRole('button', { name: /legg til avvikende par for damer/i }),
    );

    // Avvikende-seksjon viser 18 radiogrupper med matching aria-label.
    const dameGroups = screen.getAllByRole('radiogroup', {
      name: /\(avvikende par for damer\)/i,
    });
    expect(dameGroups).toHaveLength(18);
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

    const hole1Group = screen.getByRole('radiogroup', { name: 'Par for hull 1' });
    fireEvent.click(within(hole1Group).getByRole('radio', { name: '5' }));

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
    const hole1Group = screen.getByRole('radiogroup', { name: 'Par for hull 1' });
    fireEvent.click(within(hole1Group).getByRole('radio', { name: '5' }));

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
    const dameHull1 = screen.getByRole('radiogroup', {
      name: /par for hull 1 \(avvikende par for damer\)/i,
    });
    fireEvent.click(within(dameHull1).getByRole('radio', { name: '5' }));

    let ladies1 = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="hole_1_par_ladies"]',
    );
    expect(ladies1?.value).toBe('5');

    // Trykk «Fjern dame-overstyring»
    fireEvent.click(
      screen.getByRole('button', { name: /fjern dame-overstyring/i }),
    );

    // Seksjonen er kollapset.
    expect(
      screen.queryByRole('radiogroup', {
        name: /par for hull 1 \(avvikende par for damer\)/i,
      }),
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

    // 18 dame-par-radiogrupper rendret.
    const dameGroups = screen.getAllByRole('radiogroup', {
      name: /\(avvikende par for damer\)/i,
    });
    expect(dameGroups).toHaveLength(18);

    // Junior-seksjonen forblir kollapset (ingen junior-avvik i initialData).
    expect(
      screen.getByRole('button', { name: /legg til avvikende par for junior/i }),
    ).toBeTruthy();
  });

  it('rendrer per-kjønn-par-total i avvikende-seksjon basert på dame-pars', () => {
    const holes = makeHoles(Array(18).fill(4));
    holes[0].par_ladies = '5'; // hull 1: dame-par 5
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

    // Avvikende-seksjon: «Par-total damer: 73»
    expect(screen.getByText(/par-total damer/i)).toBeTruthy();
    expect(screen.getByText('73')).toBeTruthy();
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

    const hole1Group = screen.getByRole('radiogroup', { name: 'Par for hull 1' });
    fireEvent.click(within(hole1Group).getByRole('radio', { name: '5' }));

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

    const hole1Group = screen.getByRole('radiogroup', { name: 'Par for hull 1' });
    fireEvent.click(within(hole1Group).getByRole('radio', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('viser IKKE confirm-dialog på /new-flyten (ingen initialData)', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<CourseForm action={async () => {}} submitLabel="Lagre" />);

    const hole1Group = screen.getByRole('radiogroup', { name: 'Par for hull 1' });
    fireEvent.click(within(hole1Group).getByRole('radio', { name: '5' }));
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

    const hole1Group = screen.getByRole('radiogroup', { name: 'Par for hull 1' });
    fireEvent.click(within(hole1Group).getByRole('radio', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/ett spill/);
  });
});
