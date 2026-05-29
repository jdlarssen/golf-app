import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoundRobinBadge } from './RoundRobinBadge';
import type { RoundRobinConstellationPlayer } from '@/lib/scoring/modes/roundRobin';

// Type C render test — maks ÉN render-test per komponent (jfr. docs/test-discipline.md).
// Asserterer korrekt segment, partner og motstandere for et gitt hull/slot,
// og at ingenting rendres ved ugyldig myUserId.

const PLAYERS: RoundRobinConstellationPlayer[] = [
  { userId: 'u1', teamNumber: 1, name: 'Arne' },
  { userId: 'u2', teamNumber: 2, name: 'Bjørn' },
  { userId: 'u3', teamNumber: 3, name: 'Kari' },
  { userId: 'u4', teamNumber: 4, name: 'Ola' },
];

describe('RoundRobinBadge', () => {
  it('viser riktig segment, partner og motstandere — og rendrer ingenting ved ukjent spiller', () => {
    // Seg1 hull 1 sett fra u1 (slot 1): partner = slot2 = Bjørn, motstandere slot3+4 = Kari+Ola
    const { rerender } = render(
      <RoundRobinBadge holeNumber={1} players={PLAYERS} myUserId="u1" />,
    );
    const badge = screen.getByTestId('round-robin-badge');
    expect(badge.textContent).toContain('Segment 1/3');
    expect(badge.textContent).toContain('Bjørn');
    expect(badge.textContent).toContain('Kari');
    expect(badge.textContent).toContain('Ola');

    // Seg2 hull 8 sett fra u2 (slot 2): partner = slot4 = Ola, motstandere slot1+3 = Arne+Kari
    rerender(<RoundRobinBadge holeNumber={8} players={PLAYERS} myUserId="u2" />);
    expect(screen.getByTestId('round-robin-badge').textContent).toContain('Segment 2/3');
    expect(screen.getByTestId('round-robin-badge').textContent).toContain('Ola');

    // Seg3 hull 13 sett fra u3 (slot 3): partner = slot2 = Bjørn, motstandere slot1+4 = Arne+Ola
    rerender(<RoundRobinBadge holeNumber={13} players={PLAYERS} myUserId="u3" />);
    expect(screen.getByTestId('round-robin-badge').textContent).toContain('Segment 3/3');
    expect(screen.getByTestId('round-robin-badge').textContent).toContain('Bjørn');

    // Ukjent spiller → null render
    rerender(<RoundRobinBadge holeNumber={1} players={PLAYERS} myUserId="ukjent" />);
    expect(screen.queryByTestId('round-robin-badge')).not.toBeInTheDocument();
  });
});
