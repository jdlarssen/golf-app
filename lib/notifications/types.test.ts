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

  it('aksepterer alle 5 game-scoped kind-verdier', () => {
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

  describe('product_update', () => {
    const validSourceId = '22222222-2222-2222-2222-222222222222';

    it('aksepterer minimal payload (kun obligatoriske felter)', () => {
      const result = parseNotificationPayload('product_update', {
        source_id: validSourceId,
        title: 'Texas scramble er ute!',
        body: 'Ny modus tilgjengelig.',
      });
      expect(result.kind).toBe('product_update');
      expect(result.payload.title).toBe('Texas scramble er ute!');
    });

    it('aksepterer full payload med link + cta_label', () => {
      const result = parseNotificationPayload('product_update', {
        source_id: validSourceId,
        title: 'Sideturneringen vokser',
        body: '14 nye bonus-kategorier å jakte på.',
        link: '/admin/games/new',
        cta_label: 'Prøv det',
      });
      const payload = result.payload as { link?: string };
      expect(payload.link).toBe('/admin/games/new');
    });

    it('avviser eksterne links (link må starte med /)', () => {
      expect(() =>
        parseNotificationPayload('product_update', {
          source_id: validSourceId,
          title: 'X',
          body: 'Y',
          link: 'https://example.com',
        }),
      ).toThrow();
    });

    it('avviser payload uten title', () => {
      expect(() =>
        parseNotificationPayload('product_update', {
          source_id: validSourceId,
          body: 'Y',
        }),
      ).toThrow();
    });

    it('avviser tom title', () => {
      expect(() =>
        parseNotificationPayload('product_update', {
          source_id: validSourceId,
          title: '',
          body: 'Y',
        }),
      ).toThrow();
    });
  });
});
