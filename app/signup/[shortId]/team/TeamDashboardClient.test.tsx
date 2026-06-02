import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamDashboardClient } from './TeamDashboardClient';

// Server-actions er irrelevante her — vi tester bare den mode-aware
// neste-steg-copyen (#362, K5). Stubbes så importen ikke drar inn
// 'use server'-moduler i jsdom.
vi.mock('../teamActions', () => ({
  acceptTeamInvite: vi.fn(),
  declineTeamInvite: vi.fn(),
  removeTeamMember: vi.fn(),
  resendTeamInvite: vi.fn(),
  attachToCaptainTeam: vi.fn(),
}));

const SHORT_ID = 'abc12345';

describe('TeamDashboardClient — mode-aware «bli med»-copy', () => {
  it('invited_unknown + instant forklarer at du blir med med en gang', () => {
    render(
      <TeamDashboardClient
        mode="invited_unknown"
        shortId={SHORT_ID}
        invitationId="inv-1"
        joinEffect="instant"
      />,
    );
    expect(screen.getByText(/med i spillet med en gang/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Bli med på lag/i }),
    ).toBeInTheDocument();
  });

  it('invited_unknown + approval forklarer at arrangøren må godkjenne', () => {
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
