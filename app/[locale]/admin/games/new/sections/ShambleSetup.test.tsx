import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  });
});
