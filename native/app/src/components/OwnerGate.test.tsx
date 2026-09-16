// native/app/src/components/OwnerGate.test.tsx
// Native #1959: den ene render-testen (Type C) for eier-porten.
//
// Vakten selv (typet feil, stempel, sperret drain mot ekte sqlite) er dekket av
// `data/localOwner.test.ts`, og utloggingens eier-regel av `data/logout.test.ts`.
// Her låses koblingene bare en render kan bekrefte:
//
//  1. **Feilet eierbytte-wipe = ingen barn.** Stacken, og dermed
//     `startSyncTriggers` i Hjem, finnes ikke i treet.
//  2. **«Prøv igjen» slipper barna inn** når neste forsøk lykkes.
//  3. **Alle andre feil er fortsatt fail-open**: barna rendres.
//  4. **«Logg ut» er den vanlige utloggingen.**
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ensureLocalDataOwnerOnDevice } from '../data/localOwner';
import { logOut } from '../data/logout';
import { OWNER_GATE_TEXT } from '../lib/ownerGateCopy';
import { OwnerGate } from './OwnerGate';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/localOwner', () => {
  const actual = jest.requireActual('../data/localOwner') as typeof import('../data/localOwner');
  return {
    OwnerWipeFailedError: actual.OwnerWipeFailedError,
    ensureLocalDataOwnerOnDevice: jest.fn(),
  };
});
jest.mock('../data/logout', () => ({ logOut: jest.fn() }));

const guard = ensureLocalDataOwnerOnDevice as jest.Mock;

function wipeFailed(): Error {
  const { OwnerWipeFailedError } = jest.requireActual(
    '../data/localOwner',
  ) as typeof import('../data/localOwner');
  return new OwnerWipeFailedError(new Error('database is locked'));
}

async function renderGate() {
  await render(
    <OwnerGate userId="user-b">
      <Text testID="stack">stacken</Text>
    </OwnerGate>,
  );
}

describe('OwnerGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rendrer ikke barna når wipen feilet ved eierbytte, og slipper dem inn når «Prøv igjen» lykkes', async () => {
    guard.mockRejectedValueOnce(wipeFailed());
    await renderGate();

    await waitFor(() => {
      expect(screen.getByTestId('owner-gate-wipe-failed')).toBeTruthy();
    });
    expect(screen.getByText(OWNER_GATE_TEXT.wipeFailed)).toBeTruthy();
    expect(screen.queryByTestId('stack')).toBeNull();

    // Andre forsøk feiler også: porten står.
    guard.mockRejectedValueOnce(wipeFailed());
    fireEvent.press(screen.getByTestId('owner-gate-retry'));
    await waitFor(() => expect(guard).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.getByTestId('owner-gate-wipe-failed')).toBeTruthy();
    });
    expect(screen.queryByTestId('stack')).toBeNull();

    // Tredje lykkes: stacken monteres.
    guard.mockResolvedValueOnce('switched');
    fireEvent.press(screen.getByTestId('owner-gate-retry'));
    await waitFor(() => {
      expect(screen.getByTestId('stack')).toBeTruthy();
    });
    expect(screen.queryByTestId('owner-gate-wipe-failed')).toBeNull();
  });

  it('rendrer barna når vakten feiler av en annen grunn (fail-open)', async () => {
    guard.mockRejectedValueOnce(new Error('AsyncStorage låst'));
    await renderGate();

    await waitFor(() => {
      expect(screen.getByTestId('stack')).toBeTruthy();
    });
    expect(screen.queryByTestId('owner-gate-wipe-failed')).toBeNull();
  });

  it('«Logg ut» kaller den vanlige utloggingen, og viser nett-notatet når sesjonen ble stående', async () => {
    guard.mockRejectedValueOnce(wipeFailed());
    (logOut as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'signout-failed' });
    await renderGate();
    await waitFor(() => {
      expect(screen.getByTestId('owner-gate-logout')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('owner-gate-logout'));

    await waitFor(() => {
      expect(screen.getByText(OWNER_GATE_TEXT.logoutOfflineNote)).toBeTruthy();
    });
    expect(logOut).toHaveBeenCalledWith();
    expect(screen.queryByTestId('stack')).toBeNull();
  });
});
