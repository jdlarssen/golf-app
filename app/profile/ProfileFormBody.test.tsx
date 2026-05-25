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
};

describe('ProfileFormBody — Mail-innstillinger toggle', () => {
  it('rendrer toggle som checked når initial.productUpdatesOptIn=true', () => {
    render(
      <ProfileFormBody
        email="per@example.com"
        initial={baseInitial}
        action={() => undefined}
      />,
    );
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
