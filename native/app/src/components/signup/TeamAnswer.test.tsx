// #2840: svaret på laginvitasjonen, «Sendt» og «Runden er full» (Type C). Tekstene og
// hvem som er deg har Type A-tester (`teamSignupCopy.test.ts`, `teamLineup.test.ts`).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AppTeamSignupInvited } from '../../../../../lib/games/appRoundInviteView';
import type { TeamSignupResult } from '../../data/roundInvite';
import { ROUND_INVITE_TEXT } from '../../lib/roundInviteCopy';
import { TEAM_SIGNUP_TEXT, inviteBody } from '../../lib/teamSignupCopy';
import { TeamInviteAnswer, TeamRoundFull, TeamSent } from './TeamAnswer';

jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());
jest.mock('../../session', () => ({
  useSession: () => ({ userId: 'me', email: 'martin@example.com' }),
}));
jest.mock('../../data/profile', () => ({
  fetchOwnProfile: jest.fn(async () => ({ name: 'Martin Berg' })),
}));
jest.mock('../../data/roundInvite', () => ({
  acceptTeamInvite: jest.fn(async () => mockAnswer),
  declineTeamInvite: jest.fn(async () => mockAnswer),
}));
const mockOpenWeb = jest.fn(async () => ({ ok: true }));
jest.mock('../../lib/webLink', () => ({
  ...jest.requireActual('../../lib/webLink'),
  openWeb: (path: string) => (mockOpenWeb as unknown as (path: string) => Promise<unknown>)(path),
}));

let mockAnswer: TeamSignupResult;
const { acceptTeamInvite, declineTeamInvite } = jest.requireMock('../../data/roundInvite') as {
  acceptTeamInvite: jest.Mock;
  declineTeamInvite: jest.Mock;
};

const ROUND = {
  name: 'Onsdagsgolfen',
  modeLabel: 'Texas scramble',
  courseName: 'Byneset',
  teeName: null,
  teeOffAt: '2026-11-19T17:30:00.000Z',
  entryFeeKr: 0,
};

const INVITED: AppTeamSignupInvited = {
  kind: 'invited',
  requestId: 'req-1',
  captainName: 'Kari Nord',
  teamName: 'Birdie-jegerne',
  joinEffect: 'instant',
  members: [
    { name: 'Kari Nord', isCaptain: true, isYou: false, status: 'approved' },
    { name: 'Ola Kompis', isCaptain: false, isYou: false, status: 'approved' },
    { name: 'Martin Berg', isCaptain: false, isYou: true, status: 'pending' },
    { name: 'Per Hansen', isCaptain: false, isYou: false, status: 'pending' },
  ],
};

const onDone = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockAnswer = { ok: true, status: 'team_accepted' };
});

describe('svaret på invitasjonen', () => {
  it('lagnavnet, runden, oppstillingen med kapteinen og deg, og hva et ja gjør', async () => {
    await render(<TeamInviteAnswer shortId="k3x9pq" round={ROUND} invited={INVITED} onDone={onDone} />);
    expect(screen.getByTestId('team-invite-title')).toHaveTextContent('Birdie-jegerne');
    expect(screen.getByTestId('team-invite-place')).toHaveTextContent('Onsdagsgolfen · tor 19. nov kl. 17:30');
    expect(screen.getByTestId('team-invite-member-0')).toHaveTextContent(`KN${TEAM_SIGNUP_TEXT.captainBadge}Kari`);
    expect(await screen.findByTestId('team-invite-self')).toHaveTextContent(`?${TEAM_SIGNUP_TEXT.you}`);
    expect(screen.getByTestId('team-invite-member-3')).toHaveTextContent('PHPer');
    expect(screen.getByTestId('team-invite-ask')).toHaveTextContent('Kari vil ha deg med på laget');
    expect(screen.getByTestId('team-invite-effect')).toHaveTextContent(inviteBody('instant'));
  });

  it('ved godkjenning sier teksten at arrangøren bestemmer', async () => {
    await render(
      <TeamInviteAnswer shortId="k3x9pq" round={ROUND} invited={{ ...INVITED, joinEffect: 'approval' }} onDone={onDone} />,
    );
    expect(screen.getByTestId('team-invite-effect')).toHaveTextContent(inviteBody('approval'));
  });

  it.each([
    ['team-invite-accept', acceptTeamInvite],
    ['team-invite-decline', declineTeamInvite],
  ])('%s sender din forespørsel, og skjermen spør på nytt', async (testID, call) => {
    await render(<TeamInviteAnswer shortId="k3x9pq" round={ROUND} invited={INVITED} onDone={onDone} />);
    await fireEvent.press(screen.getByTestId(testID));
    expect(call).toHaveBeenCalledWith('k3x9pq', 'req-1');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('uten nett står feilen, og knappen du trykket sier «Prøv igjen»', async () => {
    mockAnswer = { ok: false, reason: 'offline' };
    await render(<TeamInviteAnswer shortId="k3x9pq" round={ROUND} invited={INVITED} onDone={onDone} />);
    await fireEvent.press(screen.getByTestId('team-invite-accept'));
    expect(screen.getByTestId('team-invite-error')).toBeTruthy();
    expect(screen.getByTestId('team-invite-accept')).toHaveTextContent(ROUND_INVITE_TEXT.retry);
    expect(screen.getByTestId('team-invite-decline')).toHaveTextContent(TEAM_SIGNUP_TEXT.noThanks);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('en forespørsel som er borte, gir ny lasting', async () => {
    mockAnswer = { ok: false, reason: 'not_found' };
    await render(<TeamInviteAnswer shortId="k3x9pq" round={ROUND} invited={INVITED} onDone={onDone} />);
    await fireEvent.press(screen.getByTestId('team-invite-decline'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('sendt til arrangøren', () => {
  it('svaret per venn, og «Se laget» åpner lagsiden på nettet', async () => {
    await render(
      <TeamSent
        shortId="k3x9pq"
        round={ROUND}
        sent={{
          teamName: 'Birdie-jegerne',
          rows: [
            { userId: 'ola', name: 'Ola Kompis', result: { ok: true, userId: 'ola', name: 'Ola Kompis' } },
            {
              userId: 'per',
              name: 'Per Hansen',
              result: { ok: false, userId: 'per', name: 'Per Hansen', reason: 'alreadyRegistered' },
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('team-sent-name')).toHaveTextContent('Birdie-jegerne');
    expect(screen.getByTestId('team-sent-title')).toHaveTextContent(TEAM_SIGNUP_TEXT.sentTitle);
    expect(screen.getByTestId('team-sent-row-ola')).toHaveTextContent(`OKOla Kompis${TEAM_SIGNUP_TEXT.willBeNotified}`);
    expect(screen.getByTestId('team-sent-row-per-failed')).toHaveTextContent(TEAM_SIGNUP_TEXT.slotAlreadyRegistered);
    await fireEvent.press(screen.getByTestId('team-sent-see-team'));
    expect(mockOpenWeb).toHaveBeenCalledWith('/signup/k3x9pq/team');
  });
});

describe('runden er full', () => {
  it('runden, plassene og setningen, uten knapp', async () => {
    await render(<TeamRoundFull view={{ round: ROUND, seats: { kind: 'capped', cap: 12, held: 12 } }} />);
    expect(screen.getByTestId('team-full-title')).toHaveTextContent('Onsdagsgolfen');
    expect(screen.getByTestId('team-full-place')).toHaveTextContent('Tor 19. nov kl. 17:30 · 12 av 12 plasser · fullt');
    expect(screen.getByTestId('team-full-body')).toHaveTextContent(TEAM_SIGNUP_TEXT.full);
  });
});
