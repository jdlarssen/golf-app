import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KavalkadeHomeNudge } from './KavalkadeHomeNudge';

/**
 * Forsidens kavalkade-banner (#2131). Den ene regelen som betyr noe her: før
 * 24. desember er siden stengt, så teaseren skal ikke ha noen lenke — en lenke
 * inn i «kommer 24. desember» er en blindvei.
 */
describe('KavalkadeHomeNudge', () => {
  it('teaser: ingen lenke ut av banneret', () => {
    render(<KavalkadeHomeNudge slot="teaser" year={2026} />);

    expect(screen.getByTestId('kavalkade-home-nudge')).toHaveAttribute(
      'data-slot',
      'teaser',
    );
    expect(
      screen.queryByTestId('kavalkade-home-nudge-cta'),
    ).not.toBeInTheDocument();
  });

  it('lenke: knappen peker inn i årets kavalkade', () => {
    render(<KavalkadeHomeNudge slot="link" year={2026} />);

    expect(screen.getByTestId('kavalkade-home-nudge')).toHaveAttribute(
      'data-slot',
      'link',
    );
    expect(screen.getByTestId('kavalkade-home-nudge-cta')).toHaveAttribute(
      'href',
      '/kavalkade/2026',
    );
  });
});
