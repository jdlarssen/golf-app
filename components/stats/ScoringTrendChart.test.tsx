import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ScoringTrendChart } from './ScoringTrendChart';
import {
  buildScoringTrend,
  summarizeTrendRounds,
  type TrendRound,
} from '@/lib/stats/scoringTrend';

// Type C: render-test for komponenten (ren presentasjon). Asserterer STRUKTUR —
// linjer, rekord-ringer, header, boks-etiketter, role="img" — ikke koordinat-
// matematikken (Type A-dekket i lib/stats/scoringTrend.test.ts). Geometri +
// sammendrag bygges fra de ekte rene funksjonene så testen speiler produksjon.

const LABELS = {
  heading: 'Formkurven din',
  windowLabel: 'Siste 3 runder',
  dateRangeLabel: '1. jan – 3. jan',
  bruttoLabel: 'Brutto',
  nettoLabel: 'Netto',
  startLabel: 'Start',
  nowLabel: 'Nå',
  bestLabel: 'Beste',
};

function renderChart(rounds: TrendRound[], ariaLabel: string) {
  const geometry = buildScoringTrend(rounds)!;
  const summary = summarizeTrendRounds(rounds);
  return render(
    <ScoringTrendChart
      geometry={geometry}
      summary={summary}
      ariaLabel={ariaLabel}
      {...LABELS}
    />,
  );
}

describe('ScoringTrendChart', () => {
  it('rendrer header, brutto- og netto-bokser, to linjer og to rekord-ringer', () => {
    const { container } = renderChart(
      [
        { brutto: 92, netto: 74 },
        { brutto: 88, netto: 71 },
        { brutto: 90, netto: 73 },
      ],
      'Formkurve over 3 runder',
    );

    const img = screen.getByRole('img', { name: 'Formkurve over 3 runder' });
    expect(img.tagName.toLowerCase()).toBe('svg');

    // To linjer (brutto + netto) og to rekord-ringer (beste brutto + beste netto).
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
    expect(screen.getAllByTestId('trend-record')).toHaveLength(2);

    const figure = screen.getByTestId('scoring-trend');
    // Header.
    expect(within(figure).getByText('Formkurven din')).toBeInTheDocument();
    expect(within(figure).getByText('Siste 3 runder')).toBeInTheDocument();
    expect(within(figure).getByText('1. jan – 3. jan')).toBeInTheDocument();
    // Rad-etiketter + anker-etiketter (én av hver per rad → to rader).
    expect(within(figure).getByText('Brutto')).toBeInTheDocument();
    expect(within(figure).getByText('Netto')).toBeInTheDocument();
    expect(within(figure).getAllByText('Beste')).toHaveLength(2);
  });

  it('skjuler netto-rad, -linje og -rekord når ingen runde har netto', () => {
    const { container } = renderChart(
      [
        { brutto: 92, netto: null },
        { brutto: 88, netto: null },
      ],
      'Formkurve over 2 runder',
    );

    // Kun brutto-linja + brutto-rekorden.
    expect(container.querySelectorAll('polyline')).toHaveLength(1);
    expect(screen.getAllByTestId('trend-record')).toHaveLength(1);

    const figure = screen.getByTestId('scoring-trend');
    expect(within(figure).getByText('Brutto')).toBeInTheDocument();
    expect(within(figure).queryByText('Netto')).not.toBeInTheDocument();
    // «Beste» finnes nå kun på brutto-raden.
    expect(within(figure).getAllByText('Beste')).toHaveLength(1);
  });
});
