import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignupRoster } from './SignupRoster';
import type { RosterEntry } from './types';

function entry(userId: string, displayName: string, unconfirmed = false): RosterEntry {
  return { userId, displayName, initials: displayName.slice(0, 2).toUpperCase(), hcp: '18,4', unconfirmed };
}

describe('SignupRoster', () => {
  it('«Vis alle» folder ut hele lista, med «Ikke bekreftet»', () => {
    render(
      <SignupRoster
        entries={[
          entry('a', 'Anders Moe'),
          entry('b', 'Jonas Berg'),
          entry('c', 'Marte Lie'),
          entry('d', 'Ola Vik', true),
        ]}
        namesLine="Anders, Jonas, Marte og 1 til"
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Vis alle' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Ikke bekreftet')).not.toBeVisible();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Ikke bekreftet')).toBeVisible();
  });
});
