// native/app/src/lib/backTo.test.ts
// #2746: hvor tilbake fører. Type A — ren avgjørelse over stakken, pluss
// at hjelperne kaller den navigasjonen avgjørelsen sier.
import { backStep, backTo, openOrReturn, type BackNavigation } from './backTo';

type Route = { name: string; params?: object };

const HOME: Route = { name: 'Home' };
const game = (gameId: string): Route => ({ name: 'GameHome', params: { gameId } });
const hole = (gameId: string, holeNumber: number): Route => ({
  name: 'Hole',
  params: { gameId, holeNumber },
});
const board = (gameId: string): Route => ({ name: 'Leaderboard', params: { gameId } });
const card = (gameId: string): Route => ({ name: 'Scorecard', params: { gameId } });

describe('backStep', () => {
  it('går tilbake til skjermen når den ligger lenger nede med samme spill', () => {
    expect(backStep([HOME, game('g1'), hole('g1', 3), card('g1')], 'GameHome', { gameId: 'g1' })).toBe(
      'popTo',
    );
  });

  it('går ikke til et annet spill med samme skjermnavn', () => {
    const routes = [HOME, game('g1'), card('g2')];
    expect(backStep(routes, 'GameHome', { gameId: 'g2' })).toBe('replace');
    expect(backStep(routes, 'GameHome', { gameId: 'g2' }, 'push')).toBe('push');
  });

  it('ser bare på den nærmeste med samme navn, som `popTo` gjør', () => {
    // `popTo` uten `getId` velger den øverste GameHome. Er den et annet spill,
    // ville den landet feil, så avgjørelsen faller tilbake.
    const routes = [HOME, game('g1'), hole('g1', 2), game('g2'), card('g2')];
    expect(backStep(routes, 'GameHome', { gameId: 'g1' })).toBe('replace');
  });

  it('erstatter når skjermen ikke finnes i stakken', () => {
    expect(backStep([HOME, card('g1')], 'GameHome', { gameId: 'g1' })).toBe('replace');
    expect(backStep([HOME, card('g1')], 'GameHome', { gameId: 'g1' }, 'push')).toBe('push');
  });

  it('Hjem uten params er alltid bunnen', () => {
    expect(backStep([HOME, game('g1')], 'Home', undefined)).toBe('popTo');
  });

  it('ligaen sammenlignes på leagueId', () => {
    const routes = [HOME, { name: 'League', params: { leagueId: 'l1' } }, { name: 'MarkerApprove' }];
    expect(backStep(routes, 'League', { leagueId: 'l1' })).toBe('popTo');
    expect(backStep(routes, 'League', { leagueId: 'l2' })).toBe('replace');
  });

  it('andre params enn id-ene teller ikke (hullnummer, kvittering)', () => {
    expect(backStep([HOME, game('g1'), hole('g1', 3), board('g1')], 'Hole', { gameId: 'g1', holeNumber: 7 }, 'push')).toBe(
      'popTo',
    );
    expect(backStep([HOME, { name: 'Profile' }, { name: 'EditProfile' }], 'Profile', { saved: true })).toBe(
      'popTo',
    );
  });

  it('skjermen du står på er ikke «lenger nede»', () => {
    expect(backStep([HOME, game('g1')], 'GameHome', { gameId: 'g1' }, 'push')).toBe('push');
  });
});

function fakeNavigation(routes: Route[]): BackNavigation & {
  popTo: jest.Mock;
  replace: jest.Mock;
  navigate: jest.Mock;
} {
  return {
    getState: () => ({ index: routes.length - 1, routes }),
    popTo: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
  };
}

describe('backTo og openOrReturn', () => {
  it('backTo går tilbake når målet ligger under', () => {
    const nav = fakeNavigation([HOME, game('g1'), card('g1')]);
    backTo(nav, 'GameHome', { gameId: 'g1' });
    expect(nav.popTo).toHaveBeenCalledWith('GameHome', { gameId: 'g1' });
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('backTo erstatter skjemaet når målet ikke ligger under', () => {
    const nav = fakeNavigation([HOME, card('g1')]);
    backTo(nav, 'GameHome', { gameId: 'g1' });
    expect(nav.replace).toHaveBeenCalledWith('GameHome', { gameId: 'g1' });
    expect(nav.popTo).not.toHaveBeenCalled();
  });

  it('openOrReturn: hull → tavla → stripa → hull gir hullet som alt ligger der', () => {
    const nav = fakeNavigation([HOME, game('g1'), hole('g1', 3), board('g1')]);
    openOrReturn(nav, 'Hole', { gameId: 'g1', holeNumber: 4 });
    expect(nav.popTo).toHaveBeenCalledWith('Hole', { gameId: 'g1', holeNumber: 4 });
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('openOrReturn åpner skjermen på vanlig måte når den ikke ligger under', () => {
    const nav = fakeNavigation([HOME, game('g1'), hole('g1', 3)]);
    openOrReturn(nav, 'Leaderboard', { gameId: 'g1' });
    expect(nav.navigate).toHaveBeenCalledWith('Leaderboard', { gameId: 'g1' });
    expect(nav.popTo).not.toHaveBeenCalled();
  });
});
