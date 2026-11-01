import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Type C render-test (#2358): the undo form is there only for a player who
// withdrew themself. The server refuses the other case (withdrawn_by_other);
// the banner must not offer a button that always fails.

vi.mock('../trekk-fra/actions', () => ({ submitUndoWithdraw: vi.fn() }));

import { WithdrawnBanner } from './WithdrawnBanner';

describe('WithdrawnBanner', () => {
  it('#2752: a format without withdrawal hides the form, and does not promise an undo', async () => {
    render(await WithdrawnBanner({ gameId: 'g1', selfWithdrawn: true, canUndo: false }));

    expect(screen.queryByTestId('undo-withdraw-submit')).toBeNull();
    const text = screen.getByTestId('withdrawn-banner').textContent;
    expect(text).toMatch(/Du har trukket deg/);
    expect(text).not.toMatch(/angre/i);
  });

  it.each([
    [true, 'shows the undo form'],
    [false, 'hides the undo form and says the organiser withdrew them'],
  ])('selfWithdrawn=%s %s', async (selfWithdrawn) => {
    render(await WithdrawnBanner({ gameId: 'g1', selfWithdrawn, canUndo: true }));

    expect(screen.getByTestId('withdrawn-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('undo-withdraw-submit') !== null).toBe(selfWithdrawn);
    expect(screen.getByTestId('withdrawn-banner').textContent).toMatch(
      selfWithdrawn ? /Du har trukket deg/ : /Arrangøren har trukket deg/,
    );
  });
});
