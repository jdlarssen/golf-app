import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button pending-tilstand', () => {
  it('viser children og er ikke disabled når ikke pending', () => {
    render(<Button>Lagre</Button>);
    const btn = screen.getByRole('button', { name: 'Lagre' });
    expect(btn).not.toBeDisabled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('er disabled, viser pendingLabel og en spinner når pending', () => {
    render(<Button pending pendingLabel="Lagrer …">Lagre</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveTextContent('Lagrer …');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
