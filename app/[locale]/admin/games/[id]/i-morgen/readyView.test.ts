import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import noMessages from '@/messages/no.json';
import { buildReadyView, type ReadyPerson } from './readyView';

/**
 * Type A (#2483): what «Klar for i morgen?» says, row by row, through the real
 * Norwegian catalog. `now` is passed in: Friday 20 November 2026, 19:00 Oslo,
 * the evening before Saturday's round at 09:00.
 */

const t = createTranslator({
  locale: 'no',
  messages: noMessages,
  namespace: 'admin.game.tomorrow',
  timeZone: 'Europe/Oslo',
}) as unknown as Parameters<typeof buildReadyView>[0]['t'];

const NOW = Date.parse('2026-11-20T18:00:00.000Z');
const TEE_OFF = '2026-11-21T08:00:00.000Z';

function person(full: string, overrides: Partial<ReadyPerson> = {}): ReadyPerson {
  return {
    user_id: full.toLowerCase().replace(/\s+/g, '-'),
    flight_number: null,
    withdrawn_at: null,
    accepted_at: '2026-11-11T10:00:00.000Z',
    is_guest: false,
    full,
    short: full.split(' ')[0],
    ...overrides,
  };
}

function view(people: ReadyPerson[], overrides: Partial<Parameters<typeof buildReadyView>[0]> = {}) {
  return buildReadyView({
    gameId: 'g1',
    title: 'Lørdagsrunden',
    status: 'scheduled',
    gameMode: 'stableford',
    teamSize: 1,
    teeOffIso: TEE_OFF,
    courseName: 'Byneset North',
    teeName: 'Gul',
    statusLabel: 'Planlagt',
    people,
    invitedAt: new Map(),
    purret: null,
    now: NOW,
    locale: 'no',
    t,
    ...overrides,
  });
}

const rows = (v: ReturnType<typeof view>) => v.rows.map((r) => [r.tone, r.title, r.sub]);

// The artboard: seven confirmed in two flights, Kari Lund has not answered.
const confirmedSeven = ['Marte', 'Jonas', 'Anders', 'Ida', 'Sondre', 'Tone', 'Eirik'].map((n, i) =>
  person(`${n} Hansen${i}`, { short: n, flight_number: i < 4 ? 1 : 2 }),
);
const kari = person('Kari Lund', { accepted_at: null, flight_number: 2 });

describe('buildReadyView', () => {
  it('the artboard: confirmed, Kari with «Purr», course and tee-off, two flights', () => {
    const v = view([...confirmedSeven, kari], {
      invitedAt: new Map([[kari.user_id, '2026-11-11T10:00:00.000Z']]),
    });
    expect([v.heading, v.kicker]).toEqual(['Klar for i morgen?', 'Lørdagsrunden · i morgen 09:00']);
    expect(rows(v)).toEqual([
      ['ok', '7 av 8 har bekreftet', 'Anders, Eirik, Ida, Jonas, Marte, Sondre og Tone'],
      ['warn', 'Kari Lund har ikke svart', 'Invitert forrige uke'],
      ['ok', 'Byneset North, Gul tee', 'Tee-off 09:00'],
      ['ok', 'To flights', 'Flight 1: Anders, Ida, Jonas og Marte · Flight 2: Eirik, Kari, Sondre og Tone'],
    ]);
    expect(v.rows[1].remind).toEqual({ userId: kari.user_id, name: 'Kari' });
    expect(v.links.map((l) => [l.label, l.href])).toEqual([
      ['Flytt runden', '/games/g1/flytt'],
      ['Se startlista', '/admin/games/g1/startlista'],
    ]);
  });

  it('everyone confirmed: no row to remind, «Alle 8 har bekreftet»; a guest counts', () => {
    const guest = person('Gjest Gjestesen', { accepted_at: null, is_guest: true, flight_number: 2 });
    const v = view([...confirmedSeven, guest]);
    expect(v.rows.map((r) => r.testId)).toEqual(['ready-row-confirmed', 'ready-row-course', 'ready-row-flights']);
    expect(v.rows[0].title).toBe('Alle 8 har bekreftet');
  });

  it('right after «Purr Kari» her row says «Purret»', () => {
    const v = view([...confirmedSeven, kari], { purret: kari.user_id });
    expect(v.rows[1].purredLabel).toBe('Purret');
  });

  it('a withdrawn player is not counted and not reminded', () => {
    const v = view([person('Ola Nordmann', { accepted_at: null, withdrawn_at: '2026-11-15T10:00:00.000Z' }), ...confirmedSeven.slice(0, 3)]);
    expect(v.rows[0].title).toBe('Alle 3 har bekreftet');
  });

  it('a small round is one flight; a bigger one without flights points to the Startlista', () => {
    const four = confirmedSeven.slice(0, 4).map((p) => ({ ...p, flight_number: null }));
    expect(rows(view(four)).at(-1)).toEqual(['ok', 'Én flight', 'Anders, Ida, Jonas og Marte']);
    const six = confirmedSeven.slice(0, 6).map((p) => ({ ...p, flight_number: null }));
    expect(rows(view(six)).at(-1)).toEqual(['warn', 'Ingen flighter ennå', 'Del inn spillerne på startlista']);
  });

  it('a player without a flight is counted on the flights row', () => {
    const v = view([...confirmedSeven, { ...kari, flight_number: null }]);
    expect(rows(v).at(-1)).toEqual([
      'warn',
      'To flights',
      'Flight 1: Anders, Ida, Jonas og Marte · Flight 2: Eirik, Sondre og Tone · 1 uten flight',
    ]);
  });

  it('a round further off is «Klar for runden?» with its day', () => {
    const v = view(confirmedSeven, { now: Date.parse('2026-11-18T18:00:00.000Z') });
    expect([v.heading, v.kicker, v.rows[1].sub]).toEqual([
      'Klar for runden?',
      'Lørdagsrunden · lørdag 21. nov. 09:00',
      'Tee-off lørdag 21. nov. kl. 09:00',
    ]);
  });

  it('two players with the same first name are shown in full', () => {
    const v = view([person('Kari Lund'), person('Kari Berg'), person('Ola Nordmann')]);
    expect(v.rows[0].sub).toBe('Kari Berg, Kari Lund og Ola');
  });
});
