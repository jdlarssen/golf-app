import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PåmeldingerClient } from './PåmeldingerClient';
import type { RequestRow } from './types';

vi.mock('./actions', () => ({
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
}));

const GAME_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest(overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'req-' + Math.random().toString(36).slice(2),
    userId: 'user-' + Math.random().toString(36).slice(2),
    status: 'pending',
    displayName: 'Anna Hansen',
    teamName: null,
    isTeamCaptain: false,
    teamRequestId: null,
    message: null,
    rejectionReason: null,
    createdAt: '2026-05-26T10:00:00Z',
    decidedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PåmeldingerClient — pending tab', () => {
  it('viser approve + avvis-knapper for pending solo-request', () => {
    render(
      <PåmeldingerClient
        gameId={GAME_ID}
        requests={[makeRequest({ displayName: 'Anna Hansen' })]}
        tab="pending"
        locked={false}
      />,
    );
    expect(screen.getByText('Anna Hansen')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Godkjenn' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Avvis' })).toBeInTheDocument();
  });

  it('rendrer message-quote når søker har lagt ved hilsen', () => {
    render(
      <PåmeldingerClient
        gameId={GAME_ID}
        requests={[
          makeRequest({
            message: 'Spennende å være med på første runden!',
          }),
        ]}
        tab="pending"
        locked={false}
      />,
    );
    expect(
      screen.getByText(/Spennende å være med/),
    ).toBeInTheDocument();
  });

  it('grupperer kaptein-rad med team-medlem under', () => {
    const captain = makeRequest({
      id: 'cap-1',
      displayName: 'Kaptein Per',
      isTeamCaptain: true,
      teamName: 'Albatross',
    });
    const mate = makeRequest({
      id: 'mate-1',
      displayName: 'Medspiller Kari',
      teamRequestId: 'cap-1',
    });
    render(
      <PåmeldingerClient
        gameId={GAME_ID}
        requests={[captain, mate]}
        tab="pending"
        locked={false}
      />,
    );
    expect(screen.getByText(/Albatross/)).toBeInTheDocument();
    expect(screen.getByText('Kaptein Per')).toBeInTheDocument();
    expect(screen.getByText('Medspiller Kari')).toBeInTheDocument();
    // Kaptein-badgen vises kun på kapteins-raden.
    expect(screen.getByText('Kaptein')).toBeInTheDocument();
  });

  it('åpner reject-modal når Avvis-knappen klikkes', () => {
    render(
      <PåmeldingerClient
        gameId={GAME_ID}
        requests={[makeRequest({ displayName: 'Anna Hansen' })]}
        tab="pending"
        locked={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Avvis' }));
    expect(
      screen.getByText(/Avvis påmelding fra Anna Hansen/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Valgfri begrunnelse/i),
    ).toBeInTheDocument();
  });

  it('tom-tilstand når listen er tom', () => {
    render(
      <PåmeldingerClient
        gameId={GAME_ID}
        requests={[]}
        tab="pending"
        locked={false}
      />,
    );
    expect(
      screen.getByText('Ingen påmeldinger venter på godkjenning.'),
    ).toBeInTheDocument();
  });
});

describe('PåmeldingerClient — approved tab (read-only)', () => {
  it('skjuler approve/avvis-knapper for approved-rader', () => {
    render(
      <PåmeldingerClient
        gameId={GAME_ID}
        requests={[
          makeRequest({
            status: 'approved',
            displayName: 'Anna Hansen',
            decidedAt: '2026-05-26T11:00:00Z',
          }),
        ]}
        tab="approved"
        locked={false}
      />,
    );
    expect(screen.getByText('Anna Hansen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Godkjenn' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Avvis' })).toBeNull();
    expect(screen.getByText('Godkjent')).toBeInTheDocument();
  });

  it('viser rejection-reason på avviste rader', () => {
    render(
      <PåmeldingerClient
        gameId={GAME_ID}
        requests={[
          makeRequest({
            status: 'rejected',
            rejectionReason: 'Fullt allerede',
            decidedAt: '2026-05-26T11:00:00Z',
          }),
        ]}
        tab="rejected"
        locked={false}
      />,
    );
    expect(screen.getByText(/Begrunnelse: Fullt allerede/)).toBeInTheDocument();
  });
});

describe('PåmeldingerClient — locked', () => {
  it('skjuler approve/avvis-knapper når spillet er låst', () => {
    render(
      <PåmeldingerClient
        gameId={GAME_ID}
        requests={[makeRequest({ status: 'pending' })]}
        tab="pending"
        locked
      />,
    );
    expect(screen.queryByRole('button', { name: 'Godkjenn' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Avvis' })).toBeNull();
  });
});
