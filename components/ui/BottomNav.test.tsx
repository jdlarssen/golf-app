import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BottomNav } from './BottomNav';

// Aktiv-fane leses fra usePathname; uleste-prikken fra en Supabase-rørt hook.
// Stubb begge så testen er ren render-logikk uten browser-klient.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  // SmartLink (faner) kaller useRouter().prefetch — stubb som no-op.
  useRouter: () => ({ prefetch: () => {} }),
}));
vi.mock('@/hooks/useUnreadNotificationsCount', () => ({
  useUnreadNotificationsCount: () => ({ count: 0, loading: false }),
}));

describe('BottomNav', () => {
  it('rendrer de tre fanene og markerer kun gjeldende rute som aktiv', () => {
    render(<BottomNav userId="user-1" />);

    const hjem = screen.getByRole('link', { name: 'Hjem' });
    const innboks = screen.getByRole('link', { name: 'Innboks' });
    const profil = screen.getByRole('link', { name: 'Profil' });

    expect(hjem).toBeInTheDocument();
    expect(innboks).toBeInTheDocument();
    expect(profil).toBeInTheDocument();

    // Pathname er '/', så kun Hjem skal være aria-current.
    expect(hjem).toHaveAttribute('aria-current', 'page');
    expect(innboks).not.toHaveAttribute('aria-current');
    expect(profil).not.toHaveAttribute('aria-current');
  });
});
