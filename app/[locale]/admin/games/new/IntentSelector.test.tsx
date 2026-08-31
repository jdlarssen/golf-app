import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentSelector } from './IntentSelector';

// Type C render-tester per docs/test-discipline.md — verifiserer intent-kortene,
// knappe-semantikken (#1794: radio → button, valgt flis via aria-current),
// onChange-flyten, #477-gatingen av «Solo / Test», og #525-gatingen av
// «Klubb-turnering» (admin + klubb-admin).

describe('IntentSelector', () => {
  it('admin ser alle fire intent-kort med korrekt aria-current + onChange', () => {
    const onChange = vi.fn();
    render(<IntentSelector value="klubb" onChange={onChange} isAdmin />);

    // #1794: gruppen kommer fra fieldset + legend, ikke fra en radiogroup —
    // flisene utfører en handling (velg + gå videre), de setter ikke en
    // innstilling.
    expect(
      screen.getByRole('group', { name: /hva slags arrangement\?/i }),
    ).toBeInTheDocument();

    const kompis = screen.getByRole('button', { name: /kompis-runde/i });
    const klubb = screen.getByRole('button', { name: /klubb-turnering/i });
    const cup = screen.getByRole('button', { name: /^cup$/i });
    const solo = screen.getByRole('button', { name: /solo \/ test/i });

    expect(klubb.getAttribute('aria-current')).toBe('true');
    expect(kompis.getAttribute('aria-current')).toBeNull();
    expect(cup.getAttribute('aria-current')).toBeNull();
    expect(solo.getAttribute('aria-current')).toBeNull();
    // Ingen radio-rester: assistive tech skal ikke love et valg som ikke
    // bytter kontekst (WCAG 3.2.2).
    expect(screen.queryAllByRole('radio')).toHaveLength(0);

    fireEvent.click(kompis);
    expect(onChange).toHaveBeenCalledWith('kompis');
    fireEvent.click(solo);
    expect(onChange).toHaveBeenLastCalledWith('solo');
  });

  it('#477: ikke-admin ser ikke «Solo / Test»', () => {
    render(<IntentSelector value="kompis" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /kompis-runde/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cup$/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /solo \/ test/i }),
    ).not.toBeInTheDocument();
  });

  it('#477: et eksisterende solo-spill viser fortsatt kortet i edit-flyten', () => {
    // Selv uten admin må kortet vises når intent-en allerede ER solo, ellers
    // forsvinner det valgte arrangementet fra UI-en ved redigering.
    render(<IntentSelector value="solo" onChange={vi.fn()} disabled />);

    expect(
      screen.getByRole('button', { name: /solo \/ test/i }),
    ).toBeInTheDocument();
  });

  it('#525: vanlig bruker (verken admin eller klubb-admin) ser bare Kompis + Cup', () => {
    render(<IntentSelector value="kompis" onChange={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: /kompis-runde/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cup$/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /klubb-turnering/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /solo \/ test/i }),
    ).not.toBeInTheDocument();
  });

  it('#525: klubb-admin ser «Klubb-turnering» uten å være global admin', () => {
    render(<IntentSelector value="kompis" onChange={vi.fn()} isClubAdmin />);

    expect(
      screen.getByRole('button', { name: /klubb-turnering/i }),
    ).toBeInTheDocument();
    // Klubb-admin er ikke global admin → «Solo / Test» er fortsatt skjult.
    expect(
      screen.queryByRole('button', { name: /solo \/ test/i }),
    ).not.toBeInTheDocument();
  });

  it('#525: et eksisterende klubb-spill viser fortsatt kortet i edit-flyten', () => {
    // Selv uten admin/klubb-admin må kortet vises når intent-en allerede ER
    // klubb, ellers forsvinner det valgte arrangementet ved redigering.
    render(<IntentSelector value="klubb" onChange={vi.fn()} disabled />);

    expect(
      screen.getByRole('button', { name: /klubb-turnering/i }),
    ).toBeInTheDocument();
  });
});
