// #2759, AK5: hver rad i «Hvor et trykk fører». Stiene kommer fra den ekte
// `notificationDestination`, så en endring der slår ut her. Type A.
import { notificationDestination } from '../../../../lib/notifications/deeplink';
import { testPayloads } from '../../../../lib/notifications/testPayloads';
import type { NotificationKind } from '../../../../lib/notifications/types';
import { inboxTarget } from './inboxTarget';

const GAME = '0f8e6c1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b';

describe('inboxTarget', () => {
  it.each([
    [`/games/${GAME}`, { name: 'GameHome', params: { gameId: GAME } }],
    [`/games/${GAME}/approve`, { name: 'Approve', params: { gameId: GAME } }],
    [`/games/${GAME}/submit`, { name: 'Scorecard', params: { gameId: GAME } }],
    [`/games/${GAME}/avslutt`, { name: 'EndGame', params: { gameId: GAME } }],
    [`/games/${GAME}/holes/7`, { name: 'Hole', params: { gameId: GAME, holeNumber: 7 } }],
    [`/games/${GAME}/leaderboard`, { name: 'Leaderboard', params: { gameId: GAME } }],
    ['/liga/l1', { name: 'League', params: { leagueId: 'l1' } }],
    ['/liga/l1/runde/r1/spill', { name: 'LeagueRoundStart', params: { leagueId: 'l1', roundId: 'r1' } }],
    ['/liga/l1/godkjenn/g1/u1', { name: 'MarkerApprove', params: { leagueId: 'l1', gameId: 'g1', userId: 'u1' } }],
    ['/cup/c1', { name: 'Cup', params: { cupId: 'c1' } }],
    ['/cup/c1/resultater', { name: 'Cup', params: { cupId: 'c1' } }],
    ['/admin/cup/c1/spillere', { name: 'CupParticipants', params: { cupId: 'c1' } }],
    ['/klubber/k1/cup/c1/spillere', { name: 'CupParticipants', params: { cupId: 'c1' } }],
    ['/profile/venner', { name: 'Friends', params: { from: 'notification' } }],
    ['/profile/historikk', { name: 'RoundStats' }],
  ])('%s åpner skjermen', (path, target) => {
    expect(inboxTarget(path)).toEqual({ kind: 'screen', target });
  });

  it.each([`/admin/games/${GAME}/signups`, '/signup/abcd1234/team', '/klubber/k1'])(
    '%s finnes ikke i appen, og åpner nettsiden',
    (path) => {
      expect(inboxTarget(path)).toEqual({ kind: 'web', path });
    },
  );

  it('uten sti skjer ingen navigering', () => {
    expect(inboxTarget(null)).toEqual({ kind: 'none' });
  });

  it.each(['game_cancelled', 'registration_rejected', 'registration_expired', 'product_update'] as NotificationKind[])(
    '%s har ingen sti, så et trykk merker bare',
    (kind) => {
      expect(notificationDestination({ kind, payload: testPayloads[kind] })).toBeNull();
    },
  );

  it('ingen varseltype ender et sted appen ikke kan åpne', () => {
    for (const kind of Object.keys(testPayloads) as NotificationKind[]) {
      const destination = notificationDestination({ kind, payload: testPayloads[kind] });
      const target = inboxTarget(destination);
      if (destination === null) expect(target.kind).toBe('none');
      else expect(['screen', 'web']).toContain(target.kind);
    }
  });
});
