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
  it('renders inviter, game name, mode, course, tee-off, expiry and join count', () => {
    render(
      <InviteContextCard
        inviterName="Jørgen"
        gameName="Fredagsfyken på Fana"
        modeLabel="Stableford"
        courseName="Fana GK"
        teeOff="8. mai 2026, 14:30"
        expiresLine="Invitasjonen din utløper om 3 dager"
        joinedCount={5}
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
    // #1179: the pre-formatted expiry line is rendered when provided; `null`
    // (the field-whitelist default) renders nothing — the presence toggle is
    // the only card-owned logic worth asserting here.
    expect(screen.getByTestId('invite-expiry')).toHaveTextContent(
      'Invitasjonen din utløper om 3 dager',
    );
    // #1193: the aggregate join count renders (the number is interpolated, not
    // copy). The anon card can only ever show a count — never friend names.
    expect(screen.getByTestId('social-proof-line')).toHaveTextContent('5');
  });
});
