import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClubCupsSection, type ClubCupRow } from './ClubCupsSection';

// SmartLink/LinkButton lener seg på next/link → useRouter for prefetch.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: () => {} }),
  usePathname: () => '/',
}));

const CUPS: ClubCupRow[] = [
  { id: 'c1', name: 'Klubbmesterskap', status: 'active', short_id: 'AAA111', joined: false },
  { id: 'c2', name: 'Høst-cup', status: 'draft', short_id: 'BBB222', joined: false },
];

describe('ClubCupsSection (#524)', () => {
  it('lists the club cups, each name linking to its public cup page', () => {
    render(
      <ClubCupsSection cups={CUPS} clubId="c1" canCreate={false} canManage={false} />,
    );
    expect(screen.getByText('Klubbmesterskap')).toBeInTheDocument();
    expect(screen.getByText('Høst-cup')).toBeInTheDocument();
    expect(screen.getByText('Pågående')).toBeInTheDocument();
    expect(screen.getByText('Utkast')).toBeInTheDocument();
    const cupLink = screen.getByText('Klubbmesterskap').closest('a');
    expect(cupLink).toHaveAttribute('href', '/cup/c1');
  });

  it('shows the «Ny cup» entry only when the viewer may create (owner/admin, not frozen)', () => {
    const { rerender } = render(
      <ClubCupsSection cups={CUPS} clubId="c1" canCreate={true} canManage={true} />,
    );
    const create = screen.getByRole('link', { name: 'Ny cup' });
    expect(create).toHaveAttribute('href', '/klubber/c1/cup/ny');

    rerender(<ClubCupsSection cups={CUPS} clubId="c1" canCreate={false} canManage={false} />);
    expect(screen.queryByRole('link', { name: 'Ny cup' })).toBeNull();
  });

  it('shows a «Styr» link per cup only when the viewer may manage, pointing at the club surface', () => {
    const { rerender } = render(
      <ClubCupsSection cups={CUPS} clubId="c1" canCreate={false} canManage={true} />,
    );
    const manage = screen.getAllByRole('link', { name: 'Styr' });
    expect(manage).toHaveLength(CUPS.length);
    expect(manage[0]).toHaveAttribute('href', '/klubber/c1/cup/c1');

    rerender(<ClubCupsSection cups={CUPS} clubId="c1" canCreate={false} canManage={false} />);
    expect(screen.queryByRole('link', { name: 'Styr' })).toBeNull();
  });

  it('#1135: hides entirely for a plain member when the club has no cups, but keeps the empty-state + «Ny cup» for a creator', () => {
    // Plain member, no cups → nothing rendered (no dead heading).
    const { container, rerender } = render(
      <ClubCupsSection cups={[]} clubId="c1" canCreate={false} canManage={false} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('Ingen cuper i klubben ennå.')).toBeNull();

    // A creator (owner/admin, not frozen) still sees the empty hint + create door.
    rerender(<ClubCupsSection cups={[]} clubId="c1" canCreate={true} canManage={false} />);
    expect(screen.getByText('Ingen cuper i klubben ennå.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ny cup' })).toHaveAttribute(
      'href',
      '/klubber/c1/cup/ny',
    );
  });

  it('#1491: a draft cup carries the signup door — «Meld deg på» when I am not on the roster, «Påmeldt» when I am; other statuses keep no affordance', () => {
    // Not on the roster → the invitation IS the membership: sign-up link on the
    // draft row, pointing at the shared join page.
    const { rerender } = render(
      <ClubCupsSection cups={CUPS} clubId="c1" canCreate={false} canManage={false} />,
    );
    const join = screen.getByRole('link', { name: 'Meld deg på' });
    expect(join).toHaveAttribute('href', '/cup/bli-med/BBB222');
    expect(screen.queryByRole('link', { name: 'Påmeldt' })).toBeNull();
    // The active cup (c1) has no signup affordance — only the draft row does.
    expect(screen.getAllByRole('link', { name: 'Meld deg på' })).toHaveLength(1);

    // Already on the roster → «Påmeldt», linking at the same page (where the
    // withdraw action lives).
    rerender(
      <ClubCupsSection
        cups={CUPS.map((c) => (c.status === 'draft' ? { ...c, joined: true } : c))}
        clubId="c1"
        canCreate={false}
        canManage={false}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Meld deg på' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Påmeldt' })).toHaveAttribute(
      'href',
      '/cup/bli-med/BBB222',
    );
  });
});
