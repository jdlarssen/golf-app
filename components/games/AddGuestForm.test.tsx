import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddGuestForm } from './AddGuestForm';

/**
 * Type C render-test (én per komponent, #1009): gjeste-skjemaet monterer med
 * navn-/hcp-/tee-feltene `parseGuestProfile` forventer, og next-intl-katalogen
 * har nøklene. Valideringsreglene testes i lib/games/createGuestPlayer.test.ts
 * (Type A) — her verifiseres kun struktur via testid/feltnavn, aldri norsk copy.
 */
describe('AddGuestForm', () => {
  it('monterer skjemaet med guest_name/guest_hcp/guest_tee-feltene', () => {
    const { getByTestId, container } = render(
      <AddGuestForm action={vi.fn(async () => {})} />,
    );

    const form = getByTestId('add-guest-form');
    expect(form).toBeTruthy();
    expect(container.querySelector('input[name="guest_name"]')).toBeTruthy();
    expect(container.querySelector('input[name="guest_hcp"]')).toBeTruthy();
    const tee = container.querySelector('select[name="guest_tee"]');
    expect(tee).toBeTruthy();
    const values = Array.from(tee!.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(values).toEqual(['M', 'D', 'J']);
  });
});
