import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PublicLandingView } from './PublicLandingView';

// One render test for the public signup landing (#1022) — data injected as
// props into the presentational view, asserting on data-testid/href only,
// never Norwegian copy (Type C discipline). Visibility gating lives in
// `isPubliclyViewable` (Type A) and the page owns all fetching.

describe('PublicLandingView (#1022, #2266)', () => {
  it('renders the public invitation card with roster names and the join CTA inside', () => {
    render(
      <PublicLandingView
        gameName="Fredagsfyken på Fana"
        gameMode="stableford"
        modeConfig={{ kind: 'stableford', team_size: 1, points_table: 'standard' }}
        courseName="Fana GK"
        teeName="Gul"
        teeOffAt="2026-05-08T12:30:00Z"
        roster={{ count: 14, names: ['Kari H.', 'Ola N.'], overflow: 12 }}
        joinHref="/login?next=%2Fsignup%2Fabc123xy%3Fsrc%3Dpublic"
        posterHref="/signup/abc123xy/plakat"
        entryFeeKr={0}
        paymentLink={null}
      />,
    );

    expect(screen.getByTestId('public-landing')).toBeInTheDocument();
    const card = screen.getByTestId('invitation-card');
    expect(card).toHaveAttribute('data-variant', 'public');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Fredagsfyken på Fana',
    );
    // The count lives on the card; the names and the CTA sit inside it.
    expect(within(card).getByTestId('social-proof-line')).toHaveTextContent('14');

    const roster = within(card).getByTestId('public-landing-roster');
    expect(roster).toHaveTextContent('Ola N.');
    expect(roster).toHaveTextContent('12');

    expect(within(card).getByTestId('public-landing-join')).toHaveAttribute(
      'href',
      expect.stringContaining('/login?next='),
    );
    expect(card).not.toContainElement(
      screen.getByTestId('public-landing-poster-link'),
    );
  });
});
