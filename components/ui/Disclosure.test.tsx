import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Disclosure } from './Disclosure';

// Én render-test (Type C). Det som MÅ holde er form-data-trygghet: innholdet
// (inkl. skjema-felter) er i DOM selv når panelet er lukket, så et lukket
// panel ikke dropper felter ved submit. Pluss at klikk åpner panelet.
describe('Disclosure', () => {
  it('beholder children i DOM når lukket (form-trygt) og åpner ved klikk', () => {
    const { container } = render(
      <Disclosure title="Spillere" summary="8 spillere">
        <input type="hidden" name="player_0_id" value="u0" />
        <button type="button">Inni-panel-knapp</button>
      </Disclosure>,
    );

    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);

    // Lukket: skjema-feltet er fortsatt i DOM (sendes uendret ved submit).
    expect(container.querySelector('input[name="player_0_id"]')).not.toBeNull();
    // Lukket: interaktivt innhold er fortsatt spørrbart (jsdom skjuler ikke
    // lukket <details>-innhold).
    expect(
      screen.getByRole('button', { name: /inni-panel-knapp/i }),
    ).toBeInTheDocument();

    // Sammendraget vises som klikk-mål.
    expect(screen.getByText('8 spillere')).toBeInTheDocument();

    // Klikk på summary åpner panelet.
    fireEvent.click(screen.getByText('Spillere'));
    expect(details.open).toBe(true);
  });

  it('respekterer defaultOpen', () => {
    const { container } = render(
      <Disclosure title="Innstillinger" defaultOpen>
        <p>innhold</p>
      </Disclosure>,
    );
    expect(container.querySelector('details')!.open).toBe(true);
  });
});
