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
    expect(screen.queryByLabelText('Allowance (%)')).toBeNull();
    const hidden = container.querySelector('input[name="hcp_allowance_pct"]') as HTMLInputElement;
    expect(hidden?.value).toBe('0');
  });

  it('initialPct=85 → renderes i netto-modus, hidden field = "85"', () => {
    const { container } = render(<AllowanceField {...baseProps} initialPct={85} />);
    const input = screen.getByLabelText('Allowance (%)') as HTMLInputElement;
    expect(input.value).toBe('85');
    const hidden = container.querySelector('input[name="hcp_allowance_pct"]') as HTMLInputElement;
    expect(hidden?.value).toBe('85');
  });

  it('default (ingen initialPct) → bruker defaultPct og starter i netto', () => {
    const { container } = render(<AllowanceField {...baseProps} defaultPct={100} />);
    const input = screen.getByLabelText('Allowance (%)') as HTMLInputElement;
    expect(input.value).toBe('100');
    const hidden = container.querySelector('input[name="hcp_allowance_pct"]') as HTMLInputElement;
    expect(hidden?.value).toBe('100');
  });

  it('klikker brutto → input forsvinner, hidden field = "0"', () => {
    const { container } = render(<AllowanceField {...baseProps} initialPct={85} />);
    fireEvent.click(screen.getByText('Brutto'));
    expect(screen.queryByLabelText('Allowance (%)')).toBeNull();
    const hidden = container.querySelector('input[name="hcp_allowance_pct"]') as HTMLInputElement;
    expect(hidden?.value).toBe('0');
  });

  it('lastNettoPct-memo: bytte til brutto og tilbake gjenoppretter pct', () => {
    const { container } = render(<AllowanceField {...baseProps} initialPct={72} />);
    fireEvent.click(screen.getByText('Brutto'));
    fireEvent.click(screen.getByText('Netto'));
    const input = screen.getByLabelText('Allowance (%)') as HTMLInputElement;
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
});
