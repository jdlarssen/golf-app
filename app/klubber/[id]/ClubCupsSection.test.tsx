import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClubCupsSection, type ClubCupRow } from './ClubCupsSection';

// SmartLink/LinkButton lener seg på next/link → useRouter for prefetch.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: () => {} }),
  usePathname: () => '/',
}));

const CUPS: ClubCupRow[] = [
  { id: 'c1', name: 'Klubbmesterskap', status: 'active' },
  { id: 'c2', name: 'Høst-cup', status: 'draft' },
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

  it('renders an empty-state hint when the club has no cups', () => {
    render(<ClubCupsSection cups={[]} clubId="c1" canCreate={false} canManage={false} />);
    expect(screen.getByText('Ingen cuper i klubben ennå.')).toBeInTheDocument();
  });
});
