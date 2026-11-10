import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import noMessages from '@/messages/no.json';
import type { NotificationTranslator } from './cardContent';
import {
  buildInboxEntryView,
  buildInboxSections,
  countActionRows,
  type InboxBoard,
  type InboxRow,
  type InboxSectionKey,
} from './inboxSections';
import { buildInboxWire, type InboxWire } from './inboxWire';
import { testPayloads, TEST_GAME_ID } from './testPayloads';
import { NOTIFICATION_KINDS, type NotificationKind } from './types';

/**
 * #2759: what the app gets is what the web shows, from the same rows. Type A
 * with the real catalog, so a kind without text would throw here.
 */

const NOW = new Date('2026-10-01T08:00:00Z').getTime();
const t = createTranslator({ locale: 'no', messages: noMessages, namespace: 'inbox', timeZone: 'Europe/Oslo' }) as unknown as NotificationTranslator;
const tFinished = createTranslator({ locale: 'no', messages: noMessages, namespace: 'finishedCard', timeZone: 'Europe/Oslo' }) as unknown as NotificationTranslator;

let seq = 0;
function row(kind: NotificationKind, opts: { read?: boolean; at?: string; id?: string; payload?: object } = {}): InboxRow {
  seq += 1;
  return {
    id: opts.id ?? `n-${seq}`,
    kind,
    payload: (opts.payload ?? testPayloads[kind]) as InboxRow['payload'],
    read_at: opts.read ? '2026-10-01T07:00:00Z' : null,
    created_at: opts.at ?? new Date(NOW - seq * 60_000).toISOString(),
  };
}

function board(rows: InboxRow[]): InboxBoard {
  return {
    rows,
    staleIds: [],
    settledIds: [],
    teeOffByGame: {},
    resultByGame: {},
    finishedGameIds: [],
    leagueFlightGameIds: [],
    now: NOW,
  };
}

const wireOf = (rows: InboxRow[]): InboxWire => buildInboxWire(board(rows), { t, tFinished, locale: 'no' });
const SECTIONS: InboxSectionKey[] = ['action', 'today', 'earlier'];
const all = (wire: InboxWire) => SECTIONS.flatMap((key) => wire.sections[key]);

function mixedRows(): InboxRow[] {
  const peer = (id: string, name: string) =>
    row('peer_approval_request', {
      id,
      payload: { game_id: TEST_GAME_ID, game_name: 'Lørdagsrunden', submitter_name: name, submitter_id: `${id}-owner` },
    });
  return [
    peer('p1', 'Marte Lund'),
    peer('p2', 'Jonas Bakke'),
    row('registration_request', { payload: { game_id: TEST_GAME_ID, game_name: 'Onsdagsgolfen', requester_name: 'Kristian', request_id: 'r1' } }),
    row('friend_request'),
    row('friend_accepted', { read: true }),
    row('game_finished', { read: true, at: '2026-09-20T10:00:00Z' }),
    row('game_cancelled'),
    row('scorecard_submitted'),
  ];
}

describe('buildInboxWire', () => {
  it('AK1: same sections, titles, subtitles and chip number as the web’s board', () => {
    const rows = mixedRows();
    const wire = wireOf(rows);
    const webSections = buildInboxSections(rows, { filter: 'all', now: NOW });
    const webCtx = {
      t,
      tFinished,
      locale: 'no' as const,
      now: NOW,
      teeOffByGame: {},
      resultByGame: {},
      finishedGameIds: [],
      leagueFlightGameIds: [],
    };
    for (const key of SECTIONS) {
      const web = webSections[key].map((entry) => buildInboxEntryView(entry, key, webCtx));
      expect(wire.sections[key].map((e) => [e.title, e.subtitle, e.destination, e.actionKey])).toEqual(
        web.map((v) => [v.title, v.subtitle, v.destination, v.actionKey]),
      );
    }
    expect(wire.actionCount).toBe(countActionRows(rows));
  });

  it('AK2: every kind gives a row without throwing', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const wire = wireOf([row(kind)]);
      expect(all(wire), kind).toHaveLength(1);
    }
  });

  it('AK2: a kind from a newer build is left off and takes nothing down', () => {
    const unknown = row('game_moved', { id: 'x' });
    const rows = [{ ...unknown, kind: 'kind_from_a_newer_build' as NotificationKind }, row('friend_request', { id: 'known' })];
    const wire = wireOf(rows);
    expect(all(wire).map((e) => e.key)).toEqual(['known']);
    expect(wire.unreadCount).toBe(1);
  });

  it('#2749: the fee reminder names the amount in the app, as on the web', () => {
    const reminder = row('payment_reminder', {
      payload: { game_id: TEST_GAME_ID, game_name: 'Hauger Open', entry_fee_kr: 250 },
    });
    const app = wireOf([reminder]).sections.action[0]!;
    const web = buildInboxEntryView(
      buildInboxSections([reminder], { filter: 'all', now: NOW }).action[0]!,
      'action',
      { t, tFinished, locale: 'no', now: NOW, teeOffByGame: {}, resultByGame: {}, finishedGameIds: [] },
    );
    expect(app.subtitle).toMatch(/250/);
    expect(app.subtitle).toContain('Hauger Open');
    expect(app.subtitle).toBe(web.subtitle);
  });

  it('AK4: filtering on `friend` gives the same rows as the web’s «Venner» filter', () => {
    const rows = mixedRows();
    const wire = wireOf(rows);
    const friends = buildInboxSections(rows, { filter: 'friends', now: NOW });
    for (const key of SECTIONS) {
      expect(wire.sections[key].filter((e) => e.friend).map((e) => e.key)).toEqual(friends[key].map((e) => e.key));
    }
  });

  it('a group knows every row behind it, and what a tap may mark: nothing that waits', () => {
    const wire = wireOf(mixedRows());
    const group = wire.sections.action.find((e) => e.key.startsWith('peer_approval_request'))!;
    expect(group.title).toBe('2 scorekort venter på deg');
    expect(group.unreadIds).toEqual([]);

    const delivered = (id: string, name: string) =>
      row('scorecard_submitted', { id, payload: { game_id: TEST_GAME_ID, game_name: 'X', player_name: name, player_id: id } });
    const heads = wireOf([delivered('d1', 'Marte'), delivered('d2', 'Jonas'), delivered('d3', 'Kari')]);
    expect(heads.sections.today[0]!.unreadIds.sort()).toEqual(['d1', 'd2', 'd3']);
    const withdrew = wireOf([row('team_member_withdrew', { id: 'w' })]);
    expect(withdrew.sections.action[0]!.unreadIds).toEqual(['w']);
  });

  it('only a pending signup request can be answered in place', () => {
    const wire = wireOf(mixedRows());
    expect(all(wire).filter((e) => e.decidable).map((e) => e.actionKey)).toEqual(['decide']);
  });

  describe('hasUnread is what «Marker alt lest» can touch', () => {
    it('true with an unread row that does not wait', () => {
      expect(wireOf([row('scorecard_submitted')]).hasUnread).toBe(true);
      expect(wireOf([row('team_member_withdrew')]).hasUnread).toBe(true);
    });
    it('false with only waiting rows and read rows, so the pill says «Tøm leste»', () => {
      expect(wireOf([row('invite'), row('friend_request'), row('game_finished', { read: true })]).hasUnread).toBe(false);
    });
  });

  describe('unreadCount is the envelope on Home', () => {
    it('counts rows, waiting or not, a group by its rows like the web’s dot', () => {
      expect(wireOf(mixedRows()).unreadCount).toBe(6);
    });
    it('news about Tørny does not count (QUIET_KINDS), and shows in the list', () => {
      const wire = wireOf([row('product_update')]);
      expect(wire.unreadCount).toBe(0);
      expect(all(wire)).toHaveLength(1);
    });
    it('a settled row does not count: the board has it as read already', () => {
      expect(wireOf([row('invite', { read: true })]).unreadCount).toBe(0);
    });
  });
});
