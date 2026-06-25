import { describe, it, expect } from 'vitest';
import { notificationDestination } from './deeplink';
import type { NotificationKind, NotificationPayload } from './types';

function n<K extends NotificationKind>(kind: K, payload: NotificationPayload<K>) {
  return { kind, payload };
}

const GAME = '11111111-1111-1111-1111-111111111111';
const TOURNAMENT = '22222222-2222-2222-2222-222222222222';
const GROUP = '33333333-3333-3333-3333-333333333333';

describe('notificationDestination', () => {
  it('maps game-anchored kinds to their game route', () => {
    expect(
      notificationDestination(
        n('invite', { game_id: GAME, game_name: 'X', invited_by_name: 'Per' }),
      ),
    ).toBe(`/games/${GAME}`);
    expect(
      notificationDestination(
        n('player_added', { game_id: GAME, game_name: 'X', added_by_name: 'Per' }),
      ),
    ).toBe(`/games/${GAME}`);
    expect(
      notificationDestination(
        n('game_finished', { game_id: GAME, game_name: 'X' }),
      ),
    ).toBe(`/games/${GAME}/leaderboard`);
  });

  it('maps registration_request to the admin signups route', () => {
    expect(
      notificationDestination(
        n('registration_request', {
          game_id: GAME,
          game_name: 'X',
          requester_name: 'Per',
        }),
      ),
    ).toBe(`/admin/games/${GAME}/signups`);
  });

  it('maps cup and club kinds to their routes', () => {
    expect(
      notificationDestination(
        n('cup_finished', { tournament_id: TOURNAMENT, tournament_name: 'C' }),
      ),
    ).toBe(`/cup/${TOURNAMENT}`);
    expect(
      notificationDestination(
        n('club_join_request', {
          group_id: GROUP,
          group_name: 'K',
          requester_name: 'Per',
        }),
      ),
    ).toBe(`/klubber/${GROUP}`);
  });

  it('returns null for product_update — its link is reached via the card CTA, not a whole-card tap', () => {
    // A product_update with a long body used to whole-card-navigate to the
    // link, so tapping to read more threw you out to the link before you could
    // finish reading. Navigation now lives on a dedicated CTA button in the
    // card (mirroring the home banner); the card tap only marks-as-read.
    expect(
      notificationDestination(
        n('product_update', {
          source_id: GAME,
          title: 'T',
          body: 'B',
          link: '/spillformater/wolf',
          cta_label: 'Se Wolf',
        }),
      ),
    ).toBeNull();
  });

  it('returns null for notifications with no real destination (would self-link to /innboks)', () => {
    // product_update without a link used to fall back to /innboks (self).
    expect(
      notificationDestination(
        n('product_update', { source_id: GAME, title: 'T', body: 'B' }),
      ),
    ).toBeNull();
    // registration_rejected used to return /innboks (self).
    expect(
      notificationDestination(
        n('registration_rejected', { game_id: GAME, game_name: 'X' }),
      ),
    ).toBeNull();
  });
});
