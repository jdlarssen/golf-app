import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AceyDeuceySetup } from './AceyDeuceySetup';

// Én Type C render-test per docs/test-discipline.md — bekrefter at
// AceyDeuceySetup rendrer scoring-toggle med begge alternativer, speiler
// valgt scoring fra prop, og kaller onScoringChange ved klikk.
// Disabled-flagget respekteres. Acey Deucey-logikken testes i scoring-laget.

describe('AceyDeuceySetup', () => {
  it('rendrer scoring-toggle og kaller onScoringChange ved bytte', () => {
    const onScoringChange = vi.fn();

    render(
      <AceyDeuceySetup scoring="net" onScoringChange={onScoringChange} />,
    );

    // Begge alternativer vises.
    expect(screen.getByText('Med handicap (netto)')).toBeInTheDocument();
    expect(screen.getByText('Brutto')).toBeInTheDocument();

    // Netto er valgt (checked).
    const nettoRadio = screen.getByRole('radio', { name: /med handicap/i });
    const bruttoRadio = screen.getByRole('radio', { name: /brutto/i });
    expect(nettoRadio).toBeChecked();
    expect(bruttoRadio).not.toBeChecked();

    // Klikk Brutto → onScoringChange('gross').
    fireEvent.click(bruttoRadio);
    expect(onScoringChange).toHaveBeenCalledWith('gross');
  });

  it('disabler radio-inputene når disabled=true', () => {
    render(
      <AceyDeuceySetup
        scoring="gross"
        onScoringChange={vi.fn()}
        disabled
      />,
    );

    expect(screen.getByRole('radio', { name: /med handicap/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /brutto/i })).toBeDisabled();

    // Brutto er valgt når scoring='gross'.
    expect(screen.getByRole('radio', { name: /brutto/i })).toBeChecked();
  });
});
