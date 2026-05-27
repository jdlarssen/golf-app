import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentSelector } from './IntentSelector';

// Én Type C render-test per docs/test-discipline.md — verifiserer at de fire
// intent-kortene er på plass, radiogroup-aria-mønstret er korrekt, og at
// onChange-handleren caller med ny intent ved klikk.

describe('IntentSelector', () => {
  it('rendrer 4 intent-kort med korrekt aria-checked + onChange-flyt', () => {
    const onChange = vi.fn();
    render(<IntentSelector value="klubb" onChange={onChange} />);

    expect(
      screen.getByRole('radiogroup', { name: /hva slags arrangement\?/i }),
    ).toBeInTheDocument();

    const kompis = screen.getByRole('radio', { name: /kompis-runde/i });
    const klubb = screen.getByRole('radio', { name: /klubb-turnering/i });
    const cup = screen.getByRole('radio', { name: /^cup$/i });
    const solo = screen.getByRole('radio', { name: /solo \/ test/i });

    expect(kompis.getAttribute('aria-checked')).toBe('false');
    expect(klubb.getAttribute('aria-checked')).toBe('true');
    expect(cup.getAttribute('aria-checked')).toBe('false');
    expect(solo.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(kompis);
    expect(onChange).toHaveBeenCalledWith('kompis');

    fireEvent.click(cup);
    expect(onChange).toHaveBeenLastCalledWith('cup');

    fireEvent.click(solo);
    expect(onChange).toHaveBeenLastCalledWith('solo');
  });
});
