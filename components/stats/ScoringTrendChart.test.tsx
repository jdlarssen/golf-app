import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ScoringTrendChart } from './ScoringTrendChart';
import { buildScoringTrend } from '@/lib/stats/scoringTrend';

// Type C: én render-test for komponenten (ren presentasjon). Asserterer
// STRUKTUR — to polylinjer, role="img"/aria-label, legende — ikke koordinat-
// tallene (de er Type A-dekket i lib/stats/scoringTrend.test.ts). Geometrien
// bygges fra den ekte rene funksjonen så testen speiler produksjonsbruk.

describe('ScoringTrendChart', () => {
  it('rendrer brutto- og netto-linje med tilgjengelig figur og legende', () => {
    const geometry = buildScoringTrend([
      { brutto: 92, netto: 74 },
      { brutto: 88, netto: 71 },
      { brutto: 90, netto: 73 },
    ])!;

    const { container } = render(
      <ScoringTrendChart
        geometry={geometry}
        ariaLabel="Scoringstrend over 3 runder"
        bruttoLabel="Brutto"
        nettoLabel="Netto"
      />,
    );

    // Tilgjengelig: SVG-en er et bilde med norsk sammendrag.
    const img = screen.getByRole('img', { name: 'Scoringstrend over 3 runder' });
    expect(img.tagName.toLowerCase()).toBe('svg');

    // To linjer: brutto + netto.
    expect(container.querySelectorAll('polyline')).toHaveLength(2);

    // Legenden navngir begge linjene i markerbar tekst.
    const figure = screen.getByTestId('scoring-trend');
    expect(within(figure).getByText('Brutto')).toBeInTheDocument();
    expect(within(figure).getByText('Netto')).toBeInTheDocument();
  });

  it('skjuler netto-linje og -legende når ingen runde har netto', () => {
    const geometry = buildScoringTrend([
      { brutto: 92, netto: null },
      { brutto: 88, netto: null },
    ])!;

    const { container } = render(
      <ScoringTrendChart
        geometry={geometry}
        ariaLabel="Scoringstrend over 2 runder"
        bruttoLabel="Brutto"
        nettoLabel="Netto"
      />,
    );

    // Kun brutto-linja tegnes.
    expect(container.querySelectorAll('polyline')).toHaveLength(1);
    const figure = screen.getByTestId('scoring-trend');
    expect(within(figure).getByText('Brutto')).toBeInTheDocument();
    expect(within(figure).queryByText('Netto')).not.toBeInTheDocument();
  });
});
