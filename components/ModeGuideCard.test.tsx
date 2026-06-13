import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ModeGuideCard } from './ModeGuideCard';

// Type C: én render-test for komponenten (ren presentasjon). Asserterer
// struktur (lukket <details>, navn, sammendrag, riktig antall punkter) og
// valgfri detailHref-lenke. Caller er ansvarlig for å hente innholdet —
// komponenten tar label/summary/points som props, så testen bruker enkle
// inline-fikstur-verdier.

const SUMMARY = 'Dere er to på lag, og beste netto per hull teller.';
const POINTS = ['Begge spiller hele runden.', 'Lavest lagtotal vinner.'];

describe('ModeGuideCard', () => {
  it('viser modus-navn og sammendrag, og folder ut punktene som en lukket disclosure', () => {
    render(<ModeGuideCard label="Best ball" summary={SUMMARY} points={POINTS} />);

    const card = screen.getByTestId('mode-guide');
    // Native <details>, lukket som default — punktene skjult til spilleren tar i.
    expect(card.tagName).toBe('DETAILS');
    expect((card as HTMLDetailsElement).open).toBe(false);

    // Navn + sammendrag synlig i summary.
    expect(within(card).getByText('Best ball')).toBeInTheDocument();
    expect(within(card).getByText(SUMMARY)).toBeInTheDocument();

    // Alle korte-regler-punkter rendres (antall styres av innholdet).
    const items = within(card).getAllByRole('listitem');
    expect(items).toHaveLength(POINTS.length);
  });

  it('viser navn og innhold uavhengig av variant (label + summary kommer som props)', () => {
    const variantSummary = 'Dere er to på lag. På hvert hull teller beste poengsum.';
    render(
      <ModeGuideCard
        label="4BBB Stableford"
        summary={variantSummary}
        points={['Begge samler poeng hver for seg.', 'Høyest lagtotal vinner.']}
      />,
    );

    const card = screen.getByTestId('mode-guide');
    expect(within(card).getByText('4BBB Stableford')).toBeInTheDocument();
    expect(within(card).getByText(variantSummary)).toBeInTheDocument();
    // En annen modus' summary skal ikke lekke inn.
    expect(within(card).queryByText(SUMMARY)).not.toBeInTheDocument();
  });

  it('rendrer detailHref som «Les mer»-lenke når satt', () => {
    render(
      <ModeGuideCard
        label="Wolf"
        summary={SUMMARY}
        points={POINTS}
        detailHref="/spillformater/wolf"
      />,
    );

    const link = screen.getByRole('link', { name: /les mer/i });
    expect(link).toHaveAttribute('href', '/spillformater/wolf');
  });

  it('rendrer IKKE Les mer-lenke når detailHref er utelatt', () => {
    render(<ModeGuideCard label="Skins" summary={SUMMARY} points={POINTS} />);

    expect(screen.queryByRole('link', { name: /les mer/i })).toBeNull();
  });
});
