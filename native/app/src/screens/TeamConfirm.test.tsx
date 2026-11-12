// #2840 del 3: bekreftelsene på lagsiden (Type C). Tekstene har egne Type A-tester.
// Her låses det skjermene svarer for: knappen sender, og etterpå går skjermen tilbake
// til lagsiden (`backTo`); «Avbryt» går tilbake uten å sende; en feil står over knappen.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TeamPageActionResult } from '../data/teamPage';
import type { ScreenProps } from '../navigation';
import { stackNavigation } from '../test/stackNavigation';
import { TeamRemoveConfirm, TeamTransferConfirm } from './TeamConfirm';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/teamPage', () => ({
  removeTeammate: jest.fn(async () => mockAction),
  transferCaptaincy: jest.fn(async () => mockAction),
}));

let mockAction: TeamPageActionResult;
const { removeTeammate, transferCaptaincy } = jest.requireMock('../data/teamPage') as {
  removeTeammate: jest.Mock;
  transferCaptaincy: jest.Mock;
};

const SHORT_ID = 'abcd2345';
const PAGE = { name: 'TeamPage', params: { shortId: SHORT_ID } };
const PARAMS = { shortId: SHORT_ID, requestId: 'r-kari', name: 'Kari Nord', teamName: 'Birdie-jegerne' };

async function renderConfirm(which: 'remove' | 'transfer') {
  const name = which === 'remove' ? 'TeamRemoveConfirm' : 'TeamTransferConfirm';
  const params = which === 'remove' ? { ...PARAMS, pending: true } : PARAMS;
  const navigation = { ...stackNavigation([{ name: 'Home' }, PAGE, { name, params }]), goBack: jest.fn() };
  const props = { navigation, route: { key: name, name, params } };
  await render(
    which === 'remove' ? (
      <TeamRemoveConfirm {...(props as unknown as ScreenProps<'TeamRemoveConfirm'>)} />
    ) : (
      <TeamTransferConfirm {...(props as unknown as ScreenProps<'TeamTransferConfirm'>)} />
    ),
  );
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe.each([
  ['remove', 'team-remove', () => removeTeammate, 'removed'],
  ['transfer', 'team-transfer', () => transferCaptaincy, 'transferred'],
] as const)('%s', (which, id, send, status) => {
  it('knappen sender, og skjermen går tilbake til lagsiden', async () => {
    mockAction = { ok: true, status };
    const navigation = await renderConfirm(which);
    await fireEvent.press(screen.getByTestId(`${id}-confirm`));
    expect(send()).toHaveBeenCalledWith(SHORT_ID, 'r-kari');
    expect(navigation.popTo).toHaveBeenCalledWith('TeamPage', { shortId: SHORT_ID });
  });

  it('«Avbryt» går tilbake uten å sende', async () => {
    const navigation = await renderConfirm(which);
    await fireEvent.press(screen.getByTestId(`${id}-cancel`));
    expect(navigation.goBack).toHaveBeenCalled();
    expect(send()).not.toHaveBeenCalled();
  });

  it('uten nett står feilen, knappen sier «Prøv igjen», og skjermen blir stående', async () => {
    mockAction = { ok: false, reason: 'network' };
    const navigation = await renderConfirm(which);
    await fireEvent.press(screen.getByTestId(`${id}-confirm`));
    expect(screen.getByTestId(`${id}-error`)).toBeTruthy();
    expect(screen.getByTestId(`${id}-confirm`)).toHaveTextContent('Prøv igjen');
    expect(navigation.popTo).not.toHaveBeenCalled();
  });
});

it('en gjest kan ikke bli kaptein: serverens nei står på bekreftelsen', async () => {
  mockAction = { ok: false, reason: 'captain_is_guest' };
  const navigation = await renderConfirm('transfer');
  await fireEvent.press(screen.getByTestId('team-transfer-confirm'));
  expect(screen.getByTestId('team-transfer-error')).toHaveTextContent('En gjest kan ikke være kaptein.');
  expect(navigation.popTo).not.toHaveBeenCalled();
});
