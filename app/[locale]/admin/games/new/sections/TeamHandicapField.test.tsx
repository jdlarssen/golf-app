import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TEAM_HANDICAP_AVERAGE_PCT_MAX } from '@/lib/games/teamHandicapUnit';
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
        rule="pct"
        onRuleChange={vi.fn()}
      />,
    );

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('45');
    // #2566: feltets tak er grensens hjem — 100 % av snittet.
    expect(input.max).toBe(String(TEAM_HANDICAP_AVERAGE_PCT_MAX));

    fireEvent.change(input, { target: { value: '80' } });
    expect(onSumPctChange).toHaveBeenCalledWith(26.67);
  });
});

// #3002 (F23), variant A: three cards on one row. The rule and the share live
// in the parent; the field says which card is chosen and what each tap writes.
describe('TeamHandicapField — Forbundets vekting, Egen prosent og Brutto (#3002)', () => {
  function setup(props: { teamSize?: number; sumPct?: number; rule: 'ngf' | 'pct' | null }) {
    const onSumPctChange = vi.fn();
    const onRuleChange = vi.fn();
    const view = render(
      <TeamHandicapField
        key={props.teamSize ?? 4}
        mode="texas_scramble"
        teamSize={props.teamSize ?? 4}
        sumPct={props.sumPct ?? 10}
        onSumPctChange={onSumPctChange}
        rule={props.rule}
        onRuleChange={onRuleChange}
      />,
    );
    return { onSumPctChange, onRuleChange, view };
  }

  it('NGF: the weighting card is chosen, the table for the team size shows, and no number field', () => {
    const { view } = setup({ rule: 'ngf' });
    expect(screen.getByRole('radio', { name: 'Forbundets vekting' })).toBeChecked();
    expect(screen.getByText(/25, 20, 15 og 10/)).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).toBeNull();

    // A team size change remounts the field with the table for two.
    view.rerender(
      <TeamHandicapField
        key={2}
        mode="texas_scramble"
        teamSize={2}
        sumPct={25}
        onSumPctChange={vi.fn()}
        rule="ngf"
        onRuleChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/35 og 15/)).toBeInTheDocument();
  });

  it('from NGF, «Egen prosent» writes pct and «Brutto» writes 0', () => {
    const { onSumPctChange, onRuleChange } = setup({ rule: 'ngf' });
    fireEvent.click(screen.getByRole('radio', { name: 'Egen prosent' }));
    expect(onRuleChange).toHaveBeenLastCalledWith('pct');
    expect(onSumPctChange).toHaveBeenLastCalledWith(10);

    fireEvent.click(screen.getByRole('radio', { name: 'Brutto' }));
    expect(onSumPctChange).toHaveBeenLastCalledWith(0);
  });

  it('a stored game without a rule shows «Egen prosent» and keeps null on Brutto', () => {
    const { onSumPctChange, onRuleChange } = setup({ rule: null });
    expect(screen.getByRole('radio', { name: 'Egen prosent' })).toBeChecked();
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('40');
    fireEvent.click(screen.getByRole('radio', { name: 'Brutto' }));
    expect(onSumPctChange).toHaveBeenLastCalledWith(0);
    expect(onRuleChange).not.toHaveBeenCalled();
  });

  it('from Brutto, «Forbundets vekting» writes ngf and brings the share back', () => {
    const { onSumPctChange, onRuleChange } = setup({ rule: 'pct', sumPct: 0 });
    expect(screen.getByRole('radio', { name: 'Brutto' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Forbundets vekting' }));
    expect(onRuleChange).toHaveBeenLastCalledWith('ngf');
    // The start value for four, 10 % of the sum.
    expect(onSumPctChange).toHaveBeenLastCalledWith(10);
  });
});
