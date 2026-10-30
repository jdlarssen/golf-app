import { isGameOrganiser } from './gameOrganiser';

describe('isGameOrganiser (#2688)', () => {
  it.each([
    ['oppretteren av et vanlig spill', { createdBy: 'me', leagueRoundId: null, requirePeerApproval: false }, true],
    ['oppretteren av et vanlig spill med godkjenning', { createdBy: 'me', leagueRoundId: null, requirePeerApproval: true }, true],
    ['en annen enn oppretteren', { createdBy: 'ola', leagueRoundId: null, requirePeerApproval: false }, false],
    ['den som startet en vanlig ligaflight', { createdBy: 'me', leagueRoundId: 'round-1', requirePeerApproval: false }, true],
    ['den som startet en simulatorligaflight', { createdBy: 'me', leagueRoundId: 'round-1', requirePeerApproval: true }, false],
    ['ukjent oppretter', { createdBy: null, leagueRoundId: null, requirePeerApproval: false }, false],
  ])('%s', (_label, game, expected) => {
    expect(isGameOrganiser(game, 'me')).toBe(expected);
  });
});
