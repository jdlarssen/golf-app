import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotFoundView } from './NotFoundView';

describe('NotFoundView', () => {
  it('renders the heading, both ways out and a hidden scene, without the bottom nav', () => {
    const { container } = render(
      <NotFoundView
        kicker="404 · Out of bounds"
        heading="Overskrift"
        body="Brødtekst"
        homeLabel="Hjem"
        homeHref="/hjem"
        findLabel="Finn"
        findHref="/finn"
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Overskrift' })).toBeInTheDocument();
    expect(screen.getByTestId('not-found-home')).toHaveAttribute('href', '/hjem');
    expect(screen.getByTestId('not-found-find')).toHaveAttribute('href', '/finn');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveAttribute('data-hides-bottom-nav');
  });
});
