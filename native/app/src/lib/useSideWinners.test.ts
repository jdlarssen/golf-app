// Native (#1850): ledningen mellom fetch-kontrakten og den ærlige noten.
//
// Begge endene er testet hver for seg — `fetchSideWinners` kaster ved feil
// (`data/sideWinners.test.ts`), og seksjonen bytter tavla mot noten når flagget
// står (`components/leaderboard/SideTournamentSection.test.tsx`). Denne fila
// tester ledningen: hvem som setter flagget, og når.
//
// Tre tilstander må holdes fra hverandre, og to av dem lignet på hverandre
// nok til å bli forvekslet én gang allerede:
//
//  1. **Venter** (`settled: false`) — forsøket er i lufta. Skjermen viser
//     ingenting. Uten denne meldte appen «fikk ikke tak i vinnerne» i det
//     halve sekundet hver eneste åpning tar.
//  2. **Prøvd og mislyktes** (`settled: true`, `neverLoaded: true`) — først NÅ
//     er noten sann.
//  3. **Prøvd, tomt svar** (`settled: true`, `neverLoaded: false`) — et spill
//     avsluttet uten kåring. Tavla skal vises.
//
// Og gaten: et AKTIVT spill skal ikke koste et nettkall i det hele tatt.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factoryen heises over importene og må bruke require */
import { renderHook, waitFor } from '@testing-library/react-native';
import { useSideWinners } from './useSideWinners';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// `useFocusEffect` krever en navigasjons-container. Skjermfokus er ikke det
// denne fila tester, så den erstattes av en vanlig effekt — kallbacken kjøres
// én gang ved mount, som er nøyaktig det fokus gjør når skjermen åpnes.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react') as typeof import('react');
    useEffect(callback, [callback]);
  },
}));

jest.mock('../data/sideWinners', () => ({
  fetchSideWinners: jest.fn(),
}));

const { fetchSideWinners } = require('../data/sideWinners') as {
  fetchSideWinners: jest.Mock;
};

const ROW = { category: 'longest_drive', position: 1, winner_user_id: 'per' };

beforeEach(() => {
  fetchSideWinners.mockReset();
});

describe('useSideWinners', () => {
  it('henter ingenting for et spill som ikke skal vise sideturnering', async () => {
    const { result } = await renderHook(() => useSideWinners('game-1', false));

    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(fetchSideWinners).not.toHaveBeenCalled();
    // Avklart uten henting: skjermen skal ikke stå og se ut som den laster.
    expect(result.current).toEqual({ rows: [], neverLoaded: true, settled: true });
  });

  it('starter i vente-tilstand og lander med radene', async () => {
    // Hentingen holdes bevisst i lufta: dette er den ENE testen som kan se
    // vente-tilstanden, og en mock som svarer med en gang ville hoppet forbi
    // den. Nettopp det glippet ga «fikk ikke tak i vinnerne» ved hver åpning.
    let release!: (rows: unknown[]) => void;
    fetchSideWinners.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { result } = await renderHook(() => useSideWinners('game-1', true));

    // Før svaret: hverken tavle eller note — vi vet ennå ingenting.
    expect(result.current.settled).toBe(false);
    expect(result.current.neverLoaded).toBe(true);

    release([ROW]);

    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.rows).toEqual([ROW]);
    expect(result.current.neverLoaded).toBe(false);
  });

  it('leser tomt svar som gyldig — ikke som en feilet henting', async () => {
    fetchSideWinners.mockResolvedValue([]);
    const { result } = await renderHook(() => useSideWinners('game-1', true));

    await waitFor(() => expect(result.current.settled).toBe(true));
    // `neverLoaded: false` er hele poenget: et spill avsluttet uten kåring
    // skal få poengtavla, ikke den ærlige noten.
    expect(result.current).toEqual({ rows: [], neverLoaded: false, settled: true });
  });

  it('markerer en feilet henting som avklart, men aldri lastet', async () => {
    fetchSideWinners.mockRejectedValue(new Error('nettet er borte'));
    const { result } = await renderHook(() => useSideWinners('game-1', true));

    await waitFor(() => expect(result.current.settled).toBe(true));
    // Først her er noten sann: vi HAR prøvd, og vi har ingenting.
    expect(result.current).toEqual({ rows: [], neverLoaded: true, settled: true });
  });
});
