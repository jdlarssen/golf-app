import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WithdrawnBanner } from './HoleNotices';

// Type C render-test (#2358): the hole page's withdrawn banner links to «Angre»
// only for a player who withdrew themself. One the organiser set is theirs to
// undo; game home has no button for it, and the server refuses it.

describe('WithdrawnBanner (hull-siden)', () => {
  it('#2752: et format der trekket ikke kan angres, har ingen lenke dit', () => {
    render(<WithdrawnBanner withdrawn selfWithdrawn canUndo={false} gameId="g1" />);
    expect(screen.getByTestId('withdrawn-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('withdrawn-undo-link')).toBeNull();
  });

  it.each([
    [true, 1],
    [false, 0],
  ])('selfWithdrawn=%s → %i angre-lenke', (selfWithdrawn, links) => {
    render(<WithdrawnBanner withdrawn selfWithdrawn={selfWithdrawn} canUndo gameId="g1" />);

    expect(screen.getByTestId('withdrawn-banner')).toBeInTheDocument();
    expect(screen.queryAllByTestId('withdrawn-undo-link')).toHaveLength(links);
  });
});
