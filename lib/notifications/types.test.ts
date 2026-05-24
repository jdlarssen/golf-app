import { describe, it, expect } from 'vitest';
import { parseNotificationPayload, type NotificationKind } from './types';

describe('parseNotificationPayload', () => {
  it('aksepterer gyldig invite-payload', () => {
    const result = parseNotificationPayload('invite', {
      game_id: '11111111-1111-1111-1111-111111111111',
      game_name: 'Hauger Open',
      invited_by_name: 'Per',
    });
    expect(result.kind).toBe('invite');
    expect(result.payload.game_name).toBe('Hauger Open');
  });

  it('aviser invite-payload uten game_id', () => {
    expect(() =>
      parseNotificationPayload('invite', { game_name: 'X', invited_by_name: 'Y' }),
    ).toThrow();
  });

  it('aksepterer alle 5 kind-verdier', () => {
    const kinds: NotificationKind[] = [
      'invite',
      'peer_approval_request',
      'scorecard_submitted',
      'scorecard_approved',
      'game_finished',
    ];
    for (const kind of kinds) {
      expect(() =>
        parseNotificationPayload(kind, {
          game_id: '11111111-1111-1111-1111-111111111111',
          game_name: 'X',
          ...(kind === 'invite' && { invited_by_name: 'Per' }),
          ...(kind === 'peer_approval_request' && { submitter_name: 'Per' }),
          ...(kind === 'scorecard_submitted' && { player_name: 'Per' }),
          ...(kind === 'scorecard_approved' && { approver_name: 'Per' }),
        }),
      ).not.toThrow();
    }
  });
});
