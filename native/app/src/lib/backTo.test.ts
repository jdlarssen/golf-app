// native/app/src/lib/backTo.test.ts
// #2746: hvor tilbake fører. Type A — ren avgjørelse over stakken, pluss
// at hjelperne kaller den navigasjonen avgjørelsen sier.
import { backStep, backTo, keepBelow, openOrReturn, type BackNavigation } from './backTo';

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

describe('keepBelow', () => {
  it('Hjem-kortets hull: bare Hjem blir liggende under spillet', () => {
    expect(keepBelow([HOME, hole('g1', 18), card('g1')], 'GameHome', { gameId: 'g1' })).toBe(1);
  });

  it('spillet blir liggende under tavla', () => {
    const routes = [HOME, game('g1'), { name: 'Approve', params: { gameId: 'g1' } }];
    expect(keepBelow(routes, 'Leaderboard', { gameId: 'g1' })).toBe(2);
  });

  it('et annet spill blir liggende, selv om det ikke står over målet', () => {
    const routes = [HOME, game('g2'), { name: 'Approve', params: { gameId: 'g1' } }];
    expect(keepBelow(routes, 'Leaderboard', { gameId: 'g1' })).toBe(2);
  });

  it('bare skjermer fra samme spill går ut: ligaen under hullet blir liggende', () => {
    const league = { name: 'League', params: { leagueId: 'l1' } };
    expect(keepBelow([HOME, league, hole('g1', 18), card('g1')], 'GameHome', { gameId: 'g1' })).toBe(2);
  });
});

function fakeNavigation(routes: Route[]): BackNavigation & {
  popTo: jest.Mock;
  replace: jest.Mock;
  navigate: jest.Mock;
  reset: jest.Mock;
} {
  return {
    getState: () => ({ index: routes.length - 1, routes }),
    popTo: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    reset: jest.fn(),
  };
}

// #2748: «Bli med i liga» ligger rett under Hjem, og er borte etter trykket.
describe('skjermen ligalenka åpner', () => {
  const join: Route = { name: 'LeagueJoin', params: { code: 'abcd2345' } };
  const league = (leagueId: string): Route => ({ name: 'League', params: { leagueId } });

  it('[Hjem, Bli med]: ligaen tar skjemaets plass', () => {
    expect(backStep([HOME, join], 'League', { leagueId: 'l1', joined: true })).toBe('replace');
    expect(keepBelow([HOME, join], 'League', { leagueId: 'l1' })).toBe(1);
  });

  it('ligger ligaen under, går det tilbake til den uansett kvittering', () => {
    expect(backStep([HOME, league('l1'), join], 'League', { leagueId: 'l1' })).toBe('popTo');
    expect(backStep([HOME, league('l1'), join], 'League', { leagueId: 'l1', joined: true })).toBe('popTo');
  });

  it('en annen liga under er ikke samme liga', () => {
    expect(backStep([HOME, league('l2'), join], 'League', { leagueId: 'l1' })).toBe('replace');
    expect(keepBelow([HOME, league('l2'), join], 'League', { leagueId: 'l1' })).toBe(2);
  });

  it('Hjem står over skjermen', () => {
    expect(keepBelow([HOME, join], 'LeagueJoin', { code: 'zzzz9999' })).toBe(1);
  });
});

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

  it('backTo fra Hjem-kortets hull: hullet går ut sammen med kortet', () => {
    const nav = fakeNavigation([HOME, hole('g1', 18), card('g1')]);
    backTo(nav, 'GameHome', { gameId: 'g1' });
    expect(nav.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [HOME, { name: 'GameHome', params: { gameId: 'g1' } }],
    });
    expect(nav.replace).not.toHaveBeenCalled();
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
