import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WolfSetup } from './WolfSetup';

// Render-tester per docs/test-discipline.md — bekrefter at WolfSetup rendrer
// scoring-toggle og info-noten om at rotasjonen trekkes ved spillstart (#969).
// Rotation-preview og shuffle er fjernet; de testes ikke lenger her.

describe('WolfSetup', () => {
  it('rendrer scoring-toggle med netto/brutto og lar admin bytte', () => {
    const onScoringChange = vi.fn();

    render(
      <WolfSetup
        scoring="net"
        onScoringChange={onScoringChange}
      />,
    );

    expect(screen.getByText('Med handicap (netto)')).toBeInTheDocument();
    expect(screen.getByText('Brutto')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /brutto/i }));
    expect(onScoringChange).toHaveBeenCalledWith('gross');
  });

  it('viser info-note om at rotasjonen trekkes ved oppstart', () => {
    render(
      <WolfSetup
        scoring="net"
        onScoringChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('wolf-start-note')).toBeInTheDocument();
  });
});
