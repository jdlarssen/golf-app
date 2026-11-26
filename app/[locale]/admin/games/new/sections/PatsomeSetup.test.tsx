import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PatsomeSetup } from './PatsomeSetup';

// Én Type C render-test per docs/test-discipline.md — bekrefter at PatsomeSetup
// rendrer scoring-gruppen med riktig default-valg og kaller onChange.
// Patsome-scoring-logikk testes i scoring-laget, ikke her.

describe('PatsomeSetup', () => {
  it('rendrer scoring-gruppe med default netto-valg og kaller onChange', () => {
    const onScoringChange = vi.fn();

    render(
      <PatsomeSetup
        scoring="net"
        onScoringChange={onScoringChange}
        fourballAllowancePct={85}
        onFourballAllowanceChange={vi.fn()}
      />,
    );

    // Begge scoring-alternativer vises.
    expect(screen.getByText('Netto')).toBeInTheDocument();
    expect(screen.getByText('Brutto')).toBeInTheDocument();

    // Forklaringstekst om de tre segmentene er synlig.
    expect(screen.getAllByText(/4BBB/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Greensome/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Foursomes/i).length).toBeGreaterThan(0);

    // Default-scoring net er valgt.
    const nettoRadio = screen.getByRole('radio', { name: /netto/i });
    const bruttoRadio = screen.getByRole('radio', { name: /brutto/i });
    expect(nettoRadio).toBeChecked();
    expect(bruttoRadio).not.toBeChecked();

    // Klikk Brutto → onScoringChange('gross').
    fireEvent.click(bruttoRadio);
    expect(onScoringChange).toHaveBeenCalledWith('gross');
  });
});

// #3002 (F24): the share on holes 1–6 sits under Netto, starts on what the
// parent holds, and hides in Brutto.
describe('PatsomeSetup — handicap-andel på hull 1–6 (#3002)', () => {
  it('shows the share under Netto and commits a whole 0–100', () => {
    const onFourballAllowanceChange = vi.fn();
    render(
      <PatsomeSetup
        scoring="net"
        onScoringChange={vi.fn()}
        fourballAllowancePct={85}
        onFourballAllowanceChange={onFourballAllowanceChange}
      />,
    );
    const input = screen.getByRole('spinbutton', { name: /hull 1–6/ }) as HTMLInputElement;
    expect(input.value).toBe('85');
    fireEvent.change(input, { target: { value: '90' } });
    expect(onFourballAllowanceChange).toHaveBeenLastCalledWith(90);
    fireEvent.change(input, { target: { value: '101' } });
    expect(onFourballAllowanceChange).toHaveBeenCalledTimes(1);
  });

  it('a stored game without the share shows the full handicap, 100', () => {
    render(
      <PatsomeSetup
        scoring="net"
        onScoringChange={vi.fn()}
        fourballAllowancePct={null}
        onFourballAllowanceChange={vi.fn()}
      />,
    );
    expect((screen.getByRole('spinbutton', { name: /hull 1–6/ }) as HTMLInputElement).value).toBe('100');
  });

  it('hides the share in Brutto', () => {
    render(
      <PatsomeSetup
        scoring="gross"
        onScoringChange={vi.fn()}
        fourballAllowancePct={85}
        onFourballAllowanceChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});
