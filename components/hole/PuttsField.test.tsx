import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PuttsField, type PuttsFieldProps } from './PuttsField';

/**
 * Type-C: ett render-/interaksjons-test for putts-stepperen (#939). Låser
 * kant-logikken som er det eneste ikke-trivielle her: «—» → 1, − ved 0 nullstiller,
 * og clamp ved CHECK-grensen 10. Ingen scoring-tall re-asserteres.
 */

const base: PuttsFieldProps = {
  playerId: 'p1',
  name: 'Alice',
  putts: null,
  onSetPutts: vi.fn(),
};

function setup(overrides: Partial<PuttsFieldProps> = {}) {
  const onSetPutts = vi.fn();
  render(<PuttsField {...base} onSetPutts={onSetPutts} {...overrides} />);
  const inc = screen.getByRole('button', { name: 'Flere putter for Alice' });
  const dec = screen.getByRole('button', { name: 'Færre putter for Alice' });
  const value = screen.getByTestId('putts-value');
  return { onSetPutts, inc, dec, value };
}

describe('PuttsField', () => {
  it('shows «—» and disables decrement when nothing is recorded', () => {
    const { dec, value } = setup({ putts: null });
    expect(value.textContent).toBe('—');
    expect(dec).toBeDisabled();
  });

  it('first + records 1 putt from the unrecorded state', () => {
    const { inc, onSetPutts } = setup({ putts: null });
    fireEvent.click(inc);
    expect(onSetPutts).toHaveBeenCalledWith('p1', 1);
  });

  it('increments within range', () => {
    const { inc, onSetPutts } = setup({ putts: 2 });
    fireEvent.click(inc);
    expect(onSetPutts).toHaveBeenCalledWith('p1', 3);
  });

  it('− at 0 clears back to unrecorded (null)', () => {
    const { dec, onSetPutts } = setup({ putts: 0 });
    fireEvent.click(dec);
    expect(onSetPutts).toHaveBeenCalledWith('p1', null);
  });

  it('+ is capped at the CHECK bound (10)', () => {
    const { inc, onSetPutts } = setup({ putts: 10 });
    expect(inc).toBeDisabled();
    fireEvent.click(inc);
    expect(onSetPutts).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const { inc, onSetPutts } = setup({ putts: 2, disabled: true });
    fireEvent.click(inc);
    expect(onSetPutts).not.toHaveBeenCalled();
  });
});
