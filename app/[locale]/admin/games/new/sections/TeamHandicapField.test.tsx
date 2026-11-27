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

// #3002 (F23): «Netto» and «Brutto» on top, as the other formats; under
// Netto two pills, «Standard» (NGF's weighting) and «Egen prosent» (the owner,
// 27.11.2026: nearer variant B, simpler words). The rule and the share live in
// the parent; the field says what is chosen and what each tap writes.
describe('TeamHandicapField — Netto/Brutto, Standard og Egen prosent (#3002)', () => {
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

  it('Standard: Netto and Standard are chosen, the table for the team size shows, and no number field', () => {
    const { view } = setup({ rule: 'ngf' });
    expect(screen.getByRole('radio', { name: 'Netto' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
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

  it('«Egen prosent» is one tap: it writes pct and shows the number field', () => {
    const { onRuleChange, view } = setup({ rule: 'ngf' });
    fireEvent.click(screen.getByRole('radio', { name: 'Egen prosent' }));
    expect(onRuleChange).toHaveBeenLastCalledWith('pct');
    view.rerender(
      <TeamHandicapField key={4} mode="texas_scramble" teamSize={4} sumPct={10} onSumPctChange={vi.fn()} rule="pct" onRuleChange={vi.fn()} />,
    );
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('40');
  });

  it('Brutto from Standard writes pct and 0, and Netto brings Standard and the share back', () => {
    const { onSumPctChange, onRuleChange, view } = setup({ rule: 'ngf' });
    fireEvent.click(screen.getByRole('radio', { name: 'Brutto' }));
    expect(onRuleChange).toHaveBeenLastCalledWith('pct');
    expect(onSumPctChange).toHaveBeenLastCalledWith(0);

    const back = { onSumPctChange: vi.fn(), onRuleChange: vi.fn() };
    view.rerender(
      <TeamHandicapField key={4} mode="texas_scramble" teamSize={4} sumPct={0} onSumPctChange={back.onSumPctChange} rule="pct" onRuleChange={back.onRuleChange} />,
    );
    expect(screen.getByRole('radio', { name: 'Brutto' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Standard' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Netto' }));
    expect(back.onRuleChange).toHaveBeenLastCalledWith('ngf');
    expect(back.onSumPctChange).toHaveBeenLastCalledWith(10);
  });

  it('a stored game without a rule shows «Egen prosent» and keeps null through Brutto', () => {
    const { onSumPctChange, onRuleChange } = setup({ rule: null });
    expect(screen.getByRole('radio', { name: 'Egen prosent' })).toBeChecked();
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('40');
    fireEvent.click(screen.getByRole('radio', { name: 'Brutto' }));
    expect(onSumPctChange).toHaveBeenLastCalledWith(0);
    expect(onRuleChange).not.toHaveBeenCalled();
  });
});
