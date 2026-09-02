// native/app/src/screens/DeleteAccount.test.tsx
// Native #1876: den ene render-testen (Type C) for bekreftelsesskjermen.
//
// Setningene i seg selv er dekket av `lib/accountCopy.test.ts` (paritet mot
// webbens `messages/no.json`), og rekkefølgen POST → wipe → signOut — inkludert
// at 401 ALDRI wiper — er dekket av `data/account.test.ts`. Ingen av delene
// gjentas her; testene under leser copyen gjennom de samme funksjonene skjermen
// bruker, i stedet for å skrive av strengene.
//
// Det som blir igjen er koblingene bare en render kan bekrefte:
//
//  1. **Blokkert = ingen knapp.** Ikke en grå knapp, ikke en knapp som avvises
//     ved trykk — den skal ikke finnes i treet. Samme oppførsel som webbens
//     `/profile/slett-konto`, og hele poenget med at statusen hentes først.
//  2. **Uten svar på statusen er det også ingen knapp.** Uten nett vet vi ikke
//     om kontoen kan slettes, og da tilbys ingen sletting.
//  3. **Ikke blokkert = de tre blokkene og navnet ditt** før den røde knappen.
//  4. **Suksess navigerer ikke** — utloggingen bytter ut hele stacken, og
//     skjermen skal ikke tilby et nytt forsøk i mellomtiden.
//  5. **Et avslag navngir årsaken**, med den setningen koden hører til.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { deleteAccount, fetchDeleteStatus } from '../data/account';
import {
  ACCOUNT_TEXT,
  describeDeleteBlock,
  describeDeleteFailure,
  type DeleteBlockReason,
} from '../lib/accountCopy';
import type { ScreenProps } from '../navigation';
import { queryStub, routeFrom } from '../test/supabaseMock';
import { DeleteAccount } from './DeleteAccount';

// `mock`-prefiks kreves av jest-fabrikkene som heises over deklarasjonene.
const mockMe = 'user-me';
const mockEmail = 'spiller@example.com';
const MY_NAME = 'Jørgen Larssen';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../session', () => ({
  useSession: () => ({ userId: mockMe, email: mockEmail }),
}));
jest.mock('../data/account', () => ({
  fetchDeleteStatus: jest.fn(),
  deleteAccount: jest.fn(),
}));

const goBack = jest.fn();

async function renderScreen() {
  await render(
    <DeleteAccount
      {...({ navigation: { goBack } } as unknown as ScreenProps<'DeleteAccount'>)}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('delete-account-screen')).toBeTruthy();
  });
}

describe('DeleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Navneoppslaget rigges for hver test: `routeFrom` bruker opp stubbene sine.
    routeFrom({ users: [queryStub({ data: { name: MY_NAME }, error: null })] });
    (fetchDeleteStatus as jest.Mock).mockResolvedValue({ ok: true, blocked: null });
    (deleteAccount as jest.Mock).mockResolvedValue({ ok: true, mode: 'anonymized' });
  });

  it.each<DeleteBlockReason>(['admin_account', 'active_engagements'])(
    'viser banneret og ingen slette-knapp når kontoen er blokkert (%s)',
    async (blocked) => {
      (fetchDeleteStatus as jest.Mock).mockResolvedValue({ ok: true, blocked });
      await renderScreen();

      expect(screen.getByTestId('delete-account-banner')).toHaveTextContent(
        describeDeleteBlock(blocked),
      );
      // Ingen knapp i det hele tatt — ikke en grå én.
      expect(screen.queryByTestId('delete-account-submit')).toBeNull();
      expect(screen.getByTestId('delete-account-back')).toBeTruthy();
    },
  );

  // «Fikk ikke spurt» er ikke det samme som «nei». Kontrakten sier les-og-vis
  // fritt: teksten skal stå der, knappen skal ikke.
  it('lar deg lese hva sletting gjør selv om statusen ikke kunne hentes', async () => {
    (fetchDeleteStatus as jest.Mock).mockResolvedValue({
      ok: false,
      reason: 'offline',
    });
    await renderScreen();

    expect(screen.getByTestId('delete-account-deleted')).toBeTruthy();
    expect(screen.getByTestId('delete-account-kept')).toBeTruthy();
    expect(screen.getByTestId('delete-account-unreachable')).toHaveTextContent(
      describeDeleteFailure('offline'),
    );
    // Ingen knapp i det hele tatt — ikke en grå én.
    expect(screen.queryByTestId('delete-account-submit')).toBeNull();
    // Og ikke forvekslet med et avslag fra serveren.
    expect(screen.queryByTestId('delete-account-banner')).toBeNull();
  });

  it('viser hva som slettes, hva som beholdes og navnet ditt', async () => {
    await renderScreen();

    for (const line of ACCOUNT_TEXT.deletedBullets) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    expect(screen.getByText(ACCOUNT_TEXT.keptBullet)).toBeTruthy();
    // Navnet kommer fra egen users-rad; e-posten er bare fallbacken.
    await waitFor(() => {
      expect(screen.getByTestId('delete-account-name')).toHaveTextContent(MY_NAME);
    });
    expect(screen.getByTestId('delete-account-submit')).toBeTruthy();
  });

  it('faller tilbake på e-posten når navnet ikke lot seg hente', async () => {
    routeFrom({
      users: [queryStub({ data: null, error: { message: 'nope', code: '42501' } })],
    });
    await renderScreen();

    // Et feilet navneoppslag skal ikke stenge skjermen — bare gjøre setningen
    // litt mindre personlig.
    expect(screen.getByTestId('delete-account-name')).toHaveTextContent(mockEmail);
    expect(screen.getByTestId('delete-account-submit')).toBeTruthy();
  });

  it('sletter og overlater resten til utloggingen', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('delete-account-submit'));

    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalledTimes(1);
    });
    // Ingen navigasjon og ingen feil: sesjonen forsvinner og `App.tsx` bytter
    // til Login. Knappen blir stående i «Sletter …» til skjermen er borte —
    // et nytt forsøk mot en konto som ikke finnes ville bare gitt 401.
    expect(goBack).not.toHaveBeenCalled();
    expect(screen.queryByTestId('delete-account-notice')).toBeNull();
    expect(screen.getByTestId('delete-account-submit')).toHaveTextContent(
      ACCOUNT_TEXT.deletePending,
    );
  });

  it('sier at sesjonen er utløpt når slettingen svarer 401', async () => {
    (deleteAccount as jest.Mock).mockResolvedValue({
      ok: false,
      reason: 'unauthorized',
    });
    await renderScreen();

    await fireEvent.press(screen.getByTestId('delete-account-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-account-notice')).toHaveTextContent(
        describeDeleteFailure('unauthorized'),
      );
    });
    // Avslaget skal la deg prøve igjen etter ny innlogging, ikke låse skjermen.
    expect(screen.getByTestId('delete-account-submit')).toHaveTextContent(
      ACCOUNT_TEXT.deleteButton,
    );
  });
});
