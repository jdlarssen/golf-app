import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AllowanceField } from './AllowanceField';

// Behovsfokuserte tester for toggle-state-maskinen. Approach: render én
// gang, sjekk markup, klikk for å bytte mode, verifiser at hidden input
// og UI synker. Dette er behavior-as-pure-state, ikke data-rendering.
//
// Felles fixture-props: minimumshelpere for legend/bruttoHelperText som
// alle varianter trenger.
const baseProps = {
  fieldName: 'hcp_allowance_pct',
  defaultPct: 100,
  legend: 'Scoring',
  bruttoHelperText: 'Ingen handicap',
};

describe('AllowanceField — toggle state machine', () => {
  it('initialPct=0 → renderes i brutto-modus, hidden field = "0"', () => {
    const { container } = render(<AllowanceField {...baseProps} initialPct={0} />);
    expect(screen.getByText('Ingen handicap')).toBeTruthy();
    // Tall-input skal IKKE vises i brutto-modus
    expect(screen.queryByLabelText('Handicap-andel (%)')).toBeNull();
    const hidden = container.querySelector('input[name="hcp_allowance_pct"]') as HTMLInputElement;
    expect(hidden?.value).toBe('0');
  });

  it('initialPct=85 → renderes i netto-modus, hidden field = "85"', () => {
    const { container } = render(<AllowanceField {...baseProps} initialPct={85} />);
    const input = screen.getByLabelText('Handicap-andel (%)') as HTMLInputElement;
    expect(input.value).toBe('85');
    const hidden = container.querySelector('input[name="hcp_allowance_pct"]') as HTMLInputElement;
    expect(hidden?.value).toBe('85');
  });

  it('default (ingen initialPct) → bruker defaultPct og starter i netto', () => {
    const { container } = render(<AllowanceField {...baseProps} defaultPct={100} />);
    const input = screen.getByLabelText('Handicap-andel (%)') as HTMLInputElement;
    expect(input.value).toBe('100');
    const hidden = container.querySelector('input[name="hcp_allowance_pct"]') as HTMLInputElement;
    expect(hidden?.value).toBe('100');
  });

  it('klikker brutto → input forsvinner, hidden field = "0"', () => {
    const { container } = render(<AllowanceField {...baseProps} initialPct={85} />);
    fireEvent.click(screen.getByText('Brutto'));
    expect(screen.queryByLabelText('Handicap-andel (%)')).toBeNull();
    const hidden = container.querySelector('input[name="hcp_allowance_pct"]') as HTMLInputElement;
    expect(hidden?.value).toBe('0');
  });

  it('lastNettoPct-memo: bytte til brutto og tilbake gjenoppretter pct', () => {
    const { container } = render(<AllowanceField {...baseProps} initialPct={72} />);
    fireEvent.click(screen.getByText('Brutto'));
    fireEvent.click(screen.getByText('Netto'));
    const input = screen.getByLabelText('Handicap-andel (%)') as HTMLInputElement;
    expect(input.value).toBe('72');
    const hidden = container.querySelector('input[name="hcp_allowance_pct"]') as HTMLInputElement;
    expect(hidden?.value).toBe('72');
  });

  it('controlled mode kaller onChange ved klikk, hidden input droppet med hideHiddenInput', () => {
    let captured = 50;
    const { container, rerender } = render(
      <AllowanceField
        {...baseProps}
        value={captured}
        onChange={(p) => (captured = p)}
        hideHiddenInput
      />,
    );
    fireEvent.click(screen.getByText('Brutto'));
    expect(captured).toBe(0);

    // Parent oppdaterer value
    rerender(
      <AllowanceField
        {...baseProps}
        value={captured}
        onChange={(p) => (captured = p)}
        hideHiddenInput
      />,
    );
    // Ingen hidden input når hideHiddenInput er satt
    expect(container.querySelector('input[name="hcp_allowance_pct"]')).toBeNull();
  });

  it('fieldName parametriserer hidden-felt-navnet', () => {
    const { container } = render(
      <AllowanceField
        {...baseProps}
        fieldName="texas_team_handicap_pct"
        defaultPct={25}
      />,
    );
    expect(container.querySelector('input[name="texas_team_handicap_pct"]')).toBeTruthy();
    expect(container.querySelector('input[name="hcp_allowance_pct"]')).toBeNull();
  });

  it('maxPct styrer både feltets max og hva onChange godtar (#2566)', () => {
    const { container } = render(<AllowanceField {...baseProps} initialPct={40} maxPct={50} />);
    const input = screen.getByLabelText('Handicap-andel (%)') as HTMLInputElement;
    const hidden = () => (container.querySelector('input[name="hcp_allowance_pct"]') as HTMLInputElement).value;
    expect(input.max).toBe('50');

    fireEvent.change(input, { target: { value: '60' } });
    expect(hidden()).toBe('40');
    fireEvent.change(input, { target: { value: '50' } });
    expect(hidden()).toBe('50');
  });
});

// #2455: the general «Scoring» field in the wizard's Handicap sheet gets the
// share as pills and a − / + counter. Same state machine, new controls.
describe('AllowanceField — presets and counter (#2455)', () => {
  const withPresets = { ...baseProps, presets: [100, 95, 90, 85], stepPct: 5 };
  const hidden = (container: HTMLElement) =>
    (container.querySelector('input[name="hcp_allowance_pct"]') as HTMLInputElement).value;
  const pressed = () =>
    screen
      .getAllByRole('button', { pressed: true })
      .map((b) => b.textContent);

  it('without presets there are no pills and no counter (the number field as before)', () => {
    render(<AllowanceField {...baseProps} initialPct={85} />);
    expect(screen.queryAllByRole('button', { pressed: false })).toEqual([]);
    expect(screen.queryByRole('button', { name: '5 prosent mer' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Handicap-andel' })).toBeNull();
  });

  it('a pill sets the share and is the one pressed', () => {
    const { container } = render(<AllowanceField {...withPresets} initialPct={100} />);
    expect(pressed()).toEqual(['100 %']);
    fireEvent.click(screen.getByRole('button', { name: '90 %' }));
    expect(hidden(container)).toBe('90');
    expect(pressed()).toEqual(['90 %']);
    expect((screen.getByLabelText('Handicap-andel (%)') as HTMLInputElement).value).toBe('90');
  });

  it('− and + move 5 at a time, within 5–100', () => {
    const { container } = render(<AllowanceField {...withPresets} initialPct={10} />);
    const less = screen.getByRole('button', { name: '5 prosent mindre' });
    const more = screen.getByRole('button', { name: '5 prosent mer' });
    fireEvent.click(less);
    expect(hidden(container)).toBe('5');
    expect(less).toBeDisabled();
    fireEvent.click(more);
    fireEvent.click(more);
    expect(hidden(container)).toBe('15');

    fireEvent.click(screen.getByRole('button', { name: '95 %' }));
    fireEvent.click(more);
    expect(hidden(container)).toBe('100');
    expect(more).toBeDisabled();
  });

  it('a draft with 93 shows 93 and no pill pressed; + gives 95, − gives 90', () => {
    const { container, unmount } = render(<AllowanceField {...withPresets} initialPct={93} />);
    expect((screen.getByLabelText('Handicap-andel (%)') as HTMLInputElement).value).toBe('93');
    expect(screen.queryAllByRole('button', { pressed: true })).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '5 prosent mer' }));
    expect(hidden(container)).toBe('95');
    expect(pressed()).toEqual(['95 %']);
    unmount();

    const again = render(<AllowanceField {...withPresets} initialPct={93} />);
    fireEvent.click(screen.getByRole('button', { name: '5 prosent mindre' }));
    expect(hidden(again.container)).toBe('90');
  });

  it('− brings a stored share over 100 back to 100', () => {
    const { container } = render(<AllowanceField {...withPresets} initialPct={150} />);
    expect(screen.getByRole('button', { name: '5 prosent mer' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '5 prosent mindre' }));
    expect(hidden(container)).toBe('100');
  });

  it('the footer takes the helper text’s place; without it the helper shows', () => {
    const { rerender } = render(
      <AllowanceField {...withPresets} nettoHelperText="Andel som teller." footer={<p>Eksempelet</p>} />,
    );
    expect(screen.getByText('Eksempelet')).toBeInTheDocument();
    expect(screen.queryByText('Andel som teller.')).toBeNull();
    rerender(<AllowanceField {...withPresets} nettoHelperText="Andel som teller." />);
    expect(screen.getByText('Andel som teller.')).toBeInTheDocument();
  });

  it('Brutto hides pills, counter and footer; Netto brings back the last share', () => {
    const { container } = render(
      <AllowanceField {...withPresets} initialPct={85} footer={<p>Eksempelet</p>} />,
    );
    fireEvent.click(screen.getByText('Brutto'));
    expect(hidden(container)).toBe('0');
    expect(screen.queryByRole('button', { name: '85 %' })).toBeNull();
    expect(screen.queryByRole('button', { name: '5 prosent mer' })).toBeNull();
    expect(screen.queryByText('Eksempelet')).toBeNull();
    expect(screen.getByText('Ingen handicap')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Netto'));
    expect(hidden(container)).toBe('85');
    expect(pressed()).toEqual(['85 %']);
  });
});
