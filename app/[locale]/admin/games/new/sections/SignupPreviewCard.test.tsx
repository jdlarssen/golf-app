import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignupPreviewCard } from './SignupPreviewCard';

// Type C (#2482): «Slik ser det ut for den som melder seg på» on «Klar?», the
// signup page's own seats line and button for the full round.

const base = {
  name: 'Lørdagsrunden',
  teeOffIso: '2026-10-03T07:00:00Z',
  gameMode: 'solo_strokeplay' as const,
  teamSize: 1,
  cap: 16 as number | null,
  registrationMode: 'open' as const,
  waitlistEnabled: true,
};

describe('SignupPreviewCard', () => {
  it('open with the list on: the full line with the list and «Sett meg på ventelista»', () => {
    render(<SignupPreviewCard {...base} />);
    expect(screen.getByTestId('signup-preview')).toHaveTextContent('Lørdagsrunden');
    expect(screen.getByTestId('signup-seats')).toHaveTextContent('16 av 16 plasser');
    expect(screen.getByTestId('signup-seats-full')).toHaveTextContent('Fullt · 0 på venteliste');
    expect(screen.getByTestId('signup-preview-button')).toHaveTextContent('Sett meg på ventelista');
  });

  it('the list off, or manual approval: «Fullt» and «Send forespørsel»', () => {
    const { unmount } = render(<SignupPreviewCard {...base} waitlistEnabled={false} />);
    expect(screen.getByTestId('signup-seats-full')).toHaveTextContent(/^Fullt$/);
    expect(screen.getByTestId('signup-preview-button')).toHaveTextContent('Send forespørsel');
    unmount();
    render(<SignupPreviewCard {...base} registrationMode="manual_approval" />);
    expect(screen.getByTestId('signup-preview-button')).toHaveTextContent('Send forespørsel');
  });

  it('no cap, and matchplay: nothing to preview', () => {
    const { container, unmount } = render(<SignupPreviewCard {...base} cap={null} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    const mp = render(
      <SignupPreviewCard {...base} gameMode="singles_matchplay" cap={2} />,
    );
    expect(mp.container).toBeEmptyDOMElement();
  });
});
