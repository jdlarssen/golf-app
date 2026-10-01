// #2265 PR 2: Kavalkaden. Type C — tilstandene skjermen kan være i, og det
// bare en render kan bekrefte: skjelettet uten ventetekst, «kommer»-kortet,
// forhåndsvisningen uten deling, den lagrede kavalkaden med «Del kortet» på
// kortene som kan deles, tomtilstanden og feillinja med «Prøv igjen».
 
import { fireEvent, render, screen } from '@testing-library/react-native';
import { fetchKavalkade } from '../data/kavalkade';
import type { ScreenProps } from '../navigation';
import { makeKavalkadeFacts } from '../test/kavalkadeFixtures';
import { Kavalkade } from './Kavalkade';

jest.mock('../data/kavalkade', () => ({
  fetchKavalkade: jest.fn(),
  logKavalkadeShare: jest.fn(async () => undefined),
}));
jest.mock('../lib/shareImage', () => ({ canShareImage: () => true, shareViewImage: jest.fn() }));

const fetchKavalkadeMock = fetchKavalkade as jest.Mock;

async function renderScreen() {
  await render(<Kavalkade {...({ navigation: {}, route: {} } as unknown as ScreenProps<'Kavalkade'>)} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Kavalkade', () => {
  it('shows the web’s skeleton, with no waiting text, while the first open waits', async () => {
    fetchKavalkadeMock.mockReturnValue(new Promise(() => undefined));
    await renderScreen();
    // Skjelettet er skjult for skjermleseren, som webbens.
  expect(screen.getByTestId('kavalkade-skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText(/setter sammen/)).toBeNull();
    expect(fetchKavalkadeMock).toHaveBeenCalledWith(2026);
  });

  it('says it comes on 24 December before the release', async () => {
    fetchKavalkadeMock.mockResolvedValue({ ok: true, view: { status: 'closed', opensAt: '2026-12-23T23:00:00.000Z' } });
    await renderScreen();
    expect(await screen.findByTestId('kavalkade-closed')).toHaveTextContent(
      'KAVALKADENKavalkaden kommer 24. desemberDa åpner golfåret ditt, kort for kort. Alt du spiller fram til julaften er med.',
    );
  });

  it('shows the admin preview with its banner and without share buttons', async () => {
    fetchKavalkadeMock.mockResolvedValue({ ok: true, view: { status: 'preview', facts: makeKavalkadeFacts() } });
    await renderScreen();
    expect(await screen.findByTestId('kavalkade-preview')).toHaveTextContent(
      'Forhåndsvisning. Bare du ser denne før 24. desember.',
    );
    expect(screen.getByTestId('kavalkade-heading')).toHaveTextContent('Golfåret 2026');
    expect(screen.getByTestId('kavalkade-card-year')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Del kortet' })).toBeNull();
  });

  it('shows the stored Kavalkade, with «Del kortet» on the cards that carry a fact', async () => {
    fetchKavalkadeMock.mockResolvedValue({
      ok: true,
      view: { status: 'ready', facts: makeKavalkadeFacts(), narrative: 'Et år å huske.' },
    });
    await renderScreen();
    expect(await screen.findByTestId('kavalkade-heading')).toHaveTextContent('Golfåret 2026');
    expect(screen.queryByTestId('kavalkade-preview')).toBeNull();
    expect(screen.getByTestId('kavalkade-narrative')).toHaveTextContent('Et år å huske.');
    // Seks kort i «Ditt år», alle med et faktum å dele.
    expect(screen.getAllByRole('button', { name: 'Del kortet' })).toHaveLength(6);

    // «Gjengen»: oppsummeringen er en opptelling og deles ikke (som på webben).
    await fireEvent.press(screen.getByRole('tab', { name: 'Gjengen' }));
    expect(screen.getAllByRole('button', { name: 'Del kortet' })).toHaveLength(4);
    expect(screen.queryByTestId('share-kavalkade-card-gang-summary')).toBeNull();
  });

  it('shows the web’s empty state without finished rounds', async () => {
    fetchKavalkadeMock.mockResolvedValue({
      ok: true,
      view: { status: 'ready', facts: makeKavalkadeFacts({ rounds: 0, personal: null, team: null, gang: null }), narrative: null },
    });
    await renderScreen();
    expect(await screen.findByTestId('kavalkade-empty')).toHaveTextContent(
      'KAVALKADENIngen ferdige runder i 2026Kavalkaden regner på runder som er levert. Blir det en runde i år, står den her.',
    );
  });

  it('shows an error line with «Prøv igjen» offline, and tries again', async () => {
    fetchKavalkadeMock.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    fetchKavalkadeMock.mockResolvedValueOnce({ ok: true, view: { status: 'closed', opensAt: 'x' } });
    await renderScreen();
    expect(await screen.findByTestId('kavalkade-error')).toHaveTextContent('Fikk ikke hentet Kavalkaden. Prøv igjen.');
    await fireEvent.press(screen.getByTestId('kavalkade-retry'));
    expect(await screen.findByTestId('kavalkade-closed')).toBeTruthy();
  });
});
