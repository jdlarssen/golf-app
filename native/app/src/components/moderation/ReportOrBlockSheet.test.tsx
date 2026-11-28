// #3019: arket «Rapporter eller blokker». Testene sjekker at hvert valg når
// riktig kall med riktig mål, og at kvitteringen og utfallet stemmer.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReportOrBlockSheet } from './ReportOrBlockSheet';
import { blockUser } from '../../data/blocks';
import { submitReport } from '../../data/reports';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../data/blocks', () => ({ blockUser: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../data/reports', () => ({ submitReport: jest.fn(async () => ({ ok: true })) }));

const blockMock = blockUser as jest.Mock;
const reportMock = submitReport as jest.Mock;
const KARI = { userId: 'kari', name: 'Kari Nordmann' };

beforeEach(() => {
  jest.clearAllMocks();
  blockMock.mockResolvedValue({ ok: true });
  reportMock.mockResolvedValue({ ok: true });
});

describe('ReportOrBlockSheet', () => {
  it('rapporterer en person med grunn og tekst, og blokkerer også når bryteren står på', async () => {
    const onClose = jest.fn();
    await render(<ReportOrBlockSheet subject={{ kind: 'person', person: KARI }} onClose={onClose} />);

    await fireEvent.press(screen.getByTestId('moderation-choose-report'));
    await fireEvent.press(screen.getByTestId('moderation-reason-harassment'));
    await fireEvent.changeText(screen.getByTestId('moderation-note'), 'Stygge lagnavn hver uke');
    await fireEvent(screen.getByTestId('moderation-also-block'), 'onValueChange', true);
    await fireEvent.press(screen.getByTestId('moderation-send'));

    expect(reportMock).toHaveBeenCalledWith({ kind: 'user', userId: 'kari' }, 'harassment', 'Stygge lagnavn hver uke');
    expect(blockMock).toHaveBeenCalledWith('kari');
    expect(screen.getByTestId('moderation-done-title')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('moderation-done'));
    expect(onClose).toHaveBeenCalledWith('blocked');
  });

  it('blokkerer først etter ja i spørsmålet, og sier «blocked» når arket lukkes', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const onClose = jest.fn();
    await render(<ReportOrBlockSheet subject={{ kind: 'person', person: KARI }} onClose={onClose} />);

    await fireEvent.press(screen.getByTestId('moderation-choose-block'));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(blockMock).toHaveBeenCalledWith('kari');
    expect(reportMock).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('moderation-done'));
    expect(onClose).toHaveBeenCalledWith('blocked');
    alert.mockRestore();
  });

  it('en runde fra påmeldingen går rett til rapporten, med lenke-id-en og uten blokkering', async () => {
    await render(
      <ReportOrBlockSheet
        subject={{ kind: 'round', target: { kind: 'gameShortId', shortId: 'k7m3p9qx' }, roundName: 'Lørdag', players: [] }}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('moderation-also-block')).toBeNull();
    await fireEvent.press(screen.getByTestId('moderation-send'));
    expect(reportMock).toHaveBeenCalledWith({ kind: 'gameShortId', shortId: 'k7m3p9qx' }, 'offensive', '');
  });

  it('fra startbilletten: velg en spiller, og arket blir valget for den personen', async () => {
    await render(
      <ReportOrBlockSheet
        subject={{ kind: 'round', target: { kind: 'game', gameId: 'g1' }, roundName: 'Lørdag', players: [KARI] }}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('moderation-pick-player-kari'));
    await fireEvent.press(screen.getByTestId('moderation-choose-report'));
    await fireEvent.press(screen.getByTestId('moderation-send'));
    expect(reportMock).toHaveBeenCalledWith({ kind: 'user', userId: 'kari' }, 'offensive', '');
  });

  it('en rapport som ikke gikk, står igjen med grunnen og uten kvittering', async () => {
    reportMock.mockResolvedValue({ ok: false, reason: 'rate_limited' });
    await render(<ReportOrBlockSheet subject={{ kind: 'person', person: KARI }} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('moderation-choose-report'));
    await fireEvent.press(screen.getByTestId('moderation-send'));
    expect(screen.getByTestId('moderation-error')).toBeTruthy();
    expect(screen.queryByTestId('moderation-done-title')).toBeNull();
  });
});
