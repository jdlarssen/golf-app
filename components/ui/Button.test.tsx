import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button pending-tilstand', () => {
  it('viser children og er ikke disabled når ikke pending', () => {
    render(<Button>Lagre</Button>);
    const btn = screen.getByRole('button', { name: 'Lagre' });
    expect(btn).not.toBeDisabled();
    expect(btn).not.toHaveAttribute('aria-busy');
  });

  it('er disabled og aria-busy når pending, og navnet er kun pendingLabel', () => {
    render(<Button pending pendingLabel="Lagrer …">Lagre</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveTextContent('Lagrer …');
    // The spinner is decorative and must not leak into the button's name.
    expect(btn).toHaveAccessibleName('Lagrer …');
  });
});
