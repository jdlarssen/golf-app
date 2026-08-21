import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SwapMatchPlayer } from './SwapMatchPlayer';

// Type C render-test per docs/test-discipline.md — ÉN test, kun struktur:
// panelet er skjult bak knappen, og åpnet viser det begge nedtrekkene med
// valgene serveren sendte inn. Selve byttet (guards, bunt-oppløsning,
// kompensering) er dekket av lib/cup/matchSwapValidation.test.ts og
// lib/cup/actions.test.ts — server-action-en mockes bort her.
vi.mock('@/lib/cup/actions', () => ({
  swapCupMatchPlayer: vi.fn(async () => ({ error: '' })),
}));

const OUT_OPTIONS = [
  { userId: 'p1', label: 'Kari (Ørnen)' },
  { userId: 'p2', label: 'Ola (Falken)' },
];
const IN_OPTIONS = [{ userId: 'r1', label: 'Reserve Reidun' }];

describe('SwapMatchPlayer', () => {
  it('åpner byttepanelet med begge nedtrekkene fylt fra propsene', () => {
    render(
      <SwapMatchPlayer
        tournamentId="cup-1"
        gameId="g-1"
        outOptions={OUT_OPTIONS}
        inOptions={IN_OPTIONS}
      />,
    );

    // Lukket: kun åpne-knappen, ingen nedtrekk.
    expect(screen.queryByTestId('cup-swap-panel-g-1')).toBeNull();
    fireEvent.click(screen.getByTestId('cup-swap-open-g-1'));

    const outSelect = screen.getByTestId('cup-swap-out-g-1') as HTMLSelectElement;
    const inSelect = screen.getByTestId('cup-swap-in-g-1') as HTMLSelectElement;
    expect([...outSelect.options].map((o) => o.value)).toEqual(['p1', 'p2']);
    expect([...inSelect.options].map((o) => o.value)).toEqual(['r1']);
    expect(screen.getByTestId('cup-swap-submit-g-1')).toBeTruthy();
  });
});
