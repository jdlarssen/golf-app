// #2748: invitasjonen som skjerm (Type C). Reglene er på serveren
// (`lib/auth/openInvitation.test.ts`). Her låses det skjermen svarer for: at et spill
// åpnes etter tilbake-regelen, og at ingen tilstand blir en tom skjerm.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { InvitationLinkResult } from '../data/invitationLink';
import { INVITATION_LINK_TEXT } from '../lib/invitationLinkCopy';
import type { ScreenProps } from '../navigation';
import { stackNavigation } from '../test/stackNavigation';
import { InvitationLink } from './InvitationLink';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/invitationLink', () => ({
  openInvitationLink: jest.fn(async () => mockResult),
}));

let mockResult: InvitationLinkResult | Promise<InvitationLinkResult> = { ok: true, gameId: 'g1' };

const { openInvitationLink } = jest.requireMock('../data/invitationLink') as { openInvitationLink: jest.Mock };

const TOKEN = '44444444-4444-4444-8444-444444444444';
const LINK_ROUTE = { name: 'InvitationLink', params: { token: TOKEN } };

async function renderLink(routes: Array<{ name: string; params?: object }> = [{ name: 'Home' }, LINK_ROUTE]) {
  const navigation = { ...stackNavigation(routes), popToTop: jest.fn() };
  const props = { navigation, route: { key: 'link', name: 'InvitationLink', params: { token: TOKEN } } };
  await render(<InvitationLink {...(props as unknown as ScreenProps<'InvitationLink'>)} />);
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResult = { ok: true, gameId: 'g1' };
});

describe('invitasjonen gir et spill', () => {
  it('[Hjem, Invitasjon] blir [Hjem, Spillet]', async () => {
    const navigation = await renderLink();
    expect(openInvitationLink).toHaveBeenCalledWith(TOKEN);
    expect(navigation.replace).toHaveBeenCalledWith('GameHome', { gameId: 'g1' });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('ligger spillet alt under, går du tilbake til det: ingen kopi', async () => {
    const navigation = await renderLink([{ name: 'Home' }, { name: 'GameHome', params: { gameId: 'g1' } }, LINK_ROUTE]);
    expect(navigation.popTo).toHaveBeenCalledWith('GameHome', { gameId: 'g1' });
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe('invitasjonen gir ikke et spill', () => {
  it.each([
    ['started', INVITATION_LINK_TEXT.started],
    ['no_game', INVITATION_LINK_TEXT.noGame],
    ['other_account', INVITATION_LINK_TEXT.otherAccount],
    ['not_found', INVITATION_LINK_TEXT.notFound],
  ] as const)('%s: egen tekst og vei til Hjem', async (outcome, text) => {
    mockResult = { ok: false, outcome };
    const navigation = await renderLink();
    expect(screen.getByTestId(`invitation-link-${outcome}`)).toHaveTextContent(text);
    expect(navigation.replace).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('invitation-link-home'));
    expect(navigation.popToTop).toHaveBeenCalled();
  });
});

describe('uten svar', () => {
  it('mens kallet går, står lastelinja', async () => {
    mockResult = new Promise(() => {});
    await renderLink();
    expect(screen.getByTestId('invitation-link-opening')).toBeTruthy();
  });

  it('nettfeil: teksten og «Prøv igjen», som spør på nytt', async () => {
    mockResult = { ok: false, reason: 'network' };
    const navigation = await renderLink();
    expect(screen.getByTestId('invitation-link-failed')).toHaveTextContent(INVITATION_LINK_TEXT.openFailed);

    mockResult = { ok: true, gameId: 'g1' };
    await fireEvent.press(screen.getByTestId('invitation-link-retry'));
    expect(openInvitationLink).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledWith('GameHome', { gameId: 'g1' });
  });
});
