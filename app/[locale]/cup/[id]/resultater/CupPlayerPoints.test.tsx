import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CupPlayerPoints, type CupPlayerPointsGroup } from './CupPlayerPoints';

// Type C render-test per docs/test-discipline.md — ÉN test som verifiserer den
// strukturelle visningen: seksjonen finnes, rader rendres i den rekkefølgen de
// kommer inn, egen-raden er merket, og en kontribusjons-etikett bygges. Tallene
// (aggregering/sortering) er dekket av lib/cup/computeCupPlayerPoints.test.ts og
// re-asserteres IKKE her.

const GROUPS: CupPlayerPointsGroup[] = [
  {
    team: 1,
    teamName: 'Lag Skog',
    rows: [
      {
        userId: 'p1',
        displayName: 'Per',
        team: 1,
        points: 1.5,
        contributions: [
          { type: 'match', gameId: 'g1', matchLabel: 'Singles 1', opponentLabel: 'Knut', outcome: 'won', points: 1 },
          { type: 'ctp', holeNumber: 7, points: 0.5 },
        ],
      },
      { userId: 'p2', displayName: 'Pål', team: 1, points: 0, contributions: [] },
    ],
  },
  {
    team: 2,
    teamName: 'Lag Sjø',
    rows: [{ userId: 'k1', displayName: 'Knut', team: 2, points: 0, contributions: [] }],
  },
];

describe('CupPlayerPoints', () => {
  it('rendrer seksjon, rader i input-rekkefølge, merket egen-rad og kontribusjons-etikett', () => {
    render(<CupPlayerPoints groups={GROUPS} currentUserId="p1" />);

    // Seksjonen finnes, begge lag rendres.
    expect(screen.getByTestId('cup-player-points')).toBeInTheDocument();
    expect(screen.getByText('Lag Skog')).toBeInTheDocument();
    expect(screen.getByText('Lag Sjø')).toBeInTheDocument();

    // Radene rendres i rekkefølgen de kommer inn (komponenten sorterer ikke).
    const rows = screen.getAllByTestId('cup-player-row');
    expect(rows.map((r) => r.getAttribute('data-userid'))).toEqual(['p1', 'p2', 'k1']);

    // Egen-raden er merket (data-testid + «Dine poeng»).
    const me = screen.getByTestId('cup-player-points-me');
    expect(within(me).getByText('Per')).toBeInTheDocument();
    expect(within(me).getByText('Dine poeng')).toBeInTheDocument();

    // Kontribusjons-etikett bygges fra kamp-bidraget (utbrettet innhold er
    // alltid i DOM med native <details>).
    expect(within(me).getByText('Vant mot Knut · +1')).toBeInTheDocument();
    expect(within(me).getByText('Nærmest hullet, hull 7 · +0,5')).toBeInTheDocument();

    // En rad uten bidrag rendres uten <details> (ingen tom utbrett).
    const emptyRow = rows.find((r) => r.getAttribute('data-userid') === 'p2')!;
    expect(within(emptyRow).queryByRole('group')).not.toBeInTheDocument();
  });
});
