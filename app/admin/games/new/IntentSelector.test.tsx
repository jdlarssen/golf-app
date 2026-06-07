import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentSelector } from './IntentSelector';

// Type C render-tester per docs/test-discipline.md — verifiserer intent-kortene,
// radiogroup-aria-mønstret, onChange-flyten, og #477-gatingen av «Solo / Test».

describe('IntentSelector', () => {
  it('admin ser alle fire intent-kort med korrekt aria-checked + onChange', () => {
    const onChange = vi.fn();
    render(<IntentSelector value="klubb" onChange={onChange} isAdmin />);

    expect(
      screen.getByRole('radiogroup', { name: /hva slags arrangement\?/i }),
    ).toBeInTheDocument();

    const kompis = screen.getByRole('radio', { name: /kompis-runde/i });
    const klubb = screen.getByRole('radio', { name: /klubb-turnering/i });
    const cup = screen.getByRole('radio', { name: /^cup$/i });
    const solo = screen.getByRole('radio', { name: /solo \/ test/i });

    expect(klubb.getAttribute('aria-checked')).toBe('true');
    expect(kompis.getAttribute('aria-checked')).toBe('false');
    expect(cup.getAttribute('aria-checked')).toBe('false');
    expect(solo.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(kompis);
    expect(onChange).toHaveBeenCalledWith('kompis');
    fireEvent.click(solo);
    expect(onChange).toHaveBeenLastCalledWith('solo');
  });

  it('#477: ikke-admin ser ikke «Solo / Test»', () => {
    render(<IntentSelector value="kompis" onChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /kompis-runde/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^cup$/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /solo \/ test/i }),
    ).not.toBeInTheDocument();
  });

  it('#477: et eksisterende solo-spill viser fortsatt kortet i edit-flyten', () => {
    // Selv uten admin må kortet vises når intent-en allerede ER solo, ellers
    // forsvinner det valgte arrangementet fra UI-en ved redigering.
    render(<IntentSelector value="solo" onChange={vi.fn()} disabled />);

    expect(
      screen.getByRole('radio', { name: /solo \/ test/i }),
    ).toBeInTheDocument();
  });
});
