import { describe, expect, it } from 'vitest';
import {
  STALE_AFTER_MS,
  allDelivered,
  deliveryNoticeRecipient,
  isStale,
  organizerNoticesApply,
} from './organizerNoticeRules';

const ORG = 'org';
const PER = 'per';
const KARI = 'kari';

describe('organizerNoticesApply', () => {
  it.each([
    ['a plain game', { created_by: ORG, tournament_id: null, source_game_id: null }, true],
    // A league flight has no tournament; its creator is the player who started it.
    ['a league flight', { created_by: PER, tournament_id: null, source_game_id: null }, true],
    ['a cup match', { created_by: ORG, tournament_id: 't1', source_game_id: null }, false],
    ['a derived game', { created_by: ORG, tournament_id: null, source_game_id: 'g0' }, false],
    ['no organiser', { created_by: null, tournament_id: null, source_game_id: null }, false],
  ] as const)('%s → %s', (_label, game, expected) => {
    expect(organizerNoticesApply(game)).toBe(expected);
  });
});

describe('deliveryNoticeRecipient', () => {
  it.each([
    ['another player delivers their own card', { createdBy: ORG, delivererId: PER, cardMemberIds: [PER], peerIds: [] }, ORG],
    ['the organiser delivers their own card', { createdBy: ORG, delivererId: ORG, cardMemberIds: [ORG], peerIds: [] }, null],
    ['the organiser delivers a flightmate’s card', { createdBy: ORG, delivererId: ORG, cardMemberIds: [PER], peerIds: [] }, null],
    ['a flightmate delivers the organiser’s card', { createdBy: ORG, delivererId: PER, cardMemberIds: [ORG], peerIds: [] }, null],
    ['a teammate delivers the team card the organiser is on', { createdBy: ORG, delivererId: PER, cardMemberIds: [PER, ORG], peerIds: [] }, null],
    ['the organiser approves this card instead', { createdBy: ORG, delivererId: PER, cardMemberIds: [PER], peerIds: [KARI, ORG] }, null],
    ['peers who are not the organiser change nothing', { createdBy: ORG, delivererId: PER, cardMemberIds: [PER], peerIds: [KARI] }, ORG],
    ['no organiser', { createdBy: null, delivererId: PER, cardMemberIds: [PER], peerIds: [] }, null],
  ] as const)('%s → %s', (_label, input, expected) => {
    expect(deliveryNoticeRecipient(input)).toBe(expected);
  });
});

describe('allDelivered', () => {
  const card = (submitted: boolean, opts: { approved?: boolean; withdrawn?: boolean } = {}) => ({
    submitted_at: submitted ? '2026-10-05T10:00:00Z' : null,
    approved_at: opts.approved ? '2026-10-05T10:05:00Z' : null,
    withdrawn_at: opts.withdrawn ? '2026-10-05T09:00:00Z' : null,
  });

  it.each([
    ['everyone delivered', [card(true), card(true)], false, true],
    ['one is missing', [card(true), card(false)], false, false],
    ['one player, delivered', [card(true)], false, true],
    ['a withdrawn player never counts as missing', [card(true), card(false, { withdrawn: true })], false, true],
    ['everyone withdrew: nothing to finish', [card(false, { withdrawn: true })], false, false],
    ['nobody on the roster', [], false, false],
    ['peer approval: a delivered card still waits', [card(true, { approved: true }), card(true)], true, false],
    ['peer approval: the last card approved', [card(true, { approved: true }), card(true, { approved: true })], true, true],
    ['peer approval: one missing, the rest approved', [card(true, { approved: true }), card(false)], true, false],
  ] as const)('%s → %s', (_label, players, requirePeerApproval, expected) => {
    expect(allDelivered(players, requirePeerApproval)).toBe(expected);
  });
});

describe('isStale', () => {
  const NOW = Date.parse('2026-10-05T12:00:00Z');
  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  const DAY = STALE_AFTER_MS;

  it('the window is 24 hours', () => {
    expect(STALE_AFTER_MS).toBe(24 * 60 * 60 * 1000);
  });

  it.each([
    ['started two days ago, nothing since', { startedAt: ago(2 * DAY), lastScoreAt: null, lastRosterActivityAt: null }, true],
    ['started 23 hours ago, nothing since', { startedAt: ago(DAY - 3_600_000), lastScoreAt: null, lastRosterActivityAt: null }, false],
    ['the last score exactly 24 hours ago', { startedAt: ago(3 * DAY), lastScoreAt: ago(DAY), lastRosterActivityAt: null }, true],
    ['the last score a millisecond short of 24 hours', { startedAt: ago(3 * DAY), lastScoreAt: ago(DAY - 1), lastRosterActivityAt: null }, false],
    ['an old score, a delivery an hour ago', { startedAt: ago(3 * DAY), lastScoreAt: ago(2 * DAY), lastRosterActivityAt: ago(3_600_000) }, false],
    ['an approval or withdrawal yesterday keeps it alive', { startedAt: ago(3 * DAY), lastScoreAt: ago(3 * DAY), lastRosterActivityAt: ago(DAY / 2) }, false],
    ['score and roster at the same moment, long ago', { startedAt: ago(3 * DAY), lastScoreAt: ago(2 * DAY), lastRosterActivityAt: ago(2 * DAY) }, true],
    ['never started', { startedAt: null, lastScoreAt: null, lastRosterActivityAt: null }, false],
  ] as const)('%s → %s', (_label, input, expected) => {
    expect(isStale({ ...input, now: NOW })).toBe(expected);
  });
});
