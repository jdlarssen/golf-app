import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameHistoryRow } from './GameHistoryRow';

// Type C — én render-test for den kompakte runde-raden (#962). Verifiserer
// strukturen (hele raden er en lenke til resultatlista, brutto vises som
// hero-tall, dato/bane/format/utfall/netto er til stede, «—» uten scorer).
// All i18n/formatering skjer på kallstedet og sendes inn som strenger.
describe('GameHistoryRow', () => {
  it('renders a tappable row to the leaderboard with brutto as hero, and — without scores', () => {
    const { rerender } = render(
      <GameHistoryRow
        href="/games/g1/leaderboard?from=/profile/historikk"
        dateLabel="21. jun"
        courseName="Byneset North"
        formatLabel="Stableford"
        resultText="🥇 Du vant"
        resultIsWin
        brutto={98}
        nettoLabel="77 netto"
      />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('/games/g1/leaderboard'),
    );
    expect(link).toHaveTextContent('21. jun');
    expect(link).toHaveTextContent('Byneset North · Stableford');
    expect(link).toHaveTextContent('Du vant');
    expect(link).toHaveTextContent('98');
    expect(link).toHaveTextContent('77 netto');

    // No-score round → brutto renders as «—», netto line omitted.
    rerender(
      <GameHistoryRow
        href="/games/g2/leaderboard?from=/profile/historikk"
        dateLabel="20. mai"
        courseName="Byneset North"
        formatLabel="Foursomes matchplay"
        resultText="Uavgjort"
        resultIsWin={false}
        brutto={null}
        nettoLabel={null}
      />,
    );
    expect(screen.getByRole('link')).toHaveTextContent('—');
  });
});
