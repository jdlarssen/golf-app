import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnboardingNameField } from './OnboardingNameField';

// Type C — én behovs-test for demo→registrering-broen (#1173). Verifiserer
// prefill-logikken (localStorage-lesing, engangs-slett, #748-echo vinner) som
// ikke lar seg drive i preview-harnessen (kontrollert React-state). Labels
// resolves fra messages/no.json via vitest.setup-mocken.

const KEY = 'torny-demo-name';

describe('OnboardingNameField', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('prefyller feltet fra demo-navnet og fjerner nøkkelen (engangs)', () => {
    window.localStorage.setItem(KEY, 'Jørgen');
    render(<OnboardingNameField />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Jørgen');
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('lar echo-verdien (#748) vinne og rører ikke demo-navnet', () => {
    window.localStorage.setItem(KEY, 'Jørgen');
    render(<OnboardingNameField initialName="Ida" />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Ida');
    expect(window.localStorage.getItem(KEY)).toBe('Jørgen');
  });

  it('viser tomt felt når ingen demo-navn er satt', () => {
    render(<OnboardingNameField />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});
