import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Type C render-test per docs/test-discipline.md — ÉN test, kun struktur:
 * begge svarene må være ett trykk unna så lenge ingen har valgt. Med bare
 * veksleknappen sendte panelet alltid `play_on=1` fra venter-tilstanden, så
 * «Ett valg venter»-banneret kunne ikke besvares med regelen (#1814, E4).
 * Selve skrivingen er dekket av lib/cup/withdrawalActions.test.ts.
 */
vi.mock('@/lib/cup/withdrawalActions', () => ({
  setFourballWithdrawalChoice: vi.fn(async () => ({ error: '' })),
}));

import { FourballPlayOnPanel } from './FourballPlayOnPanel';

function playOnValues(): string[] {
  return [...document.querySelectorAll('input[name="play_on"]')].map(
    (el) => (el as HTMLInputElement).value,
  );
}

describe('FourballPlayOnPanel (#1814)', () => {
  it.each([
    ['valget venter', { choicePending: true, playOn: false }, ['1', '0']],
    ['alene-valget er tatt', { choicePending: false, playOn: true }, ['0']],
    ['regelen er valgt', { choicePending: false, playOn: false }, ['1']],
  ] as const)('%s → sender %s', (_name, props, expected) => {
    render(
      <FourballPlayOnPanel
        tournamentId="cup-1"
        gameId="g-1"
        partnerName="Kari"
        {...props}
      />,
    );

    expect(playOnValues()).toEqual(expected);
    if (props.choicePending) {
      expect(screen.getByTestId('cup-playon-yes-g-1')).toBeTruthy();
      expect(screen.getByTestId('cup-playon-no-g-1')).toBeTruthy();
      expect(screen.queryByTestId('cup-playon-toggle-g-1')).toBeNull();
    } else {
      expect(screen.getByTestId('cup-playon-toggle-g-1')).toBeTruthy();
    }
  });
});
