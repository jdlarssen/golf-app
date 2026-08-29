import { describe, it, expect } from 'vitest';
import {
  DISCOVERY_PREVIEW_TOTAL_CAP,
  capDiscoveryPreview,
} from './discoveryPreviewCap';

// Identiteten er nok for kappingen — funksjonen er generisk over kort-typene.
const games = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}` }));

const cap = (club: number, friends: number, open: number) =>
  capDiscoveryPreview({
    clubGames: games(club, 'c'),
    friendGames: games(friends, 'f'),
    openGames: games(open, 'o'),
  });

const counts = (r: ReturnType<typeof cap>) => [
  r.clubGames.length,
  r.friendGames.length,
  r.openGames.length,
];

describe('capDiscoveryPreview', () => {
  it('caps at 3 total (#1798 — owner-approved reversal of the per-list cap)', () => {
    expect(DISCOVERY_PREVIEW_TOTAL_CAP).toBe(3);
  });

  // Kuratering: klubb > venner > åpne — grådig fyll i den rekkefølgen,
  // aldri etter nærmeste tee-off.
  it.each([
    [0, 0, 0, [0, 0, 0]],
    [1, 0, 0, [1, 0, 0]],
    [4, 0, 0, [3, 0, 0]],
    [2, 5, 4, [2, 1, 0]],
    [3, 2, 2, [3, 0, 0]],
    [0, 2, 4, [0, 2, 1]],
    [0, 0, 5, [0, 0, 3]],
    [1, 1, 1, [1, 1, 1]],
  ])('club=%i friends=%i open=%i → %j', (club, friends, open, expected) => {
    expect(counts(cap(club, friends, open))).toEqual(expected);
  });

  it('keeps each list’s own order and takes from the front', () => {
    const result = cap(2, 3, 0);
    expect(result.clubGames.map((g) => g.id)).toEqual(['c1', 'c2']);
    expect(result.friendGames.map((g) => g.id)).toEqual(['f1']);
  });
});
