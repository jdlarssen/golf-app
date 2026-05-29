import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ModeGuideCard } from './ModeGuideCard';
import { MODE_GUIDE } from '@/lib/formats/modeGuide';
import { MODE_LABELS } from '@/lib/scoring/modes/types';

// Type C: én render-test for komponenten. Asserterer struktur (lukket
// <details>, navn, sammendrag, riktig antall punkter) framfor å duplisere
// copy-strenger — verdiene leses fra MODE_GUIDE/MODE_LABELS, ikke hardkodet.

describe('ModeGuideCard', () => {
  it('viser modus-navn og sammendrag, og folder ut punktene som en lukket disclosure', () => {
    render(<ModeGuideCard mode="best_ball" />);

    const card = screen.getByTestId('mode-guide');
    // Native <details>, lukket som default — punktene skjult til spilleren tar i.
    expect(card.tagName).toBe('DETAILS');
    expect((card as HTMLDetailsElement).open).toBe(false);

    // Navn + sammendrag synlig i summary (verdier fra single source of truth).
    expect(within(card).getByText(MODE_LABELS.best_ball)).toBeInTheDocument();
    expect(
      within(card).getByText(MODE_GUIDE.best_ball.summary),
    ).toBeInTheDocument();

    // Alle korte-regler-punkter rendres (antall styres av innholdet).
    const items = within(card).getAllByRole('listitem');
    expect(items).toHaveLength(MODE_GUIDE.best_ball.points.length);
  });

  it('faller tilbake til kun modus-navn for en modus uten guide-entry', () => {
    // @ts-expect-error – simulerer en legacy/ukjent game_mode i runtime.
    render(<ModeGuideCard mode="legacy_unknown_mode" />);
    const card = screen.getByTestId('mode-guide');
    expect(card.tagName).toBe('DIV');
    expect(within(card).getByText('legacy_unknown_mode')).toBeInTheDocument();
  });
});
