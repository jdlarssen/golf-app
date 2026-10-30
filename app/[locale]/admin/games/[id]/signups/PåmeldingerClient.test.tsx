import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { PåmeldingerClient } from './PåmeldingerClient';
import type { RequestRow } from './types';

const transferTeamCaptaincyMock = vi.fn();
vi.mock('./actions', () => ({
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
  transferTeamCaptaincy: (...args: unknown[]) => transferTeamCaptaincyMock(...args),
}));

const GAME_ID = '11111111-1111-1111-1111-111111111111';
const RENDERED_AT = '2026-05-26T12:00:00Z';
const REJECT = /^Avvis/;

function makeRequest(overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'req-' + Math.random().toString(36).slice(2),
    userId: 'user-' + Math.random().toString(36).slice(2),
    status: 'pending',
    displayName: 'Anna Hansen',
    userName: 'Anna Hansen',
    hcpIndex: null,
    isGuest: false,
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

type View = 'pending' | 'approved' | 'rejected' | 'withdrawn';

function renderClient(requests: RequestRow[], view: View = 'pending', locked = false) {
  return render(
    <PåmeldingerClient
      gameId={GAME_ID}
      requests={requests}
      view={view}
      locked={locked}
      capacity={null}
      activeRosterUserIds={[]}
      headingCount={requests.length}
      renderedAt={RENDERED_AT}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PåmeldingerClient — innkurven', () => {
  it('viser kortet med Godkjenn og Avvis …, og Godkjenn peker på søkeren', () => {
    renderClient([makeRequest({ displayName: 'Anna Hansen' })]);
    const card = screen.getByRole('listitem');
    expect(within(card).getByText('Anna Hansen')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Godkjenn' });
    expect(approve).toHaveAccessibleDescription('Anna Hansen');
    expect(screen.getByRole('button', { name: REJECT })).toBeInTheDocument();
  });

  it('rendrer hilsenen når søkeren har lagt ved en', () => {
    renderClient([makeRequest({ message: 'Spennende å være med på første runden!' })]);
    expect(screen.getByText(/Spennende å være med/)).toBeInTheDocument();
  });

  it('et lag er ett kort med lagnavnet og «Godkjenn laget»', () => {
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
    renderClient([captain, mate]);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Lag: Albatross')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Godkjenn laget' });
    expect(approve).toHaveAccessibleDescription('Lag: Albatross Kaptein Per og Medspiller Kari');
  });

  it('åpner avvis-dialogen når Avvis … trykkes', () => {
    renderClient([makeRequest({ displayName: 'Anna Hansen' })]);
    fireEvent.click(screen.getByRole('button', { name: REJECT }));
    expect(screen.getByText(/Avvis påmelding fra Anna Hansen/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Valgfri begrunnelse/i)).toBeInTheDocument();
  });

  it('avvis-dialogen for et lag nevner lagnavnet', () => {
    const captain = makeRequest({
      id: 'cap-1',
      displayName: 'Kaptein Per',
      isTeamCaptain: true,
      teamName: 'Albatross',
    });
    renderClient([captain, makeRequest({ teamRequestId: 'cap-1' })]);
    fireEvent.click(screen.getByRole('button', { name: REJECT }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Hele laget «Albatross» blir avvist samtidig.');
  });

  it('avvis-dialogen tar fokus og lukkes med Escape (#1590)', () => {
    renderClient([makeRequest({ displayName: 'Anna Hansen' })]);
    const trigger = screen.getByRole('button', { name: REJECT });
    act(() => trigger.focus());
    fireEvent.click(trigger);

    // Tastatur-/skjermleserbruker lander på begrunnelses-feltet — ikke bak
    // dialogen, og ikke på det skjulte honeypot-feltet som står først i formen.
    expect(screen.getByRole('textbox')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });

    // Dialogen er borte, og fokus er tilbake på knappen som åpnet den.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('tom kø', () => {
    renderClient([]);
    expect(screen.getByText('Ingen påmeldinger venter på godkjenning.')).toBeInTheDocument();
  });
});

describe('PåmeldingerClient — historikken', () => {
  it('godkjente kort har verken Godkjenn eller Avvis …', () => {
    renderClient(
      [makeRequest({ status: 'approved', displayName: 'Anna Hansen', decidedAt: '2026-05-26T11:00:00Z' })],
      'approved',
    );
    expect(screen.getByText('Anna Hansen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Godkjenn' })).toBeNull();
    expect(screen.queryByRole('button', { name: REJECT })).toBeNull();
  });

  it('viser begrunnelsen på avviste kort', () => {
    renderClient(
      [makeRequest({ status: 'rejected', rejectionReason: 'Fullt allerede', decidedAt: '2026-05-26T11:00:00Z' })],
      'rejected',
    );
    expect(screen.getByText(/Begrunnelse: Fullt allerede/)).toBeInTheDocument();
  });
});

describe('PåmeldingerClient — låst', () => {
  it('skjuler Godkjenn og Avvis … når spillet er låst', () => {
    renderClient([makeRequest({ status: 'pending' })], 'pending', true);
    expect(screen.getByText('Anna Hansen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Godkjenn' })).toBeNull();
    expect(screen.queryByRole('button', { name: REJECT })).toBeNull();
  });
});

// #2358: arrangøren utpeker ny kaptein blant dem som står på laget. Knappen
// står bare på lagmedlemmer i godkjent-visningen, og ingenting skjer før
// bekreftelsen.
describe('PåmeldingerClient — gjør til kaptein (#2358)', () => {
  it('bekreft på samme skjerm, så overføring til akkurat det lagmedlemmet', async () => {
    const captain = makeRequest({
      id: 'req-cap',
      status: 'approved',
      displayName: 'Kari',
      isTeamCaptain: true,
      teamName: 'Bjørka',
    });
    const mate = makeRequest({
      id: 'req-ola',
      status: 'approved',
      displayName: 'Ola',
      teamName: 'Bjørka',
      teamRequestId: 'req-cap',
    });
    // #2607: an approved guest on the team never gets the button.
    const guest = makeRequest({
      id: 'req-gjest',
      status: 'approved',
      displayName: 'Gunn Gjest',
      teamName: 'Bjørka',
      teamRequestId: 'req-cap',
      isGuest: true,
    });
    const view = (requests: RequestRow[]) => (
      <PåmeldingerClient
        gameId={GAME_ID}
        requests={requests}
        view="approved"
        locked={false}
        capacity={null}
        activeRosterUserIds={[]}
        headingCount={2}
        renderedAt={RENDERED_AT}
      />
    );
    const { rerender } = render(view([captain, mate, guest]));

    expect(screen.getAllByTestId('make-captain')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('make-captain'));
    expect(transferTeamCaptaincyMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('make-captain-confirm-button'));
    });
    expect(transferTeamCaptaincyMock).toHaveBeenCalledWith(GAME_ID, 'req-ola');

    // Serveren svarer med en ny rendering (omdirigering med ?status eller
    // ?error). Da skal knappen være klar igjen, ikke stå fast på «Lagrer …».
    rerender(view([{ ...captain }, { ...mate }, { ...guest }]));
    expect(screen.queryByTestId('make-captain-confirm')).toBeNull();
    expect(screen.getAllByTestId('make-captain')).toHaveLength(1);
  });
});
