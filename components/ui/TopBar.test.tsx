import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopBar } from './TopBar';

// Bjella henter count via en hook som rør Supabase — stubb den så TopBar-
// tester ikke trenger noen browser-klient.
vi.mock('@/hooks/useUnreadNotificationsCount', () => ({
  useUnreadNotificationsCount: () => ({ count: 0, loading: false }),
}));

describe('TopBar', () => {
  it('rendrer back-link med tilbake-label som default', () => {
    render(<TopBar backHref="/" />);
    expect(screen.getByRole('link', { name: /tilbake/i })).toBeInTheDocument();
  });

  it('viser kicker når oppgitt', () => {
    render(<TopBar backHref="/" kicker="SEKRETARIATET" />);
    expect(screen.getByText('SEKRETARIATET')).toBeInTheDocument();
  });

  it('rendrer NotificationBell når userId er satt', () => {
    render(<TopBar backHref="/" userId="user-1" />);
    expect(screen.getByRole('link', { name: /innboks/i })).toBeInTheDocument();
  });

  it('rendrer IKKE NotificationBell når userId mangler', () => {
    render(<TopBar backHref="/" />);
    expect(
      screen.queryByRole('link', { name: /innboks/i }),
    ).not.toBeInTheDocument();
  });

  it('rendrer både action og bjelle samtidig', () => {
    render(
      <TopBar
        backHref="/"
        userId="user-1"
        action={<button data-testid="nytt-action">+ Nytt</button>}
      />,
    );
    expect(screen.getByTestId('nytt-action')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /innboks/i })).toBeInTheDocument();
  });
});
