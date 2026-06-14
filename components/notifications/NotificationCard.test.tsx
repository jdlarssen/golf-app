import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationCard, type NotificationRow } from './NotificationCard';
import type { NotificationPayload } from '@/lib/notifications/types';

beforeEach(() => {
  // Pin «nå» så relative tidsstempler er deterministiske i tester.
  // 2026-05-24T14:30:00Z (~16:30 Europe/Oslo sommertid).
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-24T14:30:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function makeInvite(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n-1',
    kind: 'invite',
    payload: {
      game_id: '11111111-1111-1111-1111-111111111111',
      game_name: 'Hauger Open',
      invited_by_name: 'Per',
    },
    read_at: null,
    created_at: '2026-05-24T13:30:00Z', // 1 time siden
    ...overrides,
  };
}

describe('NotificationCard', () => {
  it('rendrer tittel og detalj fra invite-payload', () => {
    render(<NotificationCard notification={makeInvite()} />);
    // Tittel: «Per inviterte deg»
    expect(screen.getByText(/Per inviterte deg/)).toBeInTheDocument();
    // Detalj: spillnavnet
    expect(screen.getByText('Hauger Open')).toBeInTheDocument();
  });

  it('rendrer emoji for hver kind', () => {
    const kinds = [
      { kind: 'invite' as const, emoji: '📨' },
      { kind: 'peer_approval_request' as const, emoji: '✋' },
      { kind: 'scorecard_submitted' as const, emoji: '📋' },
      { kind: 'scorecard_approved' as const, emoji: '✅' },
      { kind: 'game_finished' as const, emoji: '🏆' },
    ];
    for (const { kind, emoji } of kinds) {
      const payload =
        kind === 'invite'
          ? {
              game_id: '11111111-1111-1111-1111-111111111111',
              game_name: 'G',
              invited_by_name: 'Per',
            }
          : kind === 'peer_approval_request'
            ? {
                game_id: '11111111-1111-1111-1111-111111111111',
                game_name: 'G',
                submitter_name: 'Per',
              }
            : kind === 'scorecard_submitted'
              ? {
                  game_id: '11111111-1111-1111-1111-111111111111',
                  game_name: 'G',
                  player_name: 'Per',
                }
              : kind === 'scorecard_approved'
                ? {
                    game_id: '11111111-1111-1111-1111-111111111111',
                    game_name: 'G',
                    approver_name: 'Per',
                  }
                : {
                    game_id: '11111111-1111-1111-1111-111111111111',
                    game_name: 'G',
                  };
      const { unmount } = render(
        <NotificationCard
          notification={{
            id: `n-${kind}`,
            kind,
            payload,
            read_at: null,
            created_at: '2026-05-24T13:30:00Z',
          }}
        />,
      );
      expect(screen.getByText(emoji)).toBeInTheDocument();
      unmount();
    }
  });

  it('viser relativ tid-stamp på norsk', () => {
    render(<NotificationCard notification={makeInvite()} />);
    // 1 time siden — Intl.RelativeTimeFormat nb-NO gir «for 1 time siden»
    // eller «1 t. siden» — tester løs match for fleksibilitet på tvers av ICU-versjoner.
    expect(screen.getByText(/time|t\./i)).toBeInTheDocument();
  });

  it('uleste varsler har champagne-stripe på venstre', () => {
    const { container } = render(<NotificationCard notification={makeInvite()} />);
    expect(container.querySelector('[data-testid="unread-stripe"]')).not.toBeNull();
  });

  it('leste varsler har IKKE champagne-stripe', () => {
    const { container } = render(
      <NotificationCard
        notification={makeInvite({ read_at: '2026-05-24T14:00:00Z' })}
      />,
    );
    expect(container.querySelector('[data-testid="unread-stripe"]')).toBeNull();
  });

  it('uleste rendres med font-medium', () => {
    render(<NotificationCard notification={makeInvite()} />);
    const title = screen.getByText(/Per inviterte deg/);
    expect(title.className).toContain('font-medium');
  });

  it('caller onTap når brukeren klikker', () => {
    const onTap = vi.fn();
    render(
      <NotificationCard notification={makeInvite()} onTap={onTap} />,
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('rendrer som button-rolle med tap-target ≥44px', () => {
    render(<NotificationCard notification={makeInvite()} />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('min-h-11');
  });

  it('rendrer peer_approval_request-tittel og detalj', () => {
    render(
      <NotificationCard
        notification={{
          id: 'n-2',
          kind: 'peer_approval_request',
          payload: {
            game_id: '11111111-1111-1111-1111-111111111111',
            game_name: 'Bislett Cup',
            submitter_name: 'Kari',
          },
          read_at: null,
          created_at: '2026-05-24T13:30:00Z',
        }}
      />,
    );
    expect(screen.getByText(/Godkjenning trengs/)).toBeInTheDocument();
    expect(screen.getByText(/Kari leverte/)).toBeInTheDocument();
    expect(screen.getByText(/Bislett Cup/)).toBeInTheDocument();
  });

  it('rendrer game_finished-tittel og detalj', () => {
    render(
      <NotificationCard
        notification={{
          id: 'n-3',
          kind: 'game_finished',
          payload: {
            game_id: '11111111-1111-1111-1111-111111111111',
            game_name: 'Bogey Tirsdag',
          },
          read_at: null,
          created_at: '2026-05-24T13:30:00Z',
        }}
      />,
    );
    expect(screen.getByText(/Resultatet er klart/)).toBeInTheDocument();
    expect(screen.getByText('Bogey Tirsdag')).toBeInTheDocument();
  });

  it('rendrer scorecard_approved-tittel og detalj', () => {
    render(
      <NotificationCard
        notification={{
          id: 'n-4',
          kind: 'scorecard_approved',
          payload: {
            game_id: '11111111-1111-1111-1111-111111111111',
            game_name: 'Klubbmesterskap',
            approver_name: 'Ola',
          },
          read_at: null,
          created_at: '2026-05-24T13:30:00Z',
        }}
      />,
    );
    expect(screen.getByText(/Scorekortet er godkjent/)).toBeInTheDocument();
    expect(screen.getByText(/Ola godkjente/)).toBeInTheDocument();
  });

  it('rendrer scorecard_submitted-tittel og detalj', () => {
    render(
      <NotificationCard
        notification={{
          id: 'n-5',
          kind: 'scorecard_submitted',
          payload: {
            game_id: '11111111-1111-1111-1111-111111111111',
            game_name: 'Solo Stableford',
            player_name: 'Maja',
          },
          read_at: null,
          created_at: '2026-05-24T13:30:00Z',
        }}
      />,
    );
    expect(screen.getByText(/Nytt scorekort levert/)).toBeInTheDocument();
    expect(screen.getByText(/Maja leverte/)).toBeInTheDocument();
  });

  it('rendrer game_started-tittel og detalj', () => {
    render(
      <NotificationCard
        notification={{
          id: 'n-6',
          kind: 'game_started',
          payload: {
            game_id: '11111111-1111-1111-1111-111111111111',
            game_name: 'Byneset North',
          },
          read_at: null,
          created_at: '2026-05-24T13:30:00Z',
        }}
      />,
    );
    expect(screen.getByText(/Runden er i gang/)).toBeInTheDocument();
    expect(screen.getByText('Byneset North')).toBeInTheDocument();
  });

  it('rendrer auto_start_blocked med årsaks-tekst og generisk fallback', () => {
    const make = (reason: string): NotificationRow => ({
      id: `n-${reason}`,
      kind: 'auto_start_blocked',
      payload: {
        game_id: '11111111-1111-1111-1111-111111111111',
        game_name: 'Lørdagsmatch',
        reason,
      },
      read_at: null,
      created_at: '2026-05-24T13:30:00Z',
    });

    const { rerender } = render(
      <NotificationCard notification={make('incomplete_sides')} />,
    );
    expect(screen.getByText(/Runden kom ikke i gang/)).toBeInTheDocument();
    expect(
      screen.getByText(/Lørdagsmatch: sidene mangler spillere/),
    ).toBeInTheDocument();

    // Ukjent/fremtidig reason → generisk handlings-orientert fallback
    rerender(<NotificationCard notification={make('something_new')} />);
    expect(
      screen.getByText(/Lørdagsmatch: åpne spillet for å se hva som mangler/),
    ).toBeInTheDocument();
  });

  // #583: navn + lag-suffiks komponeres på render-tid (ikke i payloaden), så
  // en engelsk mottaker får engelsk tekst. Her testes nb-grenene.
  it('komponerer registration_request-navn: lag-kaptein, individuell og fallback', () => {
    const make = (
      payload: NotificationPayload<'registration_request'>,
    ): NotificationRow => ({
      id: 'n-rr',
      kind: 'registration_request',
      payload,
      read_at: null,
      created_at: '2026-05-24T13:30:00Z',
    });
    const base = {
      game_id: '11111111-1111-1111-1111-111111111111',
      game_name: 'Lagcup',
    };

    // Lag-kaptein → «(kaptein for …)» komponeres via captainOf-nøkkelen
    const { rerender } = render(
      <NotificationCard
        notification={make({ ...base, requester_name: 'Kari', team_name: 'Eagles' })}
      />,
    );
    expect(
      screen.getByText('Kari (kaptein for Eagles) vil bli med'),
    ).toBeInTheDocument();

    // Individuell påmelding (intet team_name) → bart navn
    rerender(
      <NotificationCard notification={make({ ...base, requester_name: 'Ola' })} />,
    );
    expect(screen.getByText('Ola vil bli med')).toBeInTheDocument();

    // Manglende navn → locale-fallback «En spiller»
    rerender(
      <NotificationCard notification={make({ ...base, requester_name: null })} />,
    );
    expect(screen.getByText('En spiller vil bli med')).toBeInTheDocument();
  });

  it('rendrer registration_rejected: reason_code lokaliseres, fritekst-reason verbatim', () => {
    const make = (
      payload: NotificationPayload<'registration_rejected'>,
    ): NotificationRow => ({
      id: 'n-rj',
      kind: 'registration_rejected',
      payload,
      read_at: null,
      created_at: '2026-05-24T13:30:00Z',
    });
    const base = {
      game_id: '11111111-1111-1111-1111-111111111111',
      game_name: 'Lagcup',
    };

    // App-generert grunn via reason_code → katalog-tekst (lag-fjerning)
    const { rerender } = render(
      <NotificationCard notification={make({ ...base, reason_code: 'team_removed' })} />,
    );
    expect(
      screen.getByText('Kapteinen fjernet deg fra laget.'),
    ).toBeInTheDocument();

    // Admin-fritekst → rendres verbatim
    rerender(
      <NotificationCard notification={make({ ...base, reason: 'For sent påmeldt' })} />,
    );
    expect(screen.getByText('For sent påmeldt')).toBeInTheDocument();
  });
});
