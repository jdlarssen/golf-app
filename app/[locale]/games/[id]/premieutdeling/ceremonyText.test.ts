import { describe, expect, it } from 'vitest';
import type { CeremonyPlace } from '@/lib/games/ceremony';
import { afterColon, placeText, type PlaceWords } from './ceremonyText';

// Type A (#2298): the phone's read-out lines.

const words: PlaceWords = {
  placeTitle: (p) => (p.lines.length > 1 ? `Delt ${p.rank}. plass` : `${p.rank}. plass`),
  teamLabel: (n) => `Lag ${n}`,
  units: { points: 'poeng', net: 'slag', toPar: 'mot par' },
  names: { a: 'Marte Lie', b: 'Jonas Berg', c: 'Ola Nordmann', d: 'Kari Nordmann' },
  unknown: '(ukjent)',
};

describe('afterColon', () => {
  it.each([
    ['Sidepremiene', 'sidepremiene'],
    ['Delt 2. plass', 'delt 2. plass'],
    ['2. plass', '2. plass'],
    ['Side prizes', 'side prizes'],
  ])('%s → %s', (title, expected) => {
    expect(afterColon(title)).toBe(expected);
  });
});

describe('placeText', () => {
  it('a team: label, members and the shared number', () => {
    const place: CeremonyPlace = {
      rank: 2,
      lines: [{ key: 'team-3', rank: 2, total: 61, unit: 'net', members: ['a', 'b'], teamNumber: 3 }],
    };
    expect(placeText(place, words)).toBe('2. plass · Lag 3 · Marte Lie, Jonas Berg · 61 slag');
  });

  it('a shared team place: each team on its own, one number', () => {
    const place: CeremonyPlace = {
      rank: 2,
      lines: [
        { key: 'team-2', rank: 2, total: 62, unit: 'net', members: ['a', 'b'], teamNumber: 2 },
        { key: 'team-4', rank: 2, total: 62, unit: 'net', members: ['c', 'x'], teamNumber: 4 },
      ],
    };
    expect(placeText(place, { ...words, placeTitle: (p) => afterColon(words.placeTitle(p)) })).toBe(
      'delt 2. plass · Lag 2 · Marte Lie, Jonas Berg; Lag 4 · Ola Nordmann, (ukjent) · 62 slag',
    );
  });
});
