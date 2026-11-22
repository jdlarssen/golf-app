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

const IDLE = async () => ({ error: null });

function renderForm(
  overrides: Partial<typeof baseInitial> = {},
  props: Partial<Pick<Parameters<typeof ProfileFormBody>[0], 'action' | 'stale'>> = {},
) {
  return render(
    <ProfileFormBody
      email="per@example.com"
      initial={{ ...baseInitial, ...overrides }}
      action={IDLE}
      {...props}
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

describe('ProfileFormBody — a stale handicap can be confirmed (audit 2026-11-20)', () => {
  it('offers «Handicapet stemmer» on an unchanged form when the handicap is stale', () => {
    renderForm({}, { stale: true });
    const confirm = screen.getByRole('button', { name: 'Handicapet stemmer' });
    expect(confirm).not.toBeDisabled();
    expect(screen.queryByText('Lagre blir aktiv når du endrer noe.')).toBeNull();
  });

  it('goes back to «Lagre» once something changes', () => {
    renderForm({}, { stale: true });
    fireEvent.change(screen.getByLabelText('Navn'), { target: { value: 'Per H' } });
    expect(screen.getByRole('button', { name: 'Lagre' })).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Handicapet stemmer' })).toBeNull();
  });

  it('keeps «Lagre» grey when the handicap is fresh, or empty and stale', () => {
    renderForm({}, { stale: false });
    expect(screen.getByRole('button', { name: 'Lagre' })).toBeDisabled();
    cleanup();
    renderForm({ hcpIndex: '' }, { stale: true });
    expect(screen.getByRole('button', { name: 'Lagre' })).toBeDisabled();
  });
});

describe('ProfileFormBody — a refused save keeps the typed values (audit 2026-11-20)', () => {
  it('shows the refusal and leaves name and handicap as typed', async () => {
    const action = vi.fn(async () => ({ error: 'hcp_invalid' as const }));
    renderForm({}, { action });
    fireEvent.change(screen.getByLabelText('Navn'), { target: { value: 'Per Ny' } });
    fireEvent.change(screen.getByLabelText('Handicap'), { target: { value: '60' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Lagre' }).closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Handicapindeks må være et tall mellom 0 og 54.',
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Navn')).toHaveValue('Per Ny');
    expect(screen.getByLabelText('Handicap')).toHaveValue(60);
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
