import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InboxClient } from './InboxClient';
import type { InboxRow } from '@/lib/notifications/inboxSections';

const markOneAsReadMock = vi.fn();
const markGroupAsReadMock = vi.fn();
const markAllAsReadMock = vi.fn();
const clearReadMock = vi.fn();
const decideMock = vi.fn();
const routerPushMock = vi.fn();

vi.mock('./actions', () => ({
  markOneAsRead: (id: string) => markOneAsReadMock(id),
  markGroupAsRead: (ids: string[]) => markGroupAsReadMock(ids),
  markAllAsRead: () => markAllAsReadMock(),
  clearRead: () => clearReadMock(),
  decideRegistration: (...args: unknown[]) => decideMock(...args),
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

// InboxClient uses @/i18n/navigation (locale-aware wrapper); wire the same
// routerPushMock so navigation assertions work after the i18n migration.
vi.mock('@/i18n/navigation', async () => {
  // importActual instead of require(): vi.mock factories are hoisted above
  // imports, so the top-level React binding can't be referenced here. Mirrors
  // the next/navigation mock above.
  const { createElement } = await vi.importActual<typeof import('react')>('react');
  return {
    useRouter: () => ({
      push: routerPushMock,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      pathname: '/innboks',
    }),
    usePathname: () => '/innboks',
    Link: ({
      children,
      href,
      onClick,
      className,
      ...rest
    }: {
      children: React.ReactNode;
      href: string;
      onClick?: () => void;
      className?: string;
    }) => createElement('a', { href, onClick, className, ...rest }, children),
    redirect: vi.fn(),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  for (const m of [markOneAsReadMock, markGroupAsReadMock, markAllAsReadMock, clearReadMock, decideMock, routerPushMock]) {
    m.mockReset();
  }
  // The server actions answer `{ ok }` since #1394 — default «saved»; single
  // tests override with ok:false for the rollback.
  markOneAsReadMock.mockResolvedValue({ ok: true });
  markGroupAsReadMock.mockResolvedValue({ ok: true });
  markAllAsReadMock.mockResolvedValue({ ok: true });
  clearReadMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// 16:30 Oslo on 24 May 2026.
const NOW = Date.parse('2026-05-24T14:30:00Z');
const GAME = '11111111-1111-1111-1111-111111111111';
const GAME_2 = '22222222-2222-2222-2222-222222222222';
const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

function makeInvite(id: string, read = false): InboxRow {
  return {
    id,
    kind: 'invite',
    payload: { game_id: GAME, game_name: 'Hauger Open', invited_by_name: 'Per' },
    read_at: read ? '2026-05-24T13:00:00Z' : null,
    created_at: '2026-05-24T13:30:00Z',
  };
}

function makeDelivered(id: string, name: string, read = false, at = '2026-05-24T14:00:00Z'): InboxRow {
  return {
    id,
    kind: 'scorecard_submitted',
    payload: { game_id: GAME, game_name: 'Lørdagsrunden', player_name: name },
    read_at: read ? '2026-05-24T14:10:00Z' : null,
    created_at: at,
  };
}

function makeRequest(id: string): InboxRow {
  return {
    id,
    kind: 'registration_request',
    payload: {
      game_id: GAME_2,
      game_name: 'Onsdagsgolfen',
      requester_name: 'Kristian Holm',
      request_id: ID(900),
    },
    read_at: null,
    created_at: '2026-05-24T14:20:00Z',
  };
}

function renderInbox(rows: InboxRow[], isAdmin = true) {
  return render(
    <InboxClient
      initialNotifications={rows}
      isAdmin={isAdmin}
      teeOffByGame={{}}
      resultByGame={{}}
      finishedGameIds={[]}
      now={NOW}
      signupErrorText={{
        game_locked: 'Spillet er startet eller avsluttet. Påmeldinger kan ikke endres lenger.',
        no_team_slot: 'Spillet har ingen ledige lag igjen.',
      }}
    />,
  );
}

describe('InboxClient', () => {
  it('tom innboks: tittelen står, uten pille og brikker', () => {
    renderInbox([]);
    expect(screen.getByRole('heading', { level: 1, name: 'Innboks' })).toBeInTheDocument();
    expect(screen.getByText(/Ingen.*varsler/i)).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inbox-mark-all')).not.toBeInTheDocument();
  });

  it('seksjoner og filter: KREVER HANDLING, I DAG, TIDLIGERE; brikkene filtrerer', () => {
    renderInbox([
      makeInvite('a'),
      makeDelivered('b', 'Marte', true),
      makeDelivered('c', 'Jonas', true, '2026-05-22T10:00:00Z'),
    ]);
    expect(screen.getByTestId('inbox-section-action')).toBeInTheDocument();
    expect(screen.getByTestId('inbox-section-today')).toBeInTheDocument();
    expect(screen.getByTestId('inbox-section-earlier')).toBeInTheDocument();
    expect(screen.getByTestId('inbox-filter-action')).toHaveTextContent('Krever handling · 1');

    fireEvent.click(screen.getByTestId('inbox-filter-action'));
    expect(screen.getByTestId('inbox-filter-action')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('inbox-section-today')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('inbox-filter-friends'));
    expect(screen.getByText('Ingenting her nå.')).toBeInTheDocument();
  });

  it('brikken står uten tall når ingenting krever handling', () => {
    renderInbox([makeDelivered('b', 'Marte')]);
    expect(screen.getByTestId('inbox-filter-action')).toHaveTextContent(/^Krever handling$/);
  });

  it('«Marker alt lest» med uleste, «Tøm leste» når alt er lest', () => {
    const { unmount } = renderInbox([makeInvite('a')]);
    expect(screen.getByRole('button', { name: 'Marker alt lest' })).toBeInTheDocument();
    unmount();
    renderInbox([makeInvite('a', true)]);
    expect(screen.queryByRole('button', { name: 'Marker alt lest' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tøm leste' })).toBeInTheDocument();
  });

  it('«Bekreft» markerer raden lest og lenker til spillet', () => {
    renderInbox([makeInvite('a')]);
    const button = screen.getByRole('link', { name: 'Bekreft' });
    expect(button).toHaveAttribute('href', `/games/${GAME}`);
    fireEvent.click(button);
    expect(markOneAsReadMock).toHaveBeenCalledWith('a');
  });

  it('en lest rad skrives ikke på nytt, men lenker fortsatt', () => {
    renderInbox([makeDelivered('b', 'Marte', true)]);
    const row = screen.getByTestId('inbox-row');
    expect(row).toHaveAttribute('href', `/admin/games/${GAME}`);
    fireEvent.click(row);
    expect(markOneAsReadMock).not.toHaveBeenCalled();
  });

  it('prikk på uleste rader, ingen på leste; ingen ✕ i lista', () => {
    renderInbox([makeDelivered('b', 'Marte'), makeDelivered('c', 'Jonas', true, '2026-05-22T10:00:00Z')]);
    const [unreadRow, readRow] = screen.getAllByTestId('inbox-row');
    expect(unreadRow!.querySelector('[data-testid="unread-dot"]')).not.toBeNull();
    expect(unreadRow).toHaveTextContent('Ulest');
    expect(readRow!.querySelector('[data-testid="unread-dot"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /Arkiver/i })).not.toBeInTheDocument();
  });

  it('en gruppe markerer alle radene lest med ett kall', () => {
    renderInbox([
      makeDelivered(ID(1), 'Marte'),
      makeDelivered(ID(2), 'Jonas', false, '2026-05-24T13:59:00Z'),
    ]);
    const row = screen.getByTestId('inbox-row');
    expect(row).toHaveTextContent('2 scorekort levert');
    fireEvent.click(row);
    expect(markGroupAsReadMock).toHaveBeenCalledWith([ID(1), ID(2)]);
  });

  it('«Marker alt lest» flytter handlingsradene ned', () => {
    renderInbox([makeInvite('a')]);
    fireEvent.click(screen.getByRole('button', { name: 'Marker alt lest' }));
    expect(markAllAsReadMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('inbox-section-action')).not.toBeInTheDocument();
    expect(screen.getByTestId('inbox-section-today')).toHaveTextContent('Per inviterte deg');
  });

  it('pillen beholder teksten og venter mens «Marker alt lest» pågår', async () => {
    let finish: (v: { ok: boolean }) => void = () => {};
    markAllAsReadMock.mockReturnValue(new Promise((r) => (finish = r)));
    renderInbox([makeInvite('a')]);
    await act(async () => {
      fireEvent.click(screen.getByTestId('inbox-mark-all'));
    });
    const pill = screen.getByTestId('inbox-mark-all');
    expect(pill).toBeDisabled();
    expect(pill).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      finish({ ok: true });
    });
    expect(screen.getByTestId('inbox-clear-read')).toBeEnabled();
  });

  it('statuslinja står montert som live-region også når den er tom', () => {
    renderInbox([makeInvite('a')]);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('«Tøm leste» arkiverer de leste', () => {
    renderInbox([makeInvite('a', true), makeInvite('b', true)]);
    fireEvent.click(screen.getByRole('button', { name: 'Tøm leste' }));
    expect(clearReadMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Per inviterte deg/)).not.toBeInTheDocument();
  });

  it('#1394: en lagring som feiler, ruller tilbake og viser feillinja', async () => {
    markOneAsReadMock.mockResolvedValue({ ok: false });
    renderInbox([makeDelivered('b', 'Marte')]);
    await act(async () => {
      fireEvent.click(screen.getByTestId('inbox-row'));
    });
    expect(screen.getByTestId('inbox-row').querySelector('[data-testid="unread-dot"]')).not.toBeNull();
    expect(screen.getByTestId('inbox-action-error')).toBeInTheDocument();
  });

  describe('Godta / Avslå', () => {
    it('«Godta» svarer på forespørselen og sier hvem som er med', async () => {
      decideMock.mockResolvedValue({ ok: true, outcome: 'approved', gameName: 'Onsdagsgolfen', teamName: null });
      renderInbox([makeRequest('r')]);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Godta' }));
      });
      expect(decideMock).toHaveBeenCalledWith('r', ID(900), 'approve');
      expect(screen.getByTestId('inbox-status')).toHaveTextContent('Kristian er med i Onsdagsgolfen');
      expect(screen.queryByRole('button', { name: 'Godta' })).not.toBeInTheDocument();
    });

    it('allerede avgjort → raden blir stående som lest, med beskjed', async () => {
      decideMock.mockResolvedValue({ ok: false, reason: 'not_pending' });
      renderInbox([makeRequest('r')]);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Avslå' }));
      });
      expect(screen.getByTestId('inbox-status')).toHaveTextContent('Den er allerede avgjort');
      expect(screen.getByTestId('inbox-section-today')).toHaveTextContent('Kristian meldte seg på');
    });

    it('ingen ledig lagplass → tilbake, med påmeldingssidens tekst', async () => {
      decideMock.mockResolvedValue({ ok: false, reason: 'no_team_slot' });
      renderInbox([makeRequest('r')]);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Godta' }));
      });
      expect(screen.getByTestId('inbox-action-error')).toHaveTextContent('Spillet har ingen ledige lag igjen.');
      expect(screen.getByRole('button', { name: 'Godta' })).toBeInTheDocument();
    });

    it('en arrangør uten admin-rolle får verken knapper eller pil', () => {
      renderInbox([makeRequest('r')], false);
      expect(screen.queryByRole('button', { name: 'Godta' })).not.toBeInTheDocument();
      const row = screen.getByTestId('inbox-row');
      expect(row.tagName).toBe('BUTTON');
      expect(row).not.toHaveTextContent('→');
    });
  });
});
