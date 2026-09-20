// Native (#1832): hvilke formater som koster et nettkall.
//
// Hooken rundt denne funksjonen poller serveren mens skjermen står åpen. Den
// listen skal være nøyaktig to formater lang: svarer `choiceSourceFor` noe
// annet enn `null` for et format som ikke bruker per-hull-valg, begynner elleve
// andre spilltyper å hente en tabell de ikke trenger — hvert tiende sekund,
// på mobildata, midt i en runde.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factoryen heises over importene og må bruke require */
import { act, renderHook } from '@testing-library/react-native';
import type {
  GameMode,
  WolfHoleChoice,
} from '../../../../lib/scoring/modes/types';
import { CHOICES_POLL_MS, choiceSourceFor, useGameChoices } from './useChoices';

// Modulen drar inn fetch-laget, som drar inn den ekte klienten — den kaster
// uten `EXPO_PUBLIC_SUPABASE_*` allerede ved import.
jest.mock('../supabase', () => require('../test/supabaseMock'));

// Fokus er ikke det denne fila tester: kallbacken kjøres én gang ved mount,
// som er det fokus gjør når skjermen åpnes.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react') as typeof import('react');
    useEffect(callback, [callback]);
  },
}));

jest.mock('../data/choices', () => ({
  fetchWolfChoices: jest.fn(),
  fetchBingoBangoBongoHoles: jest.fn(),
}));

const { fetchWolfChoices } = require('../data/choices') as {
  fetchWolfChoices: jest.Mock;
};

// Kartet, ikke lista, er porten: et 23. format i `GameMode` gir rød `tsc` her,
// i stedet for at formatet stille begynner å polle en tabell det ikke trenger.
// `as const satisfies` sperrer begge veier — `wolf` kan heller ikke smyges inn.
const NO_CHOICES_MAP = {
  best_ball: true,
  stableford: true,
  modified_stableford: true,
  singles_matchplay: true,
  solo_strokeplay: true,
  texas_scramble: true,
  ambrose: true,
  florida_scramble: true,
  fourball_matchplay: true,
  foursomes_matchplay: true,
  greensome_matchplay: true,
  chapman_matchplay: true,
  gruesome_matchplay: true,
  nassau: true,
  skins: true,
  nines: true,
  round_robin: true,
  acey_deucey: true,
  shamble: true,
  patsome: true,
} as const satisfies Record<Exclude<GameMode, 'wolf' | 'bingo_bango_bongo'>, true>;

const NO_CHOICES = Object.keys(NO_CHOICES_MAP) as readonly GameMode[];

describe('choiceSourceFor', () => {
  it('peker wolf og bingo bango bongo på hver sin tabell', () => {
    expect(choiceSourceFor('wolf')).toBe('wolf');
    expect(choiceSourceFor('bingo_bango_bongo')).toBe('bingo_bango_bongo');
  });

  it.each(NO_CHOICES)('henter ingenting for %s', (mode) => {
    expect(choiceSourceFor(mode)).toBeNull();
  });

  it('henter ingenting før bundelen har landet og formatet er kjent', () => {
    expect(choiceSourceFor('')).toBeNull();
  });
});

describe('CHOICES_POLL_MS', () => {
  it('går sjeldnere enn slag-pollingen — dette er nett, ikke SQLite', () => {
    // Leaderboardets POLL_MS er 1500 ms mot den lokale basen. Et nettkall i
    // den takten ville vært 40 spørringer i minuttet per åpen skjerm.
    expect(CHOICES_POLL_MS).toBeGreaterThanOrEqual(1500);
  });
});

describe('useGameChoices: svarrekkefølge (#2094)', () => {
  const partner: WolfHoleChoice = {
    holeNumber: 5,
    wolfUserId: 'wolf',
    choice: 'partner',
    partnerUserId: 'mate',
  };
  const lone: WolfHoleChoice = { ...partner, choice: 'lone', partnerUserId: null };

  function deferred() {
    let resolve!: (rows: WolfHoleChoice[]) => void;
    const promise = new Promise<WolfHoleChoice[]>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  beforeEach(() => {
    fetchWolfChoices.mockReset();
  });

  it('beholder det nyeste svaret når en eldre henting svarer sist', async () => {
    // Fokus-hentingen går ut før Wolf-spilleren bytter valg; hentingen hull-
    // skjermen gjør etter lagringen går ut etter. Nettet svarer i omvendt
    // rekkefølge.
    const older = deferred();
    const newer = deferred();
    fetchWolfChoices
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { result } = await renderHook(() =>
      useGameChoices('game-1', 'wolf', 60_000),
    );

    let afterSave!: Promise<void>;
    await act(async () => {
      afterSave = result.current.refresh();
    });
    await act(async () => {
      newer.resolve([lone]);
      await afterSave;
    });
    await act(async () => {
      older.resolve([partner]);
    });

    expect(result.current.extras).toEqual({ wolfChoices: [lone] });
  });
});
