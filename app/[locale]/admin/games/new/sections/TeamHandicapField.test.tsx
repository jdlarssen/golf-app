import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TeamHandicapField } from './TeamHandicapField';

// Én Type C render-test (docs/test-discipline.md) — låser oversettelsen mellom
// enheten arrangøren ser (prosent av snittet) og den appen lagrer (prosent av
// summen), gjennom selve feltet. Tallene er dekket av teamHandicapUnit.test.ts;
// her er spørsmålet om feltet faktisk er koblet begge veier. Setup-stubben
// (vitest.setup.ts) resolver next-intl mot no.json.
describe('TeamHandicapField — snitt-prosent i feltet, sum-prosent i state (#2009)', () => {
  it('viser lagret 15 % av summen som 45 på et 3-mannslag, og lagrer 80 som 26,67', () => {
    const onSumPctChange = vi.fn();
    render(
      <TeamHandicapField
        mode="texas_scramble"
        teamSize={3}
        sumPct={15}
        onSumPctChange={onSumPctChange}
      />,
    );

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('45');

    fireEvent.change(input, { target: { value: '80' } });
    expect(onSumPctChange).toHaveBeenCalledWith(26.67);
  });
});
