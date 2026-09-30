// #2255: navnet i «Hull for hull» slik webben skriver det, med webbens reserve.
import { homePlayer } from '../../test/homeFixtures';
import { nameOf } from './holesShared';

describe('nameOf', () => {
  const players = [
    homePlayer({ userId: 'ola', name: 'Ola Kompis', nickname: 'Kompis' }),
    homePlayer({ userId: 'slettet', name: null }),
  ];

  it('navnet med kallenavn, som webbens formatRevealName', () => {
    expect(nameOf(players, 'ola', '(ukjent spiller)')).toContain('Kompis');
  });

  it('en spiller uten navn (slettet bruker) og en ukjent id får kallerens reserve, som på webben', () => {
    expect(nameOf(players, 'slettet', '(ukjent spiller)')).toBe('(ukjent spiller)');
    expect(nameOf(players, 'borte', '(ukjent)')).toBe('(ukjent)');
  });
});
