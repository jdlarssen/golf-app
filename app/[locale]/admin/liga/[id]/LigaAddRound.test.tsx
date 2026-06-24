import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// #924: the server guard's no-insert + error-code behavior is unit-tested in
// lib/league/actions.test.ts. This closes the other end of the chain — that the
// `round_in_past` code is RECOGNIZED by the form and renders the real Norwegian
// message (not the generic `errors.fallback`). The action is mocked to return
// the code; vitest.setup resolves t() against the real messages/no.json, so a
// fallback would surface a different string and fail this assertion.
vi.mock('@/lib/league/actions', () => ({
  addLeagueRound: vi.fn(async () => ({ error: 'round_in_past' })),
}));

import { LigaAddRound } from './LigaAddRound';

describe('LigaAddRound — #924 round_in_past message', () => {
  it('renders the past-window message when the action returns round_in_past', async () => {
    render(<LigaAddRound leagueId="l1" />);
    fireEvent.submit(document.querySelector('form')!);
    expect(
      await screen.findByText(
        'Fristen har allerede gått ut. Velg en som ligger fram i tid.',
      ),
    ).toBeInTheDocument();
    // Not the generic fallback (proves the code is recognized, not unmatched).
    expect(screen.queryByText('Noe gikk galt.')).not.toBeInTheDocument();
  });
});
