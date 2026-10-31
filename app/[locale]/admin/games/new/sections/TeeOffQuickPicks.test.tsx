import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TeeOffQuickPicks } from './TeeOffQuickPicks';

// Type B (#2448, #2463): the TEE-OFF rows on «Hvor og når?»
// (`Nyttspill-forslag-bane`, `Nyttspill-forslag-spill-na`).
// Only Date is faked: Wednesday 4 November 2026, 08:30 in Oslo (07:30Z).
const NOW = '2026-11-04T08:30';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T07:30:00.000Z'));
});
afterEach(() => vi.useRealTimers());

function Harness({
  initial,
  now = NOW,
  allowNow = false,
  initialNow = false,
}: {
  initial: string;
  now?: string;
  allowNow?: boolean;
  initialNow?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [nowChosen, setNowChosen] = useState(initialNow);
  return (
    <>
      <TeeOffQuickPicks
        value={value}
        onChange={setValue}
        teeOffNow={now}
        allowNow={allowNow}
        now={nowChosen}
        // As useGameFormState's setTeeOffNow: «Nå» keeps no time.
        onNowChange={(next) => {
          setNowChosen(next);
          if (next) setValue('');
        }}
      />
      <output data-testid="value">{value}</output>
      <output data-testid="now">{nowChosen ? 'now' : ''}</output>
    </>
  );
}

const pills = (group: string) =>
  within(screen.getByRole('radiogroup', { name: group }))
    .getAllByRole('radio')
    .map((r) => ({
      label: r.closest('label')?.textContent,
      checked: (r as HTMLInputElement).checked,
      disabled: (r as HTMLInputElement).disabled,
    }));
const value = () => screen.getByTestId('value').textContent;

describe('TeeOffQuickPicks (#2448)', () => {
  it('draws the day and time rows; the Saturday default is «Annen dag» with its date (#2463)', () => {
    render(<Harness initial="2026-11-07T09:00" />);
    expect(pills('Dag')).toEqual([
      { label: 'I dag', checked: false, disabled: false },
      { label: 'I morgen', checked: false, disabled: false },
      { label: 'Annen dag', checked: true, disabled: false },
    ]);
    expect(screen.getByLabelText('Velg dag')).toHaveValue('2026-11-07');
    expect(pills('Klokkeslett').map((p) => [p.label, p.checked])).toEqual([
      ['08:00', false],
      ['09:00', true],
      ['10:00', false],
      ['Annen tid', false],
    ]);
    expect(screen.queryByLabelText('Velg tid')).toBeNull();
  });

  it('a day and a time set the tee-off as «YYYY-MM-DDTHH:mm»', () => {
    render(<Harness initial="2026-11-07T09:00" />);
    fireEvent.click(screen.getByRole('radio', { name: 'I morgen' }));
    expect(value()).toBe('2026-11-05T09:00');
    fireEvent.click(screen.getByRole('radio', { name: '10:00' }));
    expect(value()).toBe('2026-11-05T10:00');
  });

  it('with «I dag» chosen, a time that has passed cannot be chosen', () => {
    render(<Harness initial="2026-11-07T09:00" />);
    fireEvent.click(screen.getByRole('radio', { name: 'I dag' }));
    expect(pills('Klokkeslett').map((p) => [p.label, p.disabled])).toEqual([
      ['08:00', true],
      ['09:00', false],
      ['10:00', false],
      ['Annen tid', false],
    ]);
  });

  it('«Annen dag» and «Annen tid» open the fields, and the fields set the tee-off', () => {
    render(<Harness initial="2026-11-07T09:00" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Annen dag' }));
    expect(screen.getByLabelText('Velg dag')).toHaveValue('2026-11-07');
    fireEvent.change(screen.getByLabelText('Velg dag'), { target: { value: '2026-11-18' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Annen tid' }));
    fireEvent.change(screen.getByLabelText('Velg tid'), { target: { value: '13:30' } });
    expect(value()).toBe('2026-11-18T13:30');
  });

  it('a tee-off outside the picks marks «Annen dag» and «Annen tid», with the values in the fields', () => {
    render(<Harness initial="2026-11-11T13:30" />);
    expect(pills('Dag').find((p) => p.checked)?.label).toBe('Annen dag');
    expect(pills('Klokkeslett').find((p) => p.checked)?.label).toBe('Annen tid');
    expect(screen.getByLabelText('Velg dag')).toHaveValue('2026-11-11');
    expect(screen.getByLabelText('Velg tid')).toHaveValue('13:30');
  });

  it('no tee-off: nothing is marked, and a lone day waits for the time', () => {
    render(<Harness initial="" />);
    expect(pills('Dag').some((p) => p.checked)).toBe(false);
    expect(pills('Klokkeslett').some((p) => p.checked)).toBe(false);

    fireEvent.click(screen.getByRole('radio', { name: 'I morgen' }));
    expect([pills('Dag').find((p) => p.checked)?.label, value()]).toEqual(['I morgen', '']);
    fireEvent.click(screen.getByRole('radio', { name: '08:00' }));
    expect(value()).toBe('2026-11-05T08:00');
  });

  it('on a Friday the Saturday default is «I morgen»', () => {
    render(<Harness initial="2026-11-07T09:00" now="2026-11-06T12:00" />);
    expect(pills('Dag').find((p) => p.checked)?.label).toBe('I morgen');
  });
});

describe('TeeOffQuickPicks — «Nå» (#2463)', () => {
  const nowValue = () => screen.getByTestId('now').textContent;

  it('«Nå» stands first on the day row, in the same radio group', () => {
    render(<Harness initial="2026-11-07T09:00" allowNow />);
    expect(pills('Dag').map((p) => [p.label, p.checked])).toEqual([
      ['Nå', false],
      ['I dag', false],
      ['I morgen', false],
      ['Annen dag', true],
    ]);
  });

  it('choosing «Nå» hides the times and the fields and shows «Dere står på banen»', () => {
    render(<Harness initial="2026-11-07T09:00" allowNow />);
    fireEvent.click(screen.getByRole('radio', { name: 'Nå' }));

    expect([nowValue(), value()]).toEqual(['now', '']);
    expect(pills('Dag').filter((p) => p.checked).map((p) => p.label)).toEqual(['Nå']);
    expect(screen.queryByRole('radiogroup', { name: 'Klokkeslett' })).toBeNull();
    expect(screen.queryByLabelText('Velg dag')).toBeNull();
    expect(screen.queryByLabelText('Velg tid')).toBeNull();

    const box = screen.getByText('Dere står på banen').parentElement!;
    expect(box).toHaveTextContent(
      'Tiden settes når du publiserer, og runden starter med en gang. Gjengen får varsel og kan føre slag fra første hull.',
    );
    // The day row is described by the box, so a screen reader hears it with «Nå».
    expect(screen.getByRole('radiogroup', { name: 'Dag' })).toHaveAttribute('aria-describedby', box.id);
  });

  it('a day after «Nå» leaves it, and the day waits for a time', () => {
    render(<Harness initial="" allowNow initialNow />);
    fireEvent.click(screen.getByRole('radio', { name: 'I dag' }));
    expect([nowValue(), value()]).toEqual(['', '']);
    expect(pills('Dag').find((p) => p.checked)?.label).toBe('I dag');
    fireEvent.click(screen.getByRole('radio', { name: '10:00' }));
    expect(value()).toBe('2026-11-04T10:00');
  });

  it('«Annen dag» after «Nå» opens an empty date field', () => {
    render(<Harness initial="" allowNow initialNow />);
    fireEvent.click(screen.getByRole('radio', { name: 'Annen dag' }));
    expect(nowValue()).toBe('');
    expect(screen.getByLabelText('Velg dag')).toHaveValue('');
    expect(screen.getByRole('radiogroup', { name: 'Klokkeslett' })).toBeInTheDocument();
  });

  it('without allowNow there is no «Nå», even with `now` set', () => {
    render(<Harness initial="2026-11-07T09:00" initialNow />);
    expect(pills('Dag').map((p) => p.label)).not.toContain('Nå');
    expect(screen.queryByText('Dere står på banen')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Klokkeslett' })).toBeInTheDocument();
  });
});
