import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InboxClient } from './InboxClient';
import type { NotificationRow } from '@/components/notifications/NotificationCard';

const markOneAsReadMock = vi.fn();
const markAllAsReadMock = vi.fn();
const routerPushMock = vi.fn();

vi.mock('./actions', () => ({
  markOneAsRead: (id: string) => markOneAsReadMock(id),
  markAllAsRead: () => markAllAsReadMock(),
}));

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({
      push: routerPushMock,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      pathname: '/innboks',
    }),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-24T14:30:00Z'));
  markOneAsReadMock.mockReset();
  markAllAsReadMock.mockReset();
  routerPushMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeInvite(id: string, read = false): NotificationRow {
  return {
    id,
    kind: 'invite',
    payload: {
      game_id: '11111111-1111-1111-1111-111111111111',
      game_name: 'Hauger Open',
      invited_by_name: 'Per',
    },
    read_at: read ? '2026-05-24T13:00:00Z' : null,
    created_at: '2026-05-24T13:30:00Z',
  };
}

describe('InboxClient', () => {
  it('viser tom-tilstand når listen er tom', () => {
    render(<InboxClient initialNotifications={[]} />);
    expect(screen.getByText(/Ingen.*varsler/i)).toBeInTheDocument();
  });

  it('rendrer kort gruppert per dag-bucket', () => {
    render(
      <InboxClient
        initialNotifications={[
          { ...makeInvite('a'), created_at: '2026-05-24T13:00:00Z' },
          { ...makeInvite('b'), created_at: '2026-05-23T13:00:00Z' },
        ]}
      />,
    );
    expect(screen.getByText('I dag')).toBeInTheDocument();
    expect(screen.getByText('I går')).toBeInTheDocument();
  });

  it('viser «Marker alle som lest» når det finnes uleste', () => {
    render(<InboxClient initialNotifications={[makeInvite('a')]} />);
    expect(
      screen.getByRole('button', { name: /Marker alle som lest/i }),
    ).toBeInTheDocument();
  });

  it('viser IKKE «Marker alle som lest» når alt er lest', () => {
    render(<InboxClient initialNotifications={[makeInvite('a', true)]} />);
    expect(
      screen.queryByRole('button', { name: /Marker alle som lest/i }),
    ).not.toBeInTheDocument();
  });

  it('caller markOneAsRead og navigerer på kort-tap (ulest)', async () => {
    render(<InboxClient initialNotifications={[makeInvite('a')]} />);
    // Card-button-en har tittel-tekst som accessible name; bruk getByText i stedet.
    const card = screen
      .getByText(/Per inviterte deg/)
      .closest('button')!;
    fireEvent.click(card);
    // Server-action skal kalles med id-en
    expect(markOneAsReadMock).toHaveBeenCalledWith('a');
    // Router skal navigere til kortets deeplink (invite → /games/<id>)
    expect(routerPushMock).toHaveBeenCalledWith(
      '/games/11111111-1111-1111-1111-111111111111',
    );
  });

  it('caller IKKE markOneAsRead på allerede-lest kort (men navigerer)', () => {
    render(<InboxClient initialNotifications={[makeInvite('a', true)]} />);
    const card = screen
      .getByText(/Per inviterte deg/)
      .closest('button')!;
    fireEvent.click(card);
    expect(markOneAsReadMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith(
      '/games/11111111-1111-1111-1111-111111111111',
    );
  });

  it('caller markAllAsRead når «Marker alle som lest» klikkes', () => {
    render(<InboxClient initialNotifications={[makeInvite('a'), makeInvite('b')]} />);
    const button = screen.getByRole('button', { name: /Marker alle som lest/i });
    fireEvent.click(button);
    expect(markAllAsReadMock).toHaveBeenCalledTimes(1);
  });

  it('navigerer game_finished til leaderboard-rute', () => {
    render(
      <InboxClient
        initialNotifications={[
          {
            id: 'g1',
            kind: 'game_finished',
            payload: {
              game_id: '22222222-2222-2222-2222-222222222222',
              game_name: 'X',
            },
            read_at: null,
            created_at: '2026-05-24T13:00:00Z',
          },
        ]}
      />,
    );
    const card = screen
      .getByText(/Resultatet er klart/)
      .closest('button')!;
    fireEvent.click(card);
    expect(routerPushMock).toHaveBeenCalledWith(
      '/games/22222222-2222-2222-2222-222222222222/leaderboard',
    );
  });

  it('navigerer peer_approval_request til approve-rute', () => {
    render(
      <InboxClient
        initialNotifications={[
          {
            id: 'p1',
            kind: 'peer_approval_request',
            payload: {
              game_id: '33333333-3333-3333-3333-333333333333',
              game_name: 'X',
              submitter_name: 'Per',
            },
            read_at: null,
            created_at: '2026-05-24T13:00:00Z',
          },
        ]}
      />,
    );
    const card = screen
      .getByText(/Godkjenning trengs/)
      .closest('button')!;
    fireEvent.click(card);
    expect(routerPushMock).toHaveBeenCalledWith(
      '/games/33333333-3333-3333-3333-333333333333/approve',
    );
  });

  it('navigerer scorecard_submitted til admin/games/[id]-rute', () => {
    render(
      <InboxClient
        initialNotifications={[
          {
            id: 's1',
            kind: 'scorecard_submitted',
            payload: {
              game_id: '44444444-4444-4444-4444-444444444444',
              game_name: 'X',
              player_name: 'Per',
            },
            read_at: null,
            created_at: '2026-05-24T13:00:00Z',
          },
        ]}
      />,
    );
    const card = screen
      .getByText(/Nytt scorekort levert/)
      .closest('button')!;
    fireEvent.click(card);
    expect(routerPushMock).toHaveBeenCalledWith(
      '/admin/games/44444444-4444-4444-4444-444444444444',
    );
  });
});
