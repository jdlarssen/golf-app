import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PuttsChips } from './PuttsChips';

/**
 * Type-C: one render/interaction test for the putt back-fill chips (#1290 del B).
 * Locks the only non-trivial logic: chips 0–4 select directly, and «5+» expands a
 * compact stepper that stays within the 5..10 CHECK bound. No scoring numbers are
 * re-asserted (that lives in the DB CHECK + puttsStats Type-A suite).
 */

function setup(value: number | null = null) {
  const onSelect = vi.fn();
  render(<PuttsChips value={value} ariaName="Hull 9" onSelect={onSelect} />);
  return { onSelect };
}

describe('PuttsChips', () => {
  it('selects a direct chip value', () => {
    const { onSelect } = setup(null);
    fireEvent.click(screen.getByRole('button', { name: '2 putter på Hull 9' }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('«5+» expands a stepper starting at 5', () => {
    const { onSelect } = setup(null);
    fireEvent.click(screen.getByRole('button', { name: 'Fem eller flere putter på Hull 9' }));
    // Stepper now visible; incrementing goes to 6.
    fireEvent.click(screen.getByRole('button', { name: 'Flere putter på Hull 9' }));
    expect(onSelect).toHaveBeenCalledWith(6);
  });

  it('clamps the stepper at the CHECK bound of 10', () => {
    const { onSelect } = setup(10);
    expect(screen.getByRole('button', { name: 'Flere putter på Hull 9' })).toBeDisabled();
    // Decrement from 10 works (→ 9).
    fireEvent.click(screen.getByRole('button', { name: 'Færre putter på Hull 9' }));
    expect(onSelect).toHaveBeenCalledWith(9);
  });
});
