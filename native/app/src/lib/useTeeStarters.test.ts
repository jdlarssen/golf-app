// #2751: hvilket utslagsvalg som gjelder. Regelen er én ren funksjon.
import { bundleTeeStarterFor, effectiveTeeStarter } from './useTeeStarters';

const patsome = {
  gameMode: 'patsome',
  foursomesSide1TeeStarterUserId: null,
  foursomesSide2TeeStarterUserId: null,
  patsomeTeeStarters: [{ teamNumber: 2, teeStarterUserId: 'bundel' }],
};
const foursomes = {
  gameMode: 'foursomes_matchplay',
  foursomesSide1TeeStarterUserId: 'side1',
  foursomesSide2TeeStarterUserId: null,
  patsomeTeeStarters: [],
};

describe('bundleTeeStarterFor', () => {
  it('Patsome leser laget sitt fra lista, foursomes leser kolonnen', () => {
    expect(bundleTeeStarterFor(patsome, 2)).toBe('bundel');
    expect(bundleTeeStarterFor(patsome, 1)).toBeNull();
    expect(bundleTeeStarterFor(foursomes, 1)).toBe('side1');
    expect(bundleTeeStarterFor(foursomes, 2)).toBeNull();
    expect(bundleTeeStarterFor(foursomes, 3)).toBeNull();
  });

  it('andre formater har ikke valget', () => {
    expect(
      bundleTeeStarterFor({ ...foursomes, gameMode: 'greensome_matchplay' }, 1),
    ).toBeNull();
  });
});

describe('effectiveTeeStarter', () => {
  const local = [
    { teamNumber: 1, teeStarterId: 'lokal' },
    { teamNumber: 2, teeStarterId: 'lokal-2' },
  ];

  it('bundelens valg går foran det lokale', () => {
    expect(effectiveTeeStarter(patsome, local, 2)).toBe('bundel');
    expect(effectiveTeeStarter(foursomes, local, 1)).toBe('side1');
  });

  it('uten valg i bundelen gjelder det lokale', () => {
    expect(effectiveTeeStarter(patsome, local, 1)).toBe('lokal');
    expect(effectiveTeeStarter(foursomes, local, 2)).toBe('lokal-2');
  });

  it('uten noe av det er det ikke valgt', () => {
    expect(effectiveTeeStarter(patsome, [], 1)).toBeNull();
  });
});
