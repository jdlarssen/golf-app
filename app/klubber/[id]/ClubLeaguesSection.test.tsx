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
  it('lists the club leagues, each linking to its public liga page', () => {
    render(<ClubLeaguesSection leagues={LEAGUES} clubId="c1" canCreate={false} />);
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
      <ClubLeaguesSection leagues={LEAGUES} clubId="c1" canCreate={true} />,
    );
    const create = screen.getByRole('link', { name: 'Ny liga' });
    expect(create).toHaveAttribute('href', '/klubber/c1/liga/ny');

    // A plain member (canCreate=false) gets the list but no create door.
    rerender(<ClubLeaguesSection leagues={LEAGUES} clubId="c1" canCreate={false} />);
    expect(screen.queryByRole('link', { name: 'Ny liga' })).toBeNull();
  });

  it('renders an empty-state hint when the club has no leagues', () => {
    render(<ClubLeaguesSection leagues={[]} clubId="c1" canCreate={false} />);
    expect(screen.getByText('Ingen ligaer i klubben ennå.')).toBeInTheDocument();
  });
});
