import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import noMessages from '@/messages/no.json';
import type { NotificationTranslator } from './cardContent';
import { filterInboxWire } from './inboxFilter';
import {
  buildInboxEntryView,
  buildInboxSections,
  countActionRows,
  type InboxRow,
  type InboxSectionKey,
  type InboxTextContext,
} from './inboxSections';
import { buildInboxWire, type InboxWireInput } from './inboxWire';
import { KNOWN_KINDS } from './readOnVisit';
import { TEST_GAME_ID, testPayloads } from './testPayloads';
import type { NotificationKind, NotificationPayload } from './types';

/**
 * Type A (#2759): the app gets the board the web inbox renders. AK 1–4 in the
 * contract. The web side is `buildInboxSections` + `buildInboxEntryView`, which
 * `InboxClient` calls; the rows are the shared payloads.
 */

// 2026-10-01 is summer time in Oslo (UTC+2). NOW = 10:00 Oslo.
const NOW = new Date('2026-10-01T08:00:00Z').getTime();
const SECTIONS: InboxSectionKey[] = ['action', 'today', 'earlier'];

function translator(namespace: 'inbox' | 'finishedCard'): NotificationTranslator {
  return createTranslator({
    locale: 'no',
    messages: noMessages,
    namespace,
    timeZone: 'Europe/Oslo',
  }) as unknown as NotificationTranslator;
}
const TEXT = {
  t: translator('inbox'),
  tFinished: translator('finishedCard'),
  locale: 'no' as const,
};

let seq = 0;
function row(
  kind: NotificationKind,
  over: { payload?: object; read?: boolean; at?: string } = {},
): InboxRow {
  seq += 1;
  return {
    id: `n-${seq}`,
    kind,
    payload: { ...testPayloads[kind], ...over.payload } as NotificationPayload,
    read_at: over.read ? '2026-10-01T07:59:00Z' : null,
    created_at: over.at ?? new Date(NOW - seq * 60_000).toISOString(),
  };
}

function input(rows: InboxRow[], over: Partial<InboxWireInput> = {}): InboxWireInput {
  return {
    rows,
    now: NOW,
    teeOffByGame: {},
    resultByGame: {},
    finishedGameIds: [],
    leagueFlightGameIds: [],
    ...over,
  };
}

const MIXED = () => [
  row('peer_approval_request', { payload: { submitter_name: 'Marte Li', submitter_id: 'marte' } }),
  row('peer_approval_request', { payload: { submitter_name: 'Jonas Berg', submitter_id: 'jonas' } }),
  row('registration_request', {
    payload: { requester_name: 'Kristian Moe', request_id: '99999999-9999-9999-9999-999999999999' },
  }),
  row('friend_request', { payload: { actor_name: 'Anders Moe' } }),
  row('friend_accepted', { payload: { actor_name: 'Eva Dal' } }),
  row('friend_accepted', { payload: { actor_name: 'Per Dal' }, read: true, at: '2026-09-20T08:00:00Z' }),
  row('game_finished', { at: '2026-09-30T08:00:00Z' }),
  row('game_cancelled', { read: true }),
  row('scorecard_submitted', { payload: { player_name: 'Marte Li', player_id: 'marte' } }),
  row('scorecard_submitted', { payload: { player_name: 'Jonas Berg', player_id: 'jonas' }, read: true }),
];

describe('buildInboxWire', () => {
  it('samme rader gir samme seksjoner, tekster og tall som webben', () => {
    const rows = MIXED();
    const wire = buildInboxWire(input(rows), { ...TEXT, surface: 'web' });
    const ctx: InboxTextContext = {
      ...TEXT,
      now: NOW,
      teeOffByGame: {},
      resultByGame: {},
      finishedGameIds: [],
      leagueFlightGameIds: [],
    };
    const web = buildInboxSections(rows, { filter: 'all', now: NOW });

    expect(wire.actionCount).toBe(countActionRows(rows));
    for (const key of SECTIONS) {
      expect(wire.sections[key].map((entry) => entry.key)).toEqual(web[key].map((entry) => entry.key));
      web[key].forEach((entry, i) => {
        expect(wire.sections[key][i]).toMatchObject(buildInboxEntryView(entry, key, ctx));
      });
    }
    // Det kan ikke bare være likt tomt.
    expect(wire.sections.action[0]?.title).toBe('2 scorekort venter på deg');
  });

  it('en gruppe bærer de uleste radene sine, ikke de leste (#1665)', () => {
    const rows = MIXED();
    const wire = buildInboxWire(input(rows), { ...TEXT, surface: 'web' });
    const delivered = rows.filter((r) => r.kind === 'scorecard_submitted');
    const group = wire.sections.today.find((entry) => entry.key === `scorecard_submitted:${TEST_GAME_ID}`);
    expect(group?.unread).toBe(true);
    expect(group?.unreadIds).toEqual([delivered[0]!.id]);
    expect(group?.decidable).toBe(false);
  });

  it('bare en påmelding som venter på svar kan besvares, og nøkkelen er varselets id', () => {
    const request = row('registration_request', {
      payload: { requester_name: 'Kristian Moe', request_id: '99999999-9999-9999-9999-999999999999' },
    });
    const heads = row('registration_request', { payload: { requester_name: 'Ola Moe' } });
    const wire = buildInboxWire(input([request, heads]), { ...TEXT, surface: 'web' });
    expect(wire.sections.action.map((e) => [e.key, e.decidable])).toEqual([[request.id, true]]);
    expect(wire.sections.today.every((e) => !e.decidable)).toBe(true);
  });

  // #2759, eierens svar 04.11: et trykk tar ikke saken ut av «Krever handling».
  it('en sak som venter, har ingen rader et trykk kan merke, men er ulest', () => {
    const peer = row('peer_approval_request', { payload: { submitter_name: 'Marte Li', submitter_id: 'marte' } });
    const wire = buildInboxWire(input([peer]), { ...TEXT, surface: 'app' });
    expect(wire.sections.action[0]).toMatchObject({ unread: true, unreadIds: [] });
  });

  it('en rad som bare forteller noe, kan merkes', () => {
    const cancelled = row('game_cancelled');
    const wire = buildInboxWire(input([cancelled]), { ...TEXT, surface: 'app' });
    expect(wire.sections.today[0]).toMatchObject({ unread: true, unreadIds: [cancelled.id] });
  });

  it('«Marker alt lest» gjelder bare rader den kan merke: bare saker som venter gir false', () => {
    const peer = row('peer_approval_request', { payload: { submitter_name: 'Marte Li', submitter_id: 'marte' } });
    expect(buildInboxWire(input([peer]), { ...TEXT, surface: 'app' }).hasUnread).toBe(false);
    expect(buildInboxWire(input([peer, row('game_cancelled')]), { ...TEXT, surface: 'app' }).hasUnread).toBe(true);
  });

  it('tallet på konvolutten teller uleste og saker som venter, ikke nyheter eller ukjente typer', () => {
    const peer = row('peer_approval_request', { payload: { submitter_name: 'Marte Li', submitter_id: 'marte' } });
    const news = row('product_update');
    const seen = row('game_cancelled', { read: true });
    const unknown = { ...row('invite'), kind: 'fra_en_nyere_versjon' as NotificationKind };
    const wire = buildInboxWire(input([peer, row('game_cancelled'), news, seen, unknown]), { ...TEXT, surface: 'app' });
    expect(wire.unreadCount).toBe(2);
  });

  it('hasUnread følger de synlige radene', () => {
    const read = row('game_cancelled', { read: true });
    expect(buildInboxWire(input([read]), { ...TEXT, surface: 'web' }).hasUnread).toBe(false);
    const unknown = { ...row('invite'), kind: 'fra_en_nyere_versjon' as NotificationKind };
    expect(buildInboxWire(input([read, unknown]), { ...TEXT, surface: 'web' }).hasUnread).toBe(false);
    expect(buildInboxWire(input([read, row('game_cancelled')]), { ...TEXT, surface: 'web' }).hasUnread).toBe(true);
  });

  it.each([...KNOWN_KINDS])('%s gir en rad uten kast, ulest og lest', (kind) => {
    const wire = buildInboxWire(input([row(kind), row(kind, { read: true })]), { ...TEXT, surface: 'app' });
    const entries = SECTIONS.flatMap((key) => wire.sections[key]);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect(entry.title.length).toBeGreaterThan(0);
  });

  it('en ukjent type utelates og velter ikke svaret (#2480)', () => {
    const known = row('invite');
    const unknown = { ...row('invite'), kind: 'fra_en_nyere_versjon' as NotificationKind };
    const wire = buildInboxWire(input([known, unknown]), { ...TEXT, surface: 'app' });
    expect(wire.sections.action.map((entry) => entry.key)).toEqual([known.id]);
    expect(wire.actionCount).toBe(1);
  });

  it('purringen sier ikke beløpet i appen, og sier det på webben', () => {
    const reminder = row('payment_reminder', {
      payload: { entry_fee_kr: 250 },
      read: true,
    });
    const line = (surface: 'app' | 'web') =>
      buildInboxWire(input([reminder]), { ...TEXT, surface }).sections.today[0]!.subtitle;
    expect(line('app')).not.toMatch(/250/);
    expect(line('web')).toMatch(/250/);
  });
});

describe('filterInboxWire', () => {
  it.each(['friends', 'action'] as const)('%s gir samme rader som buildInboxSections', (filter) => {
    const rows = MIXED();
    const wire = buildInboxWire(input(rows), { ...TEXT, surface: 'app' });
    const filtered = filterInboxWire(wire.sections, filter);
    const web = buildInboxSections(rows, { filter, now: NOW });
    for (const key of SECTIONS) {
      expect(filtered[key].map((entry) => entry.key)).toEqual(web[key].map((entry) => entry.key));
    }
    expect(SECTIONS.flatMap((key) => filtered[key]).length).toBeGreaterThan(0);
  });

  it('«Alle» endrer ingenting', () => {
    const wire = buildInboxWire(input(MIXED()), { ...TEXT, surface: 'app' });
    expect(filterInboxWire(wire.sections, 'all')).toBe(wire.sections);
  });
});
