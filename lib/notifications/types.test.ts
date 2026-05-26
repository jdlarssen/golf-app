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

  describe('selv-påmelding kinds (issue #199)', () => {
    const validUuid = '11111111-1111-1111-1111-111111111111';
    const validShortId = 'k7m3p9qx';

    it('team_invite krever game_short_id i 8-char base36-format', () => {
      const result = parseNotificationPayload('team_invite', {
        game_id: validUuid,
        game_short_id: validShortId,
        game_name: 'Sommercup',
        team_name: 'Skogen',
        invited_by_name: 'Per',
        request_id: validUuid,
      });
      expect(result.payload.team_name).toBe('Skogen');
    });

    it('avviser team_invite med ugyldig short_id (uppercase)', () => {
      expect(() =>
        parseNotificationPayload('team_invite', {
          game_id: validUuid,
          game_short_id: 'K7M3P9QX',
          game_name: 'X',
          team_name: 'Y',
          invited_by_name: 'Z',
          request_id: validUuid,
        }),
      ).toThrow();
    });

    it('registration_request aksepterer med valgfri message', () => {
      const result = parseNotificationPayload('registration_request', {
        game_id: validUuid,
        game_name: 'Klubbcup',
        requester_name: 'Per',
        request_id: validUuid,
        message: 'Gleder meg!',
      });
      expect(result.payload.requester_name).toBe('Per');
    });

    it('registration_approved krever bare game_id og game_name', () => {
      const result = parseNotificationPayload('registration_approved', {
        game_id: validUuid,
        game_name: 'Vinterklassikeren',
      });
      expect(result.payload.game_name).toBe('Vinterklassikeren');
    });

    it('registration_rejected aksepterer valgfri reason', () => {
      const result = parseNotificationPayload('registration_rejected', {
        game_id: validUuid,
        game_name: 'Klubbcup',
        reason: 'Spillet er fullt',
      });
      expect(result.payload.reason).toBe('Spillet er fullt');
    });

    it('team_member_withdrew krever short_id + withdrawn_player_name', () => {
      const result = parseNotificationPayload('team_member_withdrew', {
        game_id: validUuid,
        game_short_id: validShortId,
        game_name: 'Sommercup',
        withdrawn_player_name: 'Per',
        team_name: 'Skogen',
      });
      expect(result.payload.withdrawn_player_name).toBe('Per');
    });
  });
});
