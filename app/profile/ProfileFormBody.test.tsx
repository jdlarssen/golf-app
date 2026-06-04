import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProfileFormBody } from './ProfileFormBody';

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

const baseInitial = {
  name: 'Per Hansen',
  nickname: 'Per',
  hcpIndex: '12.4',
  gender: 'mens' as 'mens' | 'ladies' | null,
  level: 'normal' as const,
};

function renderForm(overrides: Partial<typeof baseInitial> = {}) {
  return render(
    <ProfileFormBody
      email="per@example.com"
      initial={{ ...baseInitial, ...overrides }}
      action={() => undefined}
    />,
  );
}

describe('ProfileFormBody — dirty / Lagre', () => {
  it('Lagre er deaktivert til noe endres, aktiveres ved navne-endring', () => {
    renderForm();
    const saveBtn = screen.getByRole('button', { name: 'Lagre' });
    expect(saveBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Navn'), {
      target: { value: 'Per Hansen Jr' },
    });
    expect(saveBtn).not.toBeDisabled();
  });
});

describe('ProfileFormBody — Golfprofil-disclosure', () => {
  it('er kollapset som standard når kjønn alt er satt', () => {
    renderForm();
    const toggle = screen.getByRole('button', { name: /golfprofil/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('er åpen som standard når kjønn ikke er satt (gender-soft-prompt)', () => {
    renderForm({ gender: null });
    expect(
      screen.getByRole('button', { name: /golfprofil/i }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('kjønn rendres som segmenterte radio-knapper med valgt verdi', () => {
    renderForm(); // gender: 'mens'
    expect(screen.getByRole('radio', { name: 'Herre' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dame' })).not.toBeChecked();
  });
});

describe('ProfileFormBody — plusshandicap-chip', () => {
  it('toggler plusshandicap og viser «Lagres som +»-bekreftelse', () => {
    renderForm({ hcpIndex: '1.5' });
    const saveBtn = screen.getByRole('button', { name: 'Lagre' });
    expect(saveBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Plusshandicap' }));

    expect(screen.getByText('+1,5')).toBeInTheDocument();
    expect(screen.getByText(/plusshandicap/i)).toBeInTheDocument();
    expect(saveBtn).not.toBeDisabled();
  });

  it('lagret negativ hcp lastes som chip på + positiv magnitude', () => {
    renderForm({ hcpIndex: '-1.5' });
    expect(
      screen.getByRole('button', { name: 'Plusshandicap' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Handicap')).toHaveValue(1.5);
  });
});
