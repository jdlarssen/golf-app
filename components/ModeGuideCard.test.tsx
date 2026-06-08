import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ModeGuideCard } from './ModeGuideCard';
import { MODE_GUIDE, STABLEFORD_4BBB_GUIDE } from '@/lib/formats/modeGuide';
import { MODE_LABELS } from '@/lib/scoring/modes/types';

// Type C: én render-test for komponenten (ren presentasjon). Asserterer
// struktur (lukket <details>, navn, sammendrag, riktig antall punkter) og
// valgfri detailHref-lenke. Caller er ansvarlig for å hente merged content —
// komponenten tar label/summary/points som props.

describe('ModeGuideCard', () => {
  it('viser modus-navn og sammendrag, og folder ut punktene som en lukket disclosure', () => {
    const guide = MODE_GUIDE.best_ball;
    render(
      <ModeGuideCard
        label={MODE_LABELS.best_ball}
        summary={guide.summary}
        points={guide.points}
      />,
    );

    const card = screen.getByTestId('mode-guide');
    // Native <details>, lukket som default — punktene skjult til spilleren tar i.
    expect(card.tagName).toBe('DETAILS');
    expect((card as HTMLDetailsElement).open).toBe(false);

    // Navn + sammendrag synlig i summary (verdier fra single source of truth).
    expect(within(card).getByText(MODE_LABELS.best_ball)).toBeInTheDocument();
    expect(within(card).getByText(guide.summary)).toBeInTheDocument();

    // Alle korte-regler-punkter rendres (antall styres av innholdet).
    const items = within(card).getAllByRole('listitem');
    expect(items).toHaveLength(guide.points.length);
  });

  it('viser 4BBB-navn og 4BBB-guide-innhold for stableford-lag-variant', () => {
    render(
      <ModeGuideCard
        label="4BBB Stableford"
        summary={STABLEFORD_4BBB_GUIDE.summary}
        points={STABLEFORD_4BBB_GUIDE.points}
      />,
    );

    const card = screen.getByTestId('mode-guide');
    expect(within(card).getByText('4BBB Stableford')).toBeInTheDocument();
    expect(
      within(card).getByText(STABLEFORD_4BBB_GUIDE.summary),
    ).toBeInTheDocument();
    // Solo-summaryen skal IKKE vises på et lag-spill.
    expect(
      within(card).queryByText(MODE_GUIDE.stableford.summary),
    ).not.toBeInTheDocument();
  });

  it('rendrer detailHref som «Les mer»-lenke når satt', () => {
    const guide = MODE_GUIDE.wolf;
    render(
      <ModeGuideCard
        label={MODE_LABELS.wolf}
        summary={guide.summary}
        points={guide.points}
        detailHref="/spillformater/wolf"
      />,
    );

    const link = screen.getByRole('link', { name: /les mer/i });
    expect(link).toHaveAttribute('href', '/spillformater/wolf');
  });

  it('rendrer IKKE Les mer-lenke når detailHref er utelatt', () => {
    const guide = MODE_GUIDE.skins;
    render(
      <ModeGuideCard
        label={MODE_LABELS.skins}
        summary={guide.summary}
        points={guide.points}
      />,
    );

    expect(screen.queryByRole('link', { name: /les mer/i })).toBeNull();
  });
});
