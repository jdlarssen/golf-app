import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TeeOffQuickPicks } from './TeeOffQuickPicks';

// Type B (#2448): the TEE-OFF rows on «Hvor og når?» (`Nyttspill-forslag-bane`).
// Only Date is faked: Wednesday 4 November 2026, 08:30 in Oslo (07:30Z).
const NOW = '2026-11-04T08:30';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T07:30:00.000Z'));
});
afterEach(() => vi.useRealTimers());

function Harness({ initial, now = NOW }: { initial: string; now?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TeeOffQuickPicks value={value} onChange={setValue} teeOffNow={now} />
      <output data-testid="value">{value}</output>
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
  it('draws the day and time rows, with the Saturday default marked', () => {
    render(<Harness initial="2026-11-07T09:00" />);
    expect(pills('Dag')).toEqual([
      { label: 'I dag', checked: false, disabled: false },
      { label: 'I morgen', checked: false, disabled: false },
      { label: 'Lør. 7. nov', checked: true, disabled: false },
      { label: 'Annen dag', checked: false, disabled: false },
    ]);
    expect(pills('Klokkeslett').map((p) => [p.label, p.checked])).toEqual([
      ['08:00', false],
      ['09:00', true],
      ['10:00', false],
      ['Annen tid', false],
    ]);
    expect(screen.queryByLabelText('Velg dag')).toBeNull();
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

    fireEvent.click(screen.getByRole('radio', { name: 'Lør. 7. nov' }));
    expect([pills('Dag').find((p) => p.checked)?.label, value()]).toEqual(['Lør. 7. nov', '']);
    fireEvent.click(screen.getByRole('radio', { name: '08:00' }));
    expect(value()).toBe('2026-11-07T08:00');
  });

  it('on a Friday the Saturday default is «I morgen»', () => {
    render(<Harness initial="2026-11-07T09:00" now="2026-11-06T12:00" />);
    expect(pills('Dag').find((p) => p.checked)?.label).toBe('I morgen');
  });
});
