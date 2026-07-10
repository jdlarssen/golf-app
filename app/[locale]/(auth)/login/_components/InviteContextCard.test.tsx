import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InviteContextCard } from './InviteContextCard';

// One render test for the login invite-context card (#1169) — data injected
// as props into the presentational component, asserting on data-testid and
// prop values only, never Norwegian copy (Type C discipline). Validity
// gating lives in `getInviteLoginContext` (fail-closed) and the page owns
// all fetching/formatting. The props-set IS the field whitelist: the card
// has no roster/prize/email/handicap props, so it can never leak them.

describe('InviteContextCard (#1169)', () => {
  it('renders inviter, game name, mode, course and tee-off from props', () => {
    render(
      <InviteContextCard
        inviterName="Jørgen"
        gameName="Fredagsfyken på Fana"
        modeLabel="Stableford"
        courseName="Fana GK"
        teeOff="8. mai 2026, 14:30"
      />,
    );

    const card = screen.getByTestId('invite-context-card');
    expect(card).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Fredagsfyken på Fana',
    );
    expect(card).toHaveTextContent('Jørgen');
    expect(card).toHaveTextContent('Stableford');
    expect(card).toHaveTextContent('Fana GK');
    expect(card).toHaveTextContent('8. mai 2026, 14:30');
  });
});
