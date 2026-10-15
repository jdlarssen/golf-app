import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TeeShotSection } from './TeeShotSection';

// One Type C render test (docs/test-discipline.md): the switch shows and hides
// the tiles, a minimum that does not fit is a disabled tile, and taps reach the
// setter. Which minimums fit, and the default, are Type A in teeShots.test.ts.
describe('TeeShotSection', () => {
  it('off shows only the switch; on shows four tiles where the ones that do not fit are disabled', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TeeShotSection mode="texas_scramble" teamSize={4} value={null} onChange={onChange} />,
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).not.toBeChecked();
    expect(screen.queryByTestId('tee-shot-min-4')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(4);

    rerender(<TeeShotSection mode="texas_scramble" teamSize={4} value={4} onChange={onChange} />);
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByTestId('tee-shot-min-4')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('tee-shot-min-3')).toBeEnabled();
    expect(screen.getByTestId('tee-shot-min-5')).toBeDisabled();
    expect(screen.getByTestId('tee-shot-min-6')).toBeDisabled();

    fireEvent.click(screen.getByTestId('tee-shot-min-3'));
    expect(onChange).toHaveBeenLastCalledWith(3);

    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith(null);

    // A pair can take all four.
    rerender(<TeeShotSection mode="ambrose" teamSize={2} value={4} onChange={onChange} />);
    expect(screen.getByTestId('tee-shot-min-6')).toBeEnabled();
  });
});
