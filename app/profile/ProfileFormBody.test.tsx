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
  productUpdatesOptIn: true,
  gender: 'mens' as const,
  level: 'normal' as const,
};

/** Folder ut «Flere innstillinger» der kjønn/klasse/månedsbrev nå bor. */
function openMoreSettings() {
  fireEvent.click(screen.getByRole('button', { name: /flere innstillinger/i }));
}

describe('ProfileFormBody — Mail-innstillinger toggle', () => {
  it('rendrer toggle som checked når initial.productUpdatesOptIn=true', () => {
    render(
      <ProfileFormBody
        email="per@example.com"
        initial={baseInitial}
        action={() => undefined}
      />,
    );
    openMoreSettings();
    const checkbox = screen.getByRole('checkbox', {
      name: /månedsbrev fra Tørny/i,
    });
    expect(checkbox).toBeChecked();
  });

  it('rendrer toggle som unchecked når initial.productUpdatesOptIn=false', () => {
    render(
      <ProfileFormBody
        email="per@example.com"
        initial={{ ...baseInitial, productUpdatesOptIn: false }}
        action={() => undefined}
      />,
    );
    openMoreSettings();
    const checkbox = screen.getByRole('checkbox', {
      name: /månedsbrev fra Tørny/i,
    });
    expect(checkbox).not.toBeChecked();
  });

  it('toggle endring markerer skjema som dirty (Lagre-knappen aktiveres)', () => {
    render(
      <ProfileFormBody
        email="per@example.com"
        initial={baseInitial}
        action={() => undefined}
      />,
    );
    const saveBtn = screen.getByRole('button', { name: 'Lagre' });
    expect(saveBtn).toBeDisabled();

    openMoreSettings();
    const checkbox = screen.getByRole('checkbox', {
      name: /månedsbrev fra Tørny/i,
    });
    fireEvent.click(checkbox);

    expect(saveBtn).not.toBeDisabled();
  });

  it('endring av navn aktiverer Lagre-knappen (eksisterende oppførsel uendret)', () => {
    render(
      <ProfileFormBody
        email="per@example.com"
        initial={baseInitial}
        action={() => undefined}
      />,
    );
    const saveBtn = screen.getByRole('button', { name: 'Lagre' });
    expect(saveBtn).toBeDisabled();

    const nameInput = screen.getByLabelText('Navn');
    fireEvent.change(nameInput, { target: { value: 'Per Hansen Jr' } });

    expect(saveBtn).not.toBeDisabled();
  });
});

describe('ProfileFormBody — Flere innstillinger-disclosure', () => {
  // NB: jsdom laster ikke Tailwind-CSS, så `hidden`-klassen gir ikke
  // display:none her — vi tester disclosure-kontrakten via aria-expanded og
  // at feltene fortsatt finnes i DOM (ikke unmountet), ikke via synlighet.
  it('er kollapset som standard når kjønn alt er satt', () => {
    render(
      <ProfileFormBody
        email="per@example.com"
        initial={baseInitial}
        action={() => undefined}
      />,
    );
    const toggle = screen.getByRole('button', { name: /flere innstillinger/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('er åpen som standard når kjønn ikke er satt (gender-soft-prompt treffer #kjonn)', () => {
    render(
      <ProfileFormBody
        email="per@example.com"
        initial={{ ...baseInitial, gender: null }}
        action={() => undefined}
      />,
    );
    expect(
      screen.getByRole('button', { name: /flere innstillinger/i }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('beholder feltene i DOM når kollapset, så verdiene sendes fortsatt med ved lagring', () => {
    render(
      <ProfileFormBody
        email="per@example.com"
        initial={baseInitial}
        action={() => undefined}
      />,
    );
    // Kollapset (gender satt), men gender-input ligger fortsatt i skjemaet med
    // riktig verdi — ellers ville en kollapset bruker tape kjønn ved lagring.
    const genderRadio = document.querySelector(
      'input[name="gender"][value="mens"]',
    );
    expect(genderRadio).toBeInTheDocument();
    expect(genderRadio).toBeChecked();
  });
});
