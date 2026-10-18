import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ShambleSetup } from './ShambleSetup';

// Én Type C render-test per docs/test-discipline.md — bekrefter at ShambleSetup
// rendrer alle radio-gruppene med riktige default-valg, og at count-velgeren
// skjules ved Shamble-variant men vises ved Champagne Scramble.
// Shamble-scoring-logikk testes i scoring-laget (shamble.test.ts), ikke her.

describe('ShambleSetup', () => {
  it('rendrer alle grupper; count-velger styres av variant (skjult ved shamble, synlig ved champagne)', () => {
    const noop = vi.fn();
    const props = {
      onVariantChange: noop,
      count: 2 as const,
      onCountChange: noop,
      scoring: 'net' as const,
      onScoringChange: noop,
      teamSize: 4 as const,
      onTeamSizeChange: noop,
      allowancePct: 100,
      onAllowanceChange: noop,
    };

    const { rerender } = render(<ShambleSetup variant="shamble" {...props} />);

    // Lagstørrelse-, variant- og scoring-radios vises, med riktige defaults.
    expect(screen.getByRole('radio', { name: /3-mannslag/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /4-mannslag/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /shamble.*best 2/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /champagne scramble/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /netto/i })).toBeChecked();
    expect(screen.getByText('Brutto')).toBeInTheDocument();

    // Count-velger er IKKE synlig ved variant=shamble (best 2 er låst).
    expect(
      screen.queryByRole('radiogroup', { name: /antall score som teller/i }),
    ).not.toBeInTheDocument();

    // Ved Champagne Scramble dukker count-velgeren opp med tre valg (1/2/3).
    rerender(<ShambleSetup variant="champagne" {...props} />);
    const countGroup = screen.getByRole('radiogroup', {
      name: /antall score som teller/i,
    });
    expect(countGroup.querySelectorAll('input[type="radio"]')).toHaveLength(3);

    // #2453: med et kompis-antall står lagstørrelsen som ikke går opp, grå
    // og sier hvorfor. Hva den sier per antall, eier teamSizeFit (Type A).
    rerender(<ShambleSetup variant="shamble" {...props} teamSize={3} playerCount={6} />);
    expect(screen.getByRole('radio', { name: /3-mannslag/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /4-mannslag.*trenger 8/i })).toBeDisabled();
  });

  // #2570: the percentage field sits under «Tellemåte», only with Netto.
  it('handicap-andelen vises med Netto og er borte med Brutto', () => {
    const noop = vi.fn();
    const onAllowanceChange = vi.fn();
    const props = {
      variant: 'shamble' as const,
      onVariantChange: noop,
      count: 2 as const,
      onCountChange: noop,
      onScoringChange: noop,
      teamSize: 4 as const,
      onTeamSizeChange: noop,
      allowancePct: 80,
      onAllowanceChange,
    };

    const { rerender } = render(<ShambleSetup scoring="net" {...props} />);
    const field = screen.getByLabelText('Handicap-andel (%)');
    expect(field).toHaveValue(80);
    expect(
      screen.getByText('Andel av spillerens handicap som teller. 100 = fullt banehandicap (standard).'),
    ).toBeInTheDocument();

    fireEvent.change(field, { target: { value: '75' } });
    expect(onAllowanceChange).toHaveBeenLastCalledWith(75);
    // Outside 0–100 is not committed, as in the general field.
    onAllowanceChange.mockClear();
    fireEvent.change(field, { target: { value: '120' } });
    expect(onAllowanceChange).not.toHaveBeenCalled();

    rerender(<ShambleSetup scoring="gross" {...props} />);
    expect(screen.queryByLabelText('Handicap-andel (%)')).not.toBeInTheDocument();
  });
});
