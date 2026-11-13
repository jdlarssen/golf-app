import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlreadyRegisteredView, TeamAwaitingApprovalView } from './RegisteredViews';

// Type B (docs/test-discipline.md): what the signup page shows once you are in.
// #2840 del 5: after a team signup the page has a way to the team page.

describe('AlreadyRegisteredView', () => {
  it('on a team: the team is signed up, «Gå til laget» first, then the game', () => {
    render(<AlreadyRegisteredView shortId="abc12345" gameId="g1" team={{ name: 'Annes lag' }} />);
    expect(screen.getByTestId('already-registered')).toHaveTextContent('Annes lag er påmeldt.');
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/signup/abc12345/team', '/games/g1']);
    expect(links[0]).toHaveTextContent('Gå til laget');
    expect(links[1]).toHaveTextContent('Gå til spillet');
  });

  it('on a team without a name: the plain line, still with the way to the team', () => {
    render(<AlreadyRegisteredView shortId="abc12345" gameId="g1" team={{ name: null }} />);
    expect(screen.getByTestId('already-registered')).toHaveTextContent('Du er allerede påmeldt dette spillet.');
    expect(screen.getByRole('link', { name: 'Gå til laget' })).toHaveAttribute('href', '/signup/abc12345/team');
  });

  it('alone: the plain line and only «Gå til spillet»', () => {
    render(<AlreadyRegisteredView shortId="abc12345" gameId="g1" team={null} />);
    expect(screen.getByTestId('already-registered')).toHaveTextContent('Du er allerede påmeldt dette spillet.');
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/games/g1']);
  });
});

describe('TeamAwaitingApprovalView', () => {
  it('waiting for the organiser, with the way to the team', () => {
    render(<TeamAwaitingApprovalView shortId="abc12345" />);
    expect(screen.getByTestId('team-awaiting-approval')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gå til laget' })).toHaveAttribute('href', '/signup/abc12345/team');
  });
});
