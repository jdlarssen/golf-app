import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UnconfirmedBadge } from './UnconfirmedBadge';

describe('UnconfirmedBadge', () => {
  it('renders the "Ikke bekreftet" text', () => {
    render(<UnconfirmedBadge />);
    expect(screen.getByTestId('unconfirmed-badge')).toBeDefined();
    expect(screen.getByTestId('unconfirmed-badge').textContent).toBe(
      'Ikke bekreftet',
    );
  });
});
