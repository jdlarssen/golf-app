import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mocker hooken slik at vi kan styre count uten Supabase-roundtrip.
const useUnreadNotificationsCountMock = vi.fn();
vi.mock('@/hooks/useUnreadNotificationsCount', () => ({
  useUnreadNotificationsCount: () => useUnreadNotificationsCountMock(),
}));

beforeEach(() => {
  useUnreadNotificationsCountMock.mockReset();
});

describe('NotificationBell', () => {
  it('rendrer som lenke til /innboks', async () => {
    useUnreadNotificationsCountMock.mockReturnValue({ count: 0, loading: false });
    const { NotificationBell } = await import('./NotificationBell');
    render(<NotificationBell userId="user-1" />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/innboks');
  });

  it('viser IKKE prikk når count = 0', async () => {
    useUnreadNotificationsCountMock.mockReturnValue({ count: 0, loading: false });
    const { NotificationBell } = await import('./NotificationBell');
    const { container } = render(<NotificationBell userId="user-1" />);

    // Prikken er en konkret span med data-testid for å være lett å assertere.
    expect(container.querySelector('[data-testid="bell-dot"]')).toBeNull();
  });

  it('viser champagne-prikk når count > 0', async () => {
    useUnreadNotificationsCountMock.mockReturnValue({ count: 3, loading: false });
    const { NotificationBell } = await import('./NotificationBell');
    const { container } = render(<NotificationBell userId="user-1" />);

    expect(container.querySelector('[data-testid="bell-dot"]')).not.toBeNull();
  });

  it('aria-label reflekterer antall uleste varsler', async () => {
    useUnreadNotificationsCountMock.mockReturnValue({ count: 2, loading: false });
    const { NotificationBell } = await import('./NotificationBell');
    render(<NotificationBell userId="user-1" />);

    const link = screen.getByRole('link');
    // Norsk språk, action-orientert. «2 uleste varsler» / «Ingen uleste» osv.
    expect(link.getAttribute('aria-label')?.toLowerCase()).toMatch(/uleste|innboks/);
    expect(link.getAttribute('aria-label')).toContain('2');
  });

  it('aria-label uten antall når count = 0', async () => {
    useUnreadNotificationsCountMock.mockReturnValue({ count: 0, loading: false });
    const { NotificationBell } = await import('./NotificationBell');
    render(<NotificationBell userId="user-1" />);

    const link = screen.getByRole('link');
    const label = link.getAttribute('aria-label') ?? '';
    expect(label.toLowerCase()).toContain('innboks');
    expect(label).not.toMatch(/\d/);
  });

  it('rendrer ikke noe når userId er null (ikke innlogget)', async () => {
    useUnreadNotificationsCountMock.mockReturnValue({ count: 0, loading: false });
    const { NotificationBell } = await import('./NotificationBell');
    const { container } = render(<NotificationBell userId={null} />);

    expect(container.firstChild).toBeNull();
  });

  it('tap-target er minst 44×44 px (tilgjengelighet på mobil)', async () => {
    useUnreadNotificationsCountMock.mockReturnValue({ count: 0, loading: false });
    const { NotificationBell } = await import('./NotificationBell');
    const { container } = render(<NotificationBell userId="user-1" />);

    const link = container.querySelector('a');
    // Tailwind: min-h-11 + min-w-11 = 44px (h/w-11 = 2.75rem = 44px).
    expect(link?.className).toContain('min-h-11');
    expect(link?.className).toContain('min-w-11');
  });
});
