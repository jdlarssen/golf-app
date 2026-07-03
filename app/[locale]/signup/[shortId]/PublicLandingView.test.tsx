import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicLandingView } from './PublicLandingView';

// One render test for the public signup landing (#1022) — data injected as
// props into the presentational view, asserting on data-testid/href only,
// never Norwegian copy (Type C discipline). Visibility gating lives in
// `isPubliclyViewable` (Type A) and the page owns all fetching.

describe('PublicLandingView (#1022)', () => {
  it('renders game info, roster names and the join CTA with the login href', () => {
    render(
      <PublicLandingView
        gameName="Fredagsfyken på Fana"
        modeLabel="Stableford"
        courseName="Fana GK"
        teeOff="8. mai 2026, 14:30"
        roster={{ count: 14, names: ['Kari H.', 'Ola N.'], overflow: 12 }}
        joinHref="/login?next=%2Fsignup%2Fabc123xy%3Fsrc%3Dpublic"
        posterHref="/signup/abc123xy/plakat"
      />,
    );

    expect(screen.getByTestId('public-landing')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Fredagsfyken på Fana',
    );

    const roster = screen.getByTestId('public-landing-roster');
    expect(roster).toHaveTextContent('14');
    expect(roster).toHaveTextContent('Ola N.');
    expect(roster).toHaveTextContent('12');

    expect(screen.getByTestId('public-landing-join')).toHaveAttribute(
      'href',
      expect.stringContaining('/login?next='),
    );
  });
});
