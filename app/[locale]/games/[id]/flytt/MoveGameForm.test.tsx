import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoveGameForm } from './MoveGameForm';

// Type B (#2480): «Flytt runden» as the artboard draws it
// (`Nyttspill-forslag-flytt-lys/-natt`): NY DAG with four chips, TID with four
// chips, the card with «Si fra til gjengen» on from the start, the names and
// the message, and the button at the bottom. Only Date is faked: the round is
// Saturday 3 October 2026 at 09:00, seen from the Monday before.

const TEE_OFF = '2026-10-03T07:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T10:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

function renderForm(namesLine: string | null = 'Marte, Jonas og Anders får et varsel') {
  const { container } = render(
    <MoveGameForm action={vi.fn()} gameName="Lørdagsrunden" teeOffIso={TEE_OFF} namesLine={namesLine} />,
  );
  const hidden = (name: string) =>
    (container.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement | null)?.value ?? null;
  return { container, hidden };
}

const radios = (name: string) =>
  [...document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`)].map((r) => ({
    label: r.closest('label')?.textContent,
    checked: r.checked,
  }));

describe('MoveGameForm', () => {
  it('draws the chips, the switch on, the names and the button, off until something changes', () => {
    const { hidden } = renderForm();

    expect(screen.getByText('Ny dag')).toBeTruthy();
    expect(screen.getByText('Tid')).toBeTruthy();
    expect(screen.getByText('Beskjed til gjengen')).toBeTruthy();
    expect(radios('day_choice')).toEqual([
      { label: 'Lør. 3. okt', checked: true },
      { label: 'Søn. 4. okt', checked: false },
      { label: 'Lør. 10. okt', checked: false },
      { label: 'Annen dag', checked: false },
    ]);
    expect(radios('time_choice')).toEqual([
      { label: '08:00', checked: false },
      { label: '09:00', checked: true },
      { label: '10:00', checked: false },
      { label: 'Annen tid', checked: false },
    ]);
    expect(screen.getByRole('switch', { name: 'Si fra til gjengen' })).toHaveProperty('checked', true);
    expect(screen.getByText('Marte, Jonas og Anders får et varsel')).toBeTruthy();
    const button = screen.getByTestId('move-submit');
    expect([button.textContent, (button as HTMLButtonElement).disabled]).toEqual(['Flytt og si fra', true]);
    expect([hidden('day'), hidden('time'), hidden('notify')]).toEqual(['2026-10-03', '09:00', '1']);
  });

  it('a new day opens the button and shows the message as the group gets it', () => {
    const { hidden } = renderForm();

    fireEvent.click(screen.getByLabelText('Søn. 4. okt'));

    expect((screen.getByTestId('move-submit') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('move-preview').textContent).toMatch(
      /^Lørdagsrunden er flyttet til søndag 4\. okt\. kl\. \d\d:00\. Samme bane og tee\.$/,
    );
    expect([hidden('day'), hidden('time')]).toEqual(['2026-10-04', '09:00']);
  });

  it('with the switch off the button says «Flytt runden», and nothing is sent', () => {
    const { hidden } = renderForm();
    fireEvent.click(screen.getByLabelText('10:00'));

    fireEvent.click(screen.getByRole('switch', { name: 'Si fra til gjengen' }));

    expect(screen.getByTestId('move-submit').textContent).toBe('Flytt runden');
    expect(screen.queryByTestId('move-preview')).toBeNull();
    expect(hidden('notify')).toBeNull();
  });

  it('without anyone to tell there is no switch, and «Annen dag» opens a date field', () => {
    const { hidden } = renderForm(null);

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('Beskjed til gjengen')).toBeNull();
    expect(screen.getByTestId('move-submit').textContent).toBe('Flytt runden');
    expect(hidden('notify')).toBeNull();

    fireEvent.click(screen.getByLabelText('Annen dag'));
    fireEvent.change(screen.getByTestId('move-other-day'), { target: { value: '2026-10-17' } });
    expect(hidden('day')).toBe('2026-10-17');
  });

  it('a time that has passed is shut off, and the button with it', () => {
    // Seen from 08:30 on the day: 08:00 has been.
    vi.setSystemTime(new Date('2026-10-03T06:30:00.000Z'));
    renderForm();

    expect((screen.getByLabelText('08:00') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Annen tid'));
    fireEvent.change(screen.getByTestId('move-other-time'), { target: { value: '07:00' } });

    expect(screen.getByRole('alert').textContent).toBe('Tee-off kan ikke være i fortiden. Velg et tidspunkt fra nå av.');
    expect((screen.getByTestId('move-submit') as HTMLButtonElement).disabled).toBe(true);
  });
});
