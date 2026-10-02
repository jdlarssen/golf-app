import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingLiveBoard } from './LandingLiveBoard';

// jsdom has no matchMedia; the card asks it for reduced motion on mount.
// File-wide (Vitest isolates files): the effect may run after the test.
vi.stubGlobal('matchMedia', () => ({ matches: false }));

/**
 * Type C (#2261): ONE render test, structure only. The frames and the timer
 * are Type A in landingLiveBoardFrames.test.ts; the playback on staging.
 */
describe('LandingLiveBoard', () => {
  it('is a figure with a screen-reader caption and a hidden three-row board', () => {
    render(
      <LandingLiveBoard
        kickers={['k11', 'k12', 'k13']}
        live="LIVE"
        pointsSuffix=" p"
        caption="caption-text"
      />,
    );

    const figure = screen.getByRole('figure');
    const caption = figure.querySelector('figcaption');
    expect(caption).toHaveTextContent('caption-text');
    expect(caption).toHaveClass('sr-only');

    const visual = figure.querySelector('[aria-hidden="true"]');
    expect(visual).not.toBeNull();
    expect(
      visual!.querySelectorAll('[data-testid="landing-live-board-row"]'),
    ).toHaveLength(3);
  });
});
