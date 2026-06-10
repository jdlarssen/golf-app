import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClubLeaguesSection, type ClubLeagueRow } from './ClubLeaguesSection';

// SmartLink/LinkButton lener seg på next/link → useRouter for prefetch.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: () => {} }),
  usePathname: () => '/',
}));

const LEAGUES: ClubLeagueRow[] = [
  { id: 'l1', name: 'Vårserien', status: 'active' },
  { id: 'l2', name: 'Høstserien', status: 'draft' },
];

describe('ClubLeaguesSection (#480)', () => {
  it('lists the club leagues, each name linking to its public liga page', () => {
    render(
      <ClubLeaguesSection leagues={LEAGUES} clubId="c1" canCreate={false} canManage={false} />,
    );
    expect(screen.getByText('Vårserien')).toBeInTheDocument();
    expect(screen.getByText('Høstserien')).toBeInTheDocument();
    // Status badge uses the human label, not the raw enum value.
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
    expect(screen.getByText('Utkast')).toBeInTheDocument();
    const ligaLink = screen.getByText('Vårserien').closest('a');
    expect(ligaLink).toHaveAttribute('href', '/liga/l1');
  });

  it('shows the «Ny liga» entry only when the viewer may create (club owner/admin, not frozen)', () => {
    const { rerender } = render(
      <ClubLeaguesSection leagues={LEAGUES} clubId="c1" canCreate={true} canManage={true} />,
    );
    const create = screen.getByRole('link', { name: 'Ny liga' });
    expect(create).toHaveAttribute('href', '/klubber/c1/liga/ny');

    // A plain member (canCreate=false) gets the list but no create door.
    rerender(<ClubLeaguesSection leagues={LEAGUES} clubId="c1" canCreate={false} canManage={false} />);
    expect(screen.queryByRole('link', { name: 'Ny liga' })).toBeNull();
  });

  it('shows a «Styr» link per league only when the viewer may manage, pointing at the club surface (#485)', () => {
    const { rerender } = render(
      <ClubLeaguesSection leagues={LEAGUES} clubId="c1" canCreate={false} canManage={true} />,
    );
    const manage = screen.getAllByRole('link', { name: 'Styr' });
    expect(manage).toHaveLength(LEAGUES.length);
    // #485: «Styr» now opens the dedicated /klubber surface (no admin chrome),
    // not the /admin/liga route.
    expect(manage[0]).toHaveAttribute('href', '/klubber/c1/liga/l1');

    // A plain member (canManage=false) sees the list but no management door.
    rerender(<ClubLeaguesSection leagues={LEAGUES} clubId="c1" canCreate={false} canManage={false} />);
    expect(screen.queryByRole('link', { name: 'Styr' })).toBeNull();
  });

  it('renders an empty-state hint when the club has no leagues', () => {
    render(<ClubLeaguesSection leagues={[]} clubId="c1" canCreate={false} canManage={false} />);
    expect(screen.getByText('Ingen ligaer i klubben ennå.')).toBeInTheDocument();
  });
});
