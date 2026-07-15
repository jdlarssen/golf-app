/**
 * #1052 — logo-bevisst sponsor-stripe (Type C, én render-test).
 *
 * Låser visningsregelen fra kontrakten: logo-slott vises som bilde (navn =
 * alt-tekst, dedup på path), navn-only-slott beholder tekst-oppramsingen, og
 * et navn som alt står med logo gjentas ikke i tekstlinja. Tall-assertions om
 * parsing bor i Type A (prizes.test.ts) — her testes kun render-grenen.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SponsorStrip } from './SponsorStrip';
import type { GamePrize } from '@/lib/games/prizes';

function prize(overrides: Partial<GamePrize>): GamePrize {
  return {
    category: 'placement',
    position: 1,
    description: 'Premie',
    sponsor: null,
    sponsorLogoPath: null,
    ...overrides,
  };
}

describe('SponsorStrip', () => {
  it('viser logo-slott som bilde (dedup på path) og navn-only som tekst', () => {
    render(
      <SponsorStrip
        prizes={[
          prize({
            position: 1,
            sponsor: 'Klubbshoppen',
            sponsorLogoPath: 'uid/logo-a.webp',
          }),
          // Samme logo på et annet slott → skal ikke dupliseres.
          prize({
            position: 2,
            sponsor: 'Klubbshoppen',
            sponsorLogoPath: 'uid/logo-a.webp',
          }),
          prize({ position: 3, sponsor: 'Baren' }),
        ]}
      />,
    );

    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('alt', 'Klubbshoppen');
    // Navn-only-sponsoren står i teksten; logo-sponsoren gjentas ikke der.
    const text = screen.getByTestId('sponsor-strip').textContent ?? '';
    expect(text).toContain('Baren');
    expect(text).not.toContain('Klubbshoppen');
  });

  it('returnerer null uten sponsorer og logoer', () => {
    const { container } = render(
      <SponsorStrip prizes={[prize({ position: 1 })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
