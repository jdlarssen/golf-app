import { isGameOrganiser } from './gameOrganiser';

describe('isGameOrganiser (#2688)', () => {
  it.each([
    ['oppretteren av et vanlig spill', { createdBy: 'me', leagueRoundId: null }, true],
    ['en annen enn oppretteren', { createdBy: 'ola', leagueRoundId: null }, false],
    ['den som startet en ligaflight', { createdBy: 'me', leagueRoundId: 'round-1' }, false],
    ['ukjent oppretter', { createdBy: null, leagueRoundId: null }, false],
  ])('%s', (_label, game, expected) => {
    expect(isGameOrganiser(game, 'me')).toBe(expected);
  });
});
