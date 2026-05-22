import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LeaderboardBackdrop } from './LeaderboardBackdrop';

describe('LeaderboardBackdrop', () => {
  it('renders an aria-hidden decorative SVG container', () => {
    const { container } = render(<LeaderboardBackdrop />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    // Decorative — must not announce to screen readers.
    expect(root.getAttribute('aria-hidden')).toBe('true');
    // Anchored to the parent so it scrolls with content, not viewport.
    expect(root.className).toContain('absolute');
    // Non-interactive — leader card and rows own all the clicks.
    expect(root.className).toContain('pointer-events-none');
    // Tinted via currentColor → text-accent so dark mode tones it
    // automatically.
    expect(root.className).toContain('text-accent');
    // Carries the fairway-vinje SVG inside.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('accepts a className prop and merges it onto the wrapper', () => {
    const { container } = render(<LeaderboardBackdrop className="custom-x" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('custom-x');
  });
});
