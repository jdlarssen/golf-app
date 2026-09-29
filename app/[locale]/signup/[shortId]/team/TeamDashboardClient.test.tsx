import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TeamDashboardClient } from './TeamDashboardClient';

// Server-actions er irrelevante her — vi tester bare den mode-aware
// neste-steg-copyen (#362, K5). Stubbes så importen ikke drar inn
// 'use server'-moduler i jsdom.
const transferCaptaincyMock = vi.fn(async () => ({ ok: true as const }));
vi.mock('../teamActions', () => ({
  acceptTeamInvite: vi.fn(),
  declineTeamInvite: vi.fn(),
  removeTeamMember: vi.fn(),
  resendTeamInvite: vi.fn(),
  attachToCaptainTeam: vi.fn(),
  transferCaptaincy: (...args: unknown[]) => transferCaptaincyMock(...(args as [])),
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const SHORT_ID = 'abc12345';

describe('TeamDashboardClient — mode-aware «bli med»-copy', () => {
  it('invited_unknown + instant navngir laget og kapteinen når serveren vet hvem som inviterte', () => {
    render(
      <TeamDashboardClient
        mode="invited_unknown"
        shortId={SHORT_ID}
        invitationId="inv-1"
        joinEffect="instant"
        teamName="Birdie-jegerne"
        captainName="Kaptein Sabeltann"
      />,
    );
    // #1343: sikkert treff på invited_by → laget og kapteinen navngis.
    expect(
      screen.getByText(/Kaptein Sabeltann vil ha deg med på laget Birdie-jegerne/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/med i spillet med en gang/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Bli med på lag/i }),
    ).toBeInTheDocument();
  });

  // #1343: er serveren usikker på hvilket lag invitasjonen gjelder, rendres
  // ikke denne modusen i det hele tatt — siden stopper med «Vi fant ikke laget
  // ditt». Modusen uten lag-navn står igjen for laget som mangler navn.
  it('invited_unknown uten lagnavn holder teksten generisk', () => {
    render(
      <TeamDashboardClient
        mode="invited_unknown"
        shortId={SHORT_ID}
        invitationId="inv-1"
        joinEffect="approval"
      />,
    );
    expect(
      screen.getByText(/Arrangøren må godkjenne laget/i),
    ).toBeInTheDocument();
    // Ingen props → ingen lag-navngiving (vi gjetter aldri).
    expect(screen.queryByText(/vil ha deg med på laget/i)).toBeNull();
  });

  it('member pending + approval sier at laget må godkjennes før påmelding', () => {
    render(
      <TeamDashboardClient
        mode="member"
        shortId={SHORT_ID}
        myRowId="row-1"
        myStatus="pending"
        joinEffect="approval"
        captain={{
          requestId: 'cap-1',
          userId: 'u-cap',
          displayName: 'Kaptein Sabeltann',
          status: 'pending',
        }}
        members={[]}
      />,
    );
    expect(screen.getByText(/Kapteinen har invitert deg/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Sier du ja.*godkjenne laget/i),
    ).toBeInTheDocument();
  });
});

// #2358: kapteinen gir bindet videre fra lagsida. Knappen står bare på en
// medspiller som er med i spillet, og ingenting skjer før bekreftelsen.
describe('TeamDashboardClient — gi kapteinsbindet videre (#2358)', () => {
  it('bekreft på samme skjerm, så overføring til akkurat den medspilleren', async () => {
    render(
      <TeamDashboardClient
        mode="captain"
        shortId={SHORT_ID}
        myRowId="cap-1"
        myStatus="approved"
        joinEffect="instant"
        captain={{ requestId: 'cap-1', userId: 'u-cap', displayName: 'Kari', status: 'approved' }}
        members={[
          { requestId: 'req-ola', userId: 'u-ola', displayName: 'Ola', status: 'approved' },
          { requestId: 'req-per', userId: 'u-per', displayName: 'Per', status: 'pending' },
        ]}
      />,
    );

    // Bare den godkjente medspilleren får knappen.
    expect(screen.getAllByTestId('make-captain')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('make-captain'));
    expect(transferCaptaincyMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('make-captain-confirm-button'));
    await vi.waitFor(() =>
      expect(transferCaptaincyMock).toHaveBeenCalledWith('req-ola', SHORT_ID),
    );
  });
});
