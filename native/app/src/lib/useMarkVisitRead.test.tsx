// #2201 PR 2: skjermene i appen merker det du har sett som lest, som webben.
// Hooken merker én gang per gang skjermen vises, og aldri to ganger samtidig.
// Kallertesten under viser at hver skjerm ber om sin egen flate.
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { act, renderHook } from '@testing-library/react-native';
import type { VisitSurface } from '../../../../lib/notifications/readOnVisit';
import { useMarkVisitRead } from './useMarkVisitRead';

// Fokus kommer fra navigasjonen. Testen eier det: `focus()` er «skjermen
// kommer øverst», så to fokus rett etter hverandre kan prøves.
const mockFocus: { callback: (() => void) | null } = { callback: null };
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus.callback = callback;
  },
}));
function focus() {
  mockFocus.callback?.();
}

let release: () => void = () => undefined;
const mockMarkVisitRead = jest.fn(
  (_surface: VisitSurface, _entityId?: string) =>
    new Promise<void>((resolve) => {
      release = resolve;
    }),
);
jest.mock('../data/markRead', () => ({
  markVisitRead: (surface: VisitSurface, entityId?: string) => mockMarkVisitRead(surface, entityId),
}));

const GAME = '0f8e6c1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b';

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus.callback = null;
});

describe('useMarkVisitRead', () => {
  it('merker flaten for spillet når skjermen vises', async () => {
    await renderHook(() => useMarkVisitRead('gameHome', GAME));
    focus();
    expect(mockMarkVisitRead).toHaveBeenCalledTimes(1);
    expect(mockMarkVisitRead).toHaveBeenCalledWith('gameHome', GAME);
  });

  it('starter ikke et nytt kall mens ett venter, men merker igjen ved neste visning', async () => {
    await renderHook(() => useMarkVisitRead('friends'));
    focus();
    focus();
    expect(mockMarkVisitRead).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });
    focus();
    expect(mockMarkVisitRead).toHaveBeenCalledTimes(2);
    expect(mockMarkVisitRead).toHaveBeenLastCalledWith('friends', undefined);
  });
});

/** Skjermene, flaten de ber om, og id-en de sender med. */
const CALLERS: Record<string, { surface: VisitSurface; entity: string | null }> = {
  'GameHome.tsx': { surface: 'gameHome', entity: 'gameId' },
  'Hole.tsx': { surface: 'gameHole', entity: 'gameId' },
  'Approve.tsx': { surface: 'gameApprove', entity: 'gameId' },
  'Leaderboard.tsx': { surface: 'gameLeaderboard', entity: 'gameId' },
  'Friends.tsx': { surface: 'friends', entity: null },
  // Appens lever-port, webbens /games/[id]/submit: leveringspåminnelsen.
  'Scorecard.tsx': { surface: 'gameSubmit', entity: 'gameId' },
  // #2203: appens avslutt-skjerm, webbens /games/[id]/avslutt.
  'EndGame.tsx': { surface: 'gameFinish', entity: 'gameId' },
  // Webbens /profile/historikk er én side med dagbok og statistikk (der
  // merkene står). Appen deler den i to skjermer; begge er historikken.
  'RoundDiary.tsx': { surface: 'history', entity: null },
  'RoundStats.tsx': { surface: 'history', entity: null },
};

describe('skjermene som merker', () => {
  it('hver skjerm ber om sin egen flate, med spillets id', () => {
    const dir = path.join(__dirname, '../screens');
    const found = readdirSync(dir)
      .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
      .flatMap((name) =>
        [...readFileSync(path.join(dir, name), 'utf8').matchAll(
          /useMarkVisitRead\('(\w+)'(?:, (\w+))?\)/g,
        )].map((m) => [name, { surface: m[1], entity: m[2] ?? null }] as const),
      );
    expect(Object.fromEntries(found)).toEqual(CALLERS);
    expect(found).toHaveLength(Object.keys(CALLERS).length);
  });
});
