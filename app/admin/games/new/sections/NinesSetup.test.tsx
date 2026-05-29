import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NinesSetup } from './NinesSetup';

// Én Type C render-test per docs/test-discipline.md — bekrefter at NinesSetup
// rendrer begge radio-gruppene med riktige default-valg og kaller onChange.
// Nines-scoring-logikk testes i scoring-laget, ikke her.

describe('NinesSetup', () => {
  it('rendrer variant- og scoring-grupper med default-valg og kaller onChange', () => {
    const onVariantChange = vi.fn();
    const onScoringChange = vi.fn();

    render(
      <NinesSetup
        variant="nines"
        onVariantChange={onVariantChange}
        scoring="net"
        onScoringChange={onScoringChange}
      />,
    );

    // Begge variant-alternativer vises.
    expect(screen.getByText('Nines')).toBeInTheDocument();
    expect(screen.getByText('Split Sixes')).toBeInTheDocument();

    // Begge scoring-alternativer vises.
    expect(screen.getByText('Netto')).toBeInTheDocument();
    expect(screen.getByText('Brutto')).toBeInTheDocument();

    // Default-variant nines er valgt. Accessible name kombinerer alle span-tekster
    // i label-en: "Nines9 poeng per hull (5–3–1)".
    const ninesRadio = screen.getByRole('radio', { name: /nines.*9 poeng/i });
    const splitSixesRadio = screen.getByRole('radio', { name: /split sixes/i });
    expect(ninesRadio).toBeChecked();
    expect(splitSixesRadio).not.toBeChecked();

    // Default-scoring net er valgt. Accessible name: "NettoHandicap-justert".
    const nettoRadio = screen.getByRole('radio', { name: /netto/i });
    const bruttoRadio = screen.getByRole('radio', { name: /brutto/i });
    expect(nettoRadio).toBeChecked();
    expect(bruttoRadio).not.toBeChecked();

    // Klikk Split Sixes → onVariantChange('split_sixes').
    fireEvent.click(splitSixesRadio);
    expect(onVariantChange).toHaveBeenCalledWith('split_sixes');

    // Klikk Brutto → onScoringChange('gross').
    fireEvent.click(bruttoRadio);
    expect(onScoringChange).toHaveBeenCalledWith('gross');
  });
});
