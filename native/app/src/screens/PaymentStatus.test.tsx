// #2749 PR C: «Hvem har betalt?» (Type C). Det rutene svarer, er Type A i
// `data/payments.test.ts`; her er det haken som settes med en gang, går tilbake
// ved feil, og purre-knappen.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PaymentsOverview } from '../data/payments';
import type { ScreenProps } from '../navigation';
import { PaymentStatus } from './PaymentStatus';

jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
jest.mock('../session', () => ({ useSession: () => ({ userId: 'me' }) }));

const mockFetch = jest.fn();
const mockSetPaid = jest.fn();
const mockRemind = jest.fn();
jest.mock('../data/payments', () => ({
  fetchPayments: (...args: unknown[]) => mockFetch(...args),
  setPaid: (...args: unknown[]) => mockSetPaid(...args),
  remindUnpaid: (...args: unknown[]) => mockRemind(...args),
}));

const overview = (over: Partial<PaymentsOverview> = {}): PaymentsOverview => ({
  entryFeeKr: 200,
  gameName: 'Lørdagsrunden',
  paidCount: 2,
  totalCount: 4,
  remindable: 2,
  players: [
    { userId: 'me', name: 'Sofie Aas', isGuest: false, withdrawn: false, paid: true },
    { userId: 'marte', name: 'Marte Lie', isGuest: false, withdrawn: false, paid: true },
    { userId: 'jonas', name: 'Jonas Berg', isGuest: false, withdrawn: false, paid: false },
    { userId: 'kristian', name: 'Kristian Holm', isGuest: false, withdrawn: false, paid: false },
  ],
  ...over,
});

const renderScreen = () =>
  render(
    <PaymentStatus
      {...({ route: { params: { gameId: 'game-1' } }, navigation: {} } as unknown as ScreenProps<'PaymentStatus'>)}
    />,
  );

beforeEach(() => {
  mockFetch.mockReset();
  mockSetPaid.mockReset();
  mockRemind.mockReset();
});

describe('PaymentStatus', () => {
  it('viser tittelen, beløpet og spillerne med «(deg)», «Betalt» og «Mangler»', async () => {
    mockFetch.mockResolvedValue({ ok: true, overview: overview() });
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('payment-status-screen')).toBeTruthy());
    expect(screen.getByText('Hvem har betalt?')).toBeTruthy();
    expect(screen.getByText('Lørdagsrunden · 200 kr')).toBeTruthy();
    expect(screen.getByTestId('payment-row-me')).toHaveTextContent('Sofie Aas (deg)Betalt');
    expect(screen.getByTestId('payment-row-jonas')).toHaveTextContent('Jonas BergMangler');
    expect(screen.getByTestId('payment-row-jonas').props.accessibilityLabel).toBe('Marker Jonas Berg som betalt');
    expect(mockFetch).toHaveBeenCalledWith('game-1');
  });

  it('et trykk setter haken med en gang og kaller PUT; svaret hentes på nytt', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, overview: overview() });
    let finish: (value: { ok: true }) => void = () => {};
    mockSetPaid.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('payment-row-jonas')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('payment-row-jonas'));
    // Før svaret: haken står allerede.
    expect(screen.getByTestId('payment-row-jonas').props.accessibilityState).toMatchObject({ checked: true });
    expect(mockSetPaid).toHaveBeenCalledWith('game-1', 'jonas', true);

    const after = overview({ paidCount: 3, remindable: 1 });
    after.players[2] = { ...after.players[2], paid: true };
    mockFetch.mockResolvedValueOnce({ ok: true, overview: after });
    await act(async () => finish({ ok: true }));

    await waitFor(() => expect(screen.getByTestId('payment-status-remind')).toHaveTextContent('Purr de som mangler (1)'));
    expect(screen.getByTestId('payment-row-jonas').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('feiler lagringen, går haken tilbake og «Kunne ikke lagre. Prøv igjen.» står over lista', async () => {
    mockFetch.mockResolvedValue({ ok: true, overview: overview() });
    mockSetPaid.mockResolvedValue({ ok: false, reason: 'payments_failed' });
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('payment-row-me')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('payment-row-me'));

    await waitFor(() => expect(screen.getByTestId('payment-status-error')).toHaveTextContent('Kunne ikke lagre. Prøv igjen.'));
    expect(mockSetPaid).toHaveBeenCalledWith('game-1', 'me', false);
    expect(screen.getByTestId('payment-row-me').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('purre-knappen sender og sier «Purret 2 spillere.»', async () => {
    mockFetch.mockResolvedValue({ ok: true, overview: overview() });
    mockRemind.mockResolvedValue({ ok: true, reminded: 2 });
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('payment-status-remind')).toHaveTextContent('Purr de som mangler (2)'));

    await fireEvent.press(screen.getByTestId('payment-status-remind'));

    await waitFor(() => expect(screen.getByTestId('payment-status-remind-note')).toHaveTextContent('Purret 2 spillere.'));
    expect(mockRemind).toHaveBeenCalledWith('game-1');
  });

  it('ingen å purre: ingen knapp; en trukket spiller og en gjest har sine merker', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      overview: overview({
        remindable: 0,
        players: [
          { userId: 'trukket', name: 'Ola', isGuest: false, withdrawn: true, paid: false },
          { userId: 'gjest', name: 'Kari', isGuest: true, withdrawn: false, paid: false },
        ],
      }),
    });
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('payment-status-screen')).toBeTruthy());

    expect(screen.queryByTestId('payment-status-remind')).toBeNull();
    expect(screen.getByTestId('payment-row-trukket')).toHaveTextContent('Ola (trukket)Mangler');
    expect(screen.getByTestId('payment-row-gjest')).toHaveTextContent('KariGjestMangler');
  });

  it('en lesefeil gir en ærlig melding og «Prøv igjen»', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, reason: 'network' });
    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('payment-status-failed')).toBeTruthy());
    mockFetch.mockResolvedValueOnce({ ok: true, overview: overview() });
    await fireEvent.press(screen.getByTestId('payment-status-retry'));
    await waitFor(() => expect(screen.getByTestId('payment-status-screen')).toBeTruthy());
  });
});
