// #2894 PR 2: banneret på Hjem. Type C — tilstandene fra tegningen (noen andres slag,
// ditt eget, to slag samme uke, stor tekst), × som lukker og huskes per slag, ett nytt slag
// som gir nytt banner, én etikett for hele banneret, og at en feil ikke gir noe banner.
// Reglene for 7 dager og «+1 til» er låst i `lib/aeresliste.test.ts` (Type A); at det
// lukkede slaget huskes på telefonen, i `data/aeresliste.test.ts`.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import type { AereslisteRow } from '../../../../../lib/stats/aeresliste';
import { closeRareShot, fetchAeresliste } from '../../data/aeresliste';
import { localDayKey } from '../../lib/homeDates';
import { RareShotBanner } from './RareShotBanner';

jest.mock('@react-navigation/native', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

// Navnet må starte med `mock`: jest.mock-fabrikkene heises over importene.
let mockClosed: string | null = null;
jest.mock('../../data/aeresliste', () => ({
  fetchAeresliste: jest.fn(),
  readClosedRareShot: jest.fn(async () => mockClosed),
  closeRareShot: jest.fn(async (key: string) => {
    mockClosed = key;
  }),
}));

const fetchMock = fetchAeresliste as jest.Mock;

const daysAgo = (days: number) => localDayKey(new Date(Date.now() - days * 86_400_000));

const row = (
  kind: AereslisteRow['kind'],
  name: string,
  days: number,
  hole: number,
  courseName: string | null,
  isViewer = false,
): AereslisteRow => ({
  kind,
  name,
  initials: 'XX',
  isViewer,
  hole,
  courseName,
  playedOn: daysAgo(days),
  key: `${name}-${days}`,
});

const MARTE = row('hole_in_one', 'Marte L.', 1, 7, 'Bogstad');

async function renderBanner(onOpen = jest.fn()) {
  const view = await render(<RareShotBanner onOpen={onOpen} />);
  return { onOpen, view };
}

// React Natives jest-oppsett har `fontScale: 2`; vanlig tekst er 1.
const WINDOW = { ...Dimensions.get('window'), fontScale: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  mockClosed = null;
  Dimensions.set({ window: WINDOW });
});

describe('RareShotBanner', () => {
  it('shows someone else’s shot with the badge, the kind, the name and the course, and no time', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: { rows: [MARTE] } });
    await renderBanner();

    expect(await screen.findByTestId('rare-shot-banner')).toHaveTextContent('1Hole-in-oneMarte L.Hull 7 på Bogstad');
    expect(screen.getByTestId('achievement-badge', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('rare-shot-banner-more')).toBeNull();
  });

  it('has one label for the whole banner, opens Æreslista on a tap, and «Lukk» on the ×', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: { rows: [MARTE] } });
    const { onOpen } = await renderBanner();

    const open = await screen.findByRole('link', { name: 'Hole-in-one: Marte L., hull 7 på Bogstad. Åpner æreslista.' });
    await fireEvent.press(open);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Lukk' }).props.hitSlop).toBe(6);
  });

  it('marks your own shot «Du»', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: { rows: [row('hole_in_one', 'Sigrid A.', 0, 5, 'Bærum', true)] } });
    await renderBanner();

    expect(await screen.findByTestId('rare-shot-banner')).toHaveTextContent('1Hole-in-oneSigrid A.DuHull 5 på Bærum');
    expect(screen.getByRole('link', { name: 'Hole-in-one: Sigrid A., deg, hull 5 på Bærum. Åpner æreslista.' })).toBeTruthy();
  });

  it('shows the newest of two shots the same week with «+1 til»', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      view: { rows: [row('albatross', 'Anders M.', 0, 12, 'Holtsmark'), MARTE] },
    });
    await renderBanner();

    expect(await screen.findByTestId('rare-shot-banner')).toHaveTextContent('−3Albatross+1 tilAnders M.Hull 12 på Holtsmark');
  });

  it('is not there when the newest shot is 7 days old or more', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: { rows: [row('hole_in_one', 'Marte L.', 7, 7, 'Bogstad')] } });
    await renderBanner();

    await act(async () => undefined);
    expect(fetchMock).toHaveBeenCalled();
    expect(screen.queryByTestId('rare-shot-banner')).toBeNull();
  });

  it('closes on ×, remembers the shot, and stays closed until a new shot comes', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: { rows: [MARTE] } });
    const first = await renderBanner();

    await fireEvent.press(await screen.findByRole('button', { name: 'Lukk' }));
    expect(screen.queryByTestId('rare-shot-banner')).toBeNull();
    expect(closeRareShot).toHaveBeenCalledWith(MARTE.key);
    await first.view.unmount();

    // Samme slag neste gang Hjem åpnes: fortsatt lukket.
    await renderBanner();
    await act(async () => undefined);
    expect(screen.queryByTestId('rare-shot-banner')).toBeNull();
    await screen.unmount();

    // Et nytt slag har en ny nøkkel, og banneret står igjen.
    fetchMock.mockResolvedValue({ ok: true, view: { rows: [row('albatross', 'Anders M.', 0, 12, 'Holtsmark'), MARTE] } });
    await renderBanner();
    expect(await screen.findByTestId('rare-shot-banner')).toHaveTextContent('Anders M.', { exact: false });
  });

  it('hides the badge with large text (fontScale above 1.2), so the name and the course fit', async () => {
    Dimensions.set({ window: { ...WINDOW, fontScale: 1.35 } });
    fetchMock.mockResolvedValue({
      ok: true,
      view: { rows: [row('hole_in_one', 'Marie-Christine B.', 2, 14, 'Miklagard')] },
    });
    await renderBanner();

    expect(await screen.findByTestId('rare-shot-banner')).toHaveTextContent('Hole-in-oneMarie-Christine B.Hull 14 på Miklagard');
    expect(screen.queryByTestId('achievement-badge', { includeHiddenElements: true })).toBeNull();
  });

  it('keeps the badge at fontScale 1.2', async () => {
    Dimensions.set({ window: { ...WINDOW, fontScale: 1.2 } });
    fetchMock.mockResolvedValue({ ok: true, view: { rows: [MARTE] } });
    await renderBanner();

    await screen.findByTestId('rare-shot-banner');
    expect(screen.getByTestId('achievement-badge', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows nothing, and no error, when the list cannot be fetched or the phone is offline', async () => {
    for (const reason of ['failed', 'offline'] as const) {
      fetchMock.mockResolvedValue({ ok: false, reason });
      await renderBanner();
      await act(async () => undefined);
      expect(screen.toJSON()).toBeNull();
      await screen.unmount();
    }
  });
});
