// #2255: navnet i «Hull for hull» slik webben skriver det, med webbens reserve.
import { homePlayer } from '../../test/homeFixtures';
import { nameOf } from './holesShared';

describe('nameOf', () => {
  const players = [
    homePlayer({ userId: 'ola', name: 'Ola Kompis', nickname: 'Kompis' }),
    homePlayer({ userId: 'invitert', name: null, nickname: null }),
    homePlayer({ userId: 'kallenavn', name: null, nickname: 'Kompis' }),
  ];

  it('navnet med kallenavn, som webbens formatRevealName', () => {
    expect(nameOf(players, 'ola', '(ukjent spiller)')).toContain('Kompis');
  });

  it('en spiller uten navn får «(ukjent)», som webbens name ?? unknownPlayer', () => {
    expect(nameOf(players, 'invitert', '(ukjent spiller)')).toBe('(ukjent)');
    expect(nameOf(players, 'kallenavn', '(ukjent spiller)')).toBe('(ukjent) "Kompis"');
  });

  it('bare en id som ikke er med i spillet får kallerens reserve', () => {
    expect(nameOf(players, 'borte', '(ukjent spiller)')).toBe('(ukjent spiller)');
  });
});
