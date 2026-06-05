import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BottomNav } from './BottomNav';

// BottomNav rendres globalt i app/layout.tsx, så hide/show-logikken er
// kritisk: den skjuler seg på hull-skjerm og når utlogget, men VISES på
// Klubbhus-rommet (/admin) etter #392. Styr usePathname per test; uleste-
// prikken kommer fra en Supabase-rørt hook.
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ prefetch: () => {} }),
}));
vi.mock('@/hooks/useUnreadNotificationsCount', () => ({
  useUnreadNotificationsCount: () => ({ count: 0, loading: false }),
}));

describe('BottomNav', () => {
  beforeEach(() => {
    mockPathname = '/';
  });

  it('rendrer de fire fanene og markerer kun gjeldende rute som aktiv', () => {
    render(<BottomNav userId="user-1" />);

    const hjem = screen.getByRole('link', { name: 'Hjem' });
    expect(hjem).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Innboks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Klubbhuset' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profil' })).toBeInTheDocument();

    // Pathname er '/', så kun Hjem skal være aria-current.
    expect(hjem).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('link', { name: 'Klubbhuset' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('skjuler seg når brukeren er utlogget (userId null)', () => {
    const { container } = render(<BottomNav userId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('vises på Klubbhus-rommet og markerer Klubbhuset aktiv på alle flatene', () => {
    // Rommet (/admin) + Spill-seksjonen (/klubbhuset) hører til samme fane.
    for (const path of ['/admin/games/abc', '/klubbhuset', '/opprett-spill']) {
      mockPathname = path;
      const { unmount } = render(<BottomNav userId="user-1" />);
      const klubbhuset = screen.getByRole('link', { name: 'Klubbhuset' });
      expect(klubbhuset).toHaveAttribute('aria-current', 'page');
      unmount();
    }
  });

  it('skjuler seg på hull-skjermen (fullskjerm scoring)', () => {
    mockPathname = '/games/abc/holes/4';
    const { container } = render(<BottomNav userId="user-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
