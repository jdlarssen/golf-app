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
