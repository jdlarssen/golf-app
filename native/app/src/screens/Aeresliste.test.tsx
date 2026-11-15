// #2894 PR 2: Æreslista. Type C — de fem tilstandene fra tegningen (flere år, din egen
// rad, tom, hentes, feil) pluss uten nett, og det bare en render kan bekrefte: årene
// gruppert med tellingen, «Du» på din rad og én skjermleseretikett per rad. Utregningen er
// låst i `lib/aeresliste.test.ts` (Type A).

/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AereslisteRow } from '../../../../lib/stats/aeresliste';
import { fetchAeresliste } from '../data/aeresliste';
import { aereslisteKicker } from '../lib/topplisteCopy';
import type { ScreenProps } from '../navigation';
import { Aeresliste } from './Aeresliste';

jest.mock('../data/aeresliste', () => ({ fetchAeresliste: jest.fn() }));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());

const fetchMock = fetchAeresliste as jest.Mock;

const row = (
  kind: AereslisteRow['kind'],
  name: string,
  playedOn: string,
  hole: number,
  courseName: string | null,
  isViewer = false,
): AereslisteRow => ({ kind, name, initials: 'XX', isViewer, hole, courseName, playedOn, key: `${name}-${playedOn}` });

// Tegningen «Din egen rad»: tre år, nyeste først innenfor året uansett slag.
const ROWS = [
  row('hole_in_one', 'Jonas B.', '2026-09-21', 7, 'Bogstad'),
  row('albatross', 'Anders M.', '2026-07-09', 12, 'Holtsmark'),
  row('hole_in_one', 'Ingrid S.', '2026-05-04', 3, 'Losby'),
  row('hole_in_one', 'Marte L.', '2025-08-30', 16, 'Grini'),
  row('hole_in_one', 'Sigrid A.', '2025-07-14', 5, 'Bærum', true),
  row('hole_in_one', 'Per K.', '2025-06-02', 7, 'Bogstad'),
  row('albatross', 'Marie-Christine B.', '2024-08-17', 4, 'Miklagard'),
  row('albatross', 'Ola N.', '2024-05-01', 9, 'Grini'),
];

async function renderScreen() {
  await render(<Aeresliste {...({ navigation: {}, route: { params: undefined } } as unknown as ScreenProps<'Aeresliste'>)} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Aeresliste', () => {
  it('shows the title while it loads, with the list as flat shapes', async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    await renderScreen();

    expect(screen.getByText('Æreslista')).toBeTruthy();
    expect(screen.queryByText('Hole-in-one og albatross i Tørny')).toBeNull();
    expect(screen.getByTestId('aeresliste-skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('aeresliste-hero')).toBeNull();
  });

  it('shows the newest shot on top and one card per year with the count, newest first', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: { rows: ROWS } });
    await renderScreen();

    expect(await screen.findByTestId('aeresliste-hero')).toHaveTextContent(
      'Nyeste hole-in-oneJonas B.Hull 7 på Bogstad · 21. sep1',
    );
    expect(screen.getByText('Hole-in-one og albatross i Tørny')).toBeTruthy();
    expect(screen.getByLabelText('Nyeste hole-in-one, Jonas B., hull 7 på Bogstad, 21. september')).toBeTruthy();

    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['Æreslista', '2026', '2025', '2024']);
    expect(screen.getByTestId('aeresliste-count-2026')).toHaveTextContent('2 hole-in-one · 1 albatross');
    expect(screen.getByTestId('aeresliste-count-2025')).toHaveTextContent('3 hole-in-one');
    expect(screen.getByTestId('aeresliste-count-2024')).toHaveTextContent('2 albatrosser');

    expect(screen.getByTestId('aeresliste-row-2026-1')).toHaveTextContent('−3Anders M.9. julAlbatross · hull 12 på Holtsmark');
    expect(screen.getByTestId('aeresliste-row-2024-0')).toHaveTextContent('−3Marie-Christine B.17. augAlbatross · hull 4 på Miklagard');
  });

  it('gives every row one label for the screen reader, and marks your own row «Du»', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: { rows: ROWS } });
    await renderScreen();
    await screen.findByTestId('aeresliste-hero');

    const rows = screen.getAllByTestId(/^aeresliste-row-/);
    expect(rows).toHaveLength(ROWS.length);
    expect(rows.every((r) => typeof r.props.accessibilityLabel === 'string' && r.props.accessible)).toBe(true);
    expect(screen.getByLabelText('Hole-in-one, Ingrid S., hull 3 på Losby, 4. mai')).toBeTruthy();
    expect(screen.getByLabelText('Hole-in-one, Sigrid A., hull 5 på Bærum, 14. juli, deg')).toBeTruthy();

    expect(screen.getByTestId('aeresliste-row-2025-1')).toHaveTextContent('Sigrid A.Du14. jul', { exact: false });
    expect(screen.getByTestId('aeresliste-row-2025-0')).not.toHaveTextContent('Du', { exact: false });
  });

  it('shows «Ingen ennå» in the forest card when nobody has one yet', async () => {
    fetchMock.mockResolvedValue({ ok: true, view: { rows: [] } });
    await renderScreen();

    expect(await screen.findByTestId('aeresliste-empty')).toHaveTextContent('Ingen ennåDen første hole-in-one står her.');
    expect(screen.queryByTestId('aeresliste-hero')).toBeNull();
  });

  it('says it could not fetch the shots when the call fails, and tries again', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, reason: 'failed' });
    fetchMock.mockResolvedValueOnce({ ok: true, view: { rows: ROWS } });
    await renderScreen();

    expect(await screen.findByTestId('aeresliste-failed')).toHaveTextContent(
      'Fikk ikke hentet slagenePrøv igjen om litt.Prøv igjen',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Prøv igjen' }));
    expect(await screen.findByTestId('aeresliste-hero')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('says «Du er uten nett» offline', async () => {
    fetchMock.mockResolvedValue({ ok: false, reason: 'offline' });
    await renderScreen();

    expect(await screen.findByTestId('aeresliste-offline')).toHaveTextContent('Du er uten nettKoble til og prøv igjen.Prøv igjen');
  });
});

describe('aereslisteKicker', () => {
  it('names where the list was opened from, and says nothing from a notification', () => {
    expect(aereslisteKicker('toppliste')).toBe('Toppliste');
    expect(aereslisteKicker('home')).toBe('Hjem');
    expect(aereslisteKicker('notification')).toBe('');
    expect(aereslisteKicker(undefined)).toBe('');
  });
});
