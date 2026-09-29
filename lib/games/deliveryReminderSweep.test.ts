import { describe, it, expect } from 'vitest';
import {
  REMINDER_QUIET_MS,
  deliveryReminderGroups,
  type SweepPlayer,
  type SweepScore,
} from './deliveryReminderSweep';
import type { DeliveryGame } from './flightDelivery';

// Type A (#2200 del 2): who gets the delivery reminder, and for which cards.
// A card is due a quarter of an hour after its last hole (the owner's answer
// 2026-09-27: «Et kvarter, én gang»). The reminder goes to the one who keyed
// the last hole when they can deliver the card, otherwise to its owner.

const NOW = Date.parse('2026-09-29T12:00:00.000Z');
const OLD = new Date(NOW - REMINDER_QUIET_MS - 60_000).toISOString();

const stableford: DeliveryGame = {
  game_mode: 'stableford',
  hole_segment: 'full',
  source_game_id: null,
};

function player(user_id: string, overrides: Partial<SweepPlayer> = {}): SweepPlayer {
  return {
    user_id,
    team_number: null,
    flight_number: 1,
    withdrawn_at: null,
    submitted_at: null,
    deliver_reminder_sent_at: null,
    is_guest: false,
    ...overrides,
  };
}

/** A card with `holes` holes, all keyed by `by`, the last one at `lastAt`. */
function card(
  user_id: string,
  by: string,
  { holes = 18, lastAt = OLD, lastBy = by }: { holes?: number; lastAt?: string; lastBy?: string } = {},
): SweepScore[] {
  return Array.from({ length: holes }, (_, i) => ({
    user_id,
    hole_number: i + 1,
    strokes: 4,
    entered_by: i === holes - 1 ? lastBy : by,
    updated_at: i === holes - 1 ? lastAt : new Date(Date.parse(lastAt) - (holes - i) * 60_000).toISOString(),
  }));
}

function groups(players: SweepPlayer[], scores: SweepScore[], opts: { game?: DeliveryGame; siblings?: Set<string> } = {}) {
  return deliveryReminderGroups({
    players,
    scores,
    game: opts.game ?? stableford,
    now: NOW,
    undeliveredSiblingUserIds: opts.siblings,
  });
}

describe('deliveryReminderGroups', () => {
  it('tomt spill: ingen påminnelser', () => {
    expect(groups([], [])).toEqual([]);
  });

  it('ett fullt eget kort, siste hull for over et kvarter siden: eieren får én påminnelse', () => {
    expect(groups([player('kari')], card('kari', 'kari'))).toEqual([
      { recipientId: 'kari', cardUserIds: ['kari'], otherCardUserIds: [] },
    ]);
  });

  it('føreren av tre kort får én samlet påminnelse, gjestekortet med', () => {
    const players = [player('kari'), player('ola'), player('gjest', { is_guest: true })];
    const scores = [...card('kari', 'kari'), ...card('ola', 'kari'), ...card('gjest', 'kari')];

    expect(groups(players, scores)).toEqual([
      { recipientId: 'kari', cardUserIds: ['kari', 'ola', 'gjest'], otherCardUserIds: ['ola', 'gjest'] },
    ]);
  });

  it('føreren har levert sitt eget: påminnelsen gjelder bare makkerkortene', () => {
    const players = [player('kari', { submitted_at: OLD }), player('ola')];
    const scores = [...card('kari', 'kari'), ...card('ola', 'kari')];

    expect(groups(players, scores)).toEqual([
      { recipientId: 'kari', cardUserIds: ['ola'], otherCardUserIds: ['ola'] },
    ]);
  });

  it.each([
    ['nøyaktig et kvarter siden: purres', REMINDER_QUIET_MS, true],
    ['ett sekund under et kvarter: purres ikke ennå', REMINDER_QUIET_MS - 1000, false],
  ])('%s', (_label, ageMs, due) => {
    const lastAt = new Date(NOW - ageMs).toISOString();
    const result = groups([player('kari')], card('kari', 'kari', { lastAt }));
    expect(result.length).toBe(due ? 1 : 0);
  });

  it('en fører med flere kort får én påminnelse et kvarter etter det siste av dem, ikke én per kort', () => {
    // Evaluator F1: Kari keyed three cards. Ola's hole 7 was corrected two
    // minutes after the last hole, so his card went quiet later than the other
    // two. A run in between must not remind Kari twice.
    const T0 = Date.parse('2026-09-29T11:00:00.000Z');
    const at = (ms: number) => new Date(ms).toISOString();
    const players = [player('kari'), player('ola'), player('gjest', { is_guest: true })];
    const scores = [
      ...card('kari', 'kari', { lastAt: at(T0) }),
      ...card('ola', 'kari', { lastAt: at(T0) }).map((s) =>
        s.hole_number === 7 ? { ...s, updated_at: at(T0 + 2 * 60_000) } : s,
      ),
      ...card('gjest', 'kari', { lastAt: at(T0) }),
    ];
    const runAt = (minutes: number) =>
      deliveryReminderGroups({ players, scores, game: stableford, now: T0 + minutes * 60_000 });

    expect(runAt(16)).toEqual([]);
    expect(runAt(17)).toEqual([
      { recipientId: 'kari', cardUserIds: ['kari', 'ola', 'gjest'], otherCardUserIds: ['ola', 'gjest'] },
    ]);
  });

  it('17 av 18 hull: ikke ferdig, ingen påminnelse', () => {
    expect(groups([player('kari')], card('kari', 'kari', { holes: 17 }))).toEqual([]);
  });

  it.each([
    ['alt purret', { deliver_reminder_sent_at: OLD }],
    ['levert', { submitted_at: OLD }],
    ['trukket', { withdrawn_at: OLD }],
  ])('et kort som er %s, er ikke med', (_label, overrides) => {
    expect(groups([player('kari', overrides)], card('kari', 'kari'))).toEqual([]);
  });

  it('en trukket fører får ingenting; eieren av et vanlig kort får sitt eget', () => {
    const players = [player('kari', { withdrawn_at: OLD }), player('ola'), player('gjest', { is_guest: true })];
    const scores = [...card('ola', 'kari'), ...card('gjest', 'kari')];

    // Ola can deliver his own card; the guest cannot, and nobody else keyed it.
    expect(groups(players, scores)).toEqual([
      { recipientId: 'ola', cardUserIds: ['ola'], otherCardUserIds: [] },
    ]);
  });

  it('siste hull tastet av en som ikke kan levere kortet: eieren får påminnelsen', () => {
    // Ola keyed 1–17 himself and Kari keyed 18. Kari may not deliver Ola's
    // card (flightDeliveryCandidates), so a reminder to her would be a dead end.
    const players = [player('kari'), player('ola')];
    const scores = card('ola', 'ola', { lastBy: 'kari' });

    expect(groups(players, scores)).toEqual([
      { recipientId: 'ola', cardUserIds: ['ola'], otherCardUserIds: [] },
    ]);
  });

  it('likt tidspunkt på to hull: høyest hullnummer avgjør hvem som tastet sist', () => {
    // A guest card may be delivered by anyone in the flight once it is full,
    // so both Ola and Kari could get this reminder. Hole 17 (Ola) and hole 18
    // (Kari) were written at the same instant: hole 18 wins.
    const players = [player('kari'), player('ola'), player('gjest', { is_guest: true })];
    const scores = card('gjest', 'ola').map((s) =>
      s.hole_number >= 17 ? { ...s, updated_at: OLD, entered_by: s.hole_number === 18 ? 'kari' : 'ola' } : s,
    );
    expect(groups(players, scores)).toEqual([
      { recipientId: 'kari', cardUserIds: ['gjest'], otherCardUserIds: ['gjest'] },
    ]);
  });

  it('split-cup: en front9-spiller med ulevert back9-søsken purres ikke her', () => {
    const front9: DeliveryGame = { game_mode: 'stableford', hole_segment: 'front9', source_game_id: null };
    const scores = card('kari', 'kari', { holes: 9 });

    expect(groups([player('kari')], scores, { game: front9, siblings: new Set(['kari']) })).toEqual([]);
    expect(groups([player('kari')], scores, { game: front9 })).toEqual([
      { recipientId: 'kari', cardUserIds: ['kari'], otherCardUserIds: [] },
    ]);
  });

  it('ett-balls-lag: lagkameratens kort går til den som førte, og teller ikke som andres', () => {
    const scramble: DeliveryGame = { game_mode: 'texas_scramble', hole_segment: 'full', source_game_id: null };
    // Kari is the captain (lex-min on team 1) and holds the team's rows.
    const players = [player('kari', { team_number: 1 }), player('ola', { team_number: 1 })];
    const scores = card('kari', 'kari');

    expect(groups(players, scores, { game: scramble })).toEqual([
      { recipientId: 'kari', cardUserIds: ['kari', 'ola'], otherCardUserIds: [] },
    ]);
  });

  // Porterte fra den gamle sidebesøk-purringen (#2041, #2067): lagkortene.
  function rows(user_id: string, from: number, to: number, by = user_id): SweepScore[] {
    return Array.from({ length: to - from + 1 }, (_, i) => ({
      user_id,
      hole_number: from + i,
      strokes: 4,
      entered_by: by,
      updated_at: new Date(Date.parse(OLD) - (to - from - i) * 60_000).toISOString(),
    }));
  }

  it('patsome: hver leverer sitt eget, så kapteinen får ikke makkerens påminnelse', () => {
    // Makker has 6 own rows and 12 on the captain's shared ball. Patsome has
    // no team cascade and no flight delivery: the captain cannot deliver the
    // makker's card, so the makker gets their own reminder.
    const game: DeliveryGame = { game_mode: 'patsome', hole_segment: 'full', source_game_id: null };
    const players = [player('kaptein', { team_number: 1 }), player('makker', { team_number: 1 })];
    const scores = [...rows('kaptein', 1, 18), ...rows('makker', 1, 6)];

    expect(groups(players, scores, { game })).toEqual([
      { recipientId: 'kaptein', cardUserIds: ['kaptein'], otherCardUserIds: [] },
      { recipientId: 'makker', cardUserIds: ['makker'], otherCardUserIds: [] },
    ]);
  });

  it('best ball: makkeren uten egne rader er ikke ferdig, selv om kapteinen har 18', () => {
    const game: DeliveryGame = { game_mode: 'best_ball', hole_segment: 'full', source_game_id: null };
    const players = [player('kaptein', { team_number: 1 }), player('makker', { team_number: 1 })];

    expect(groups(players, rows('kaptein', 1, 18), { game })).toEqual([
      { recipientId: 'kaptein', cardUserIds: ['kaptein'], otherCardUserIds: [] },
    ]);
  });

  it('texas scramble med trukket kaptein: makkeren med 9 hull på kapteinen og 9 egne purres (#2067)', () => {
    const game: DeliveryGame = { game_mode: 'texas_scramble', hole_segment: 'full', source_game_id: null };
    const players = [
      player('kaptein', { team_number: 1, withdrawn_at: '2026-09-29T09:00:00.000Z' }),
      player('makker', { team_number: 1 }),
    ];
    const scores = [...rows('kaptein', 1, 9), ...rows('makker', 10, 18)];

    expect(groups(players, scores, { game })).toEqual([
      { recipientId: 'makker', cardUserIds: ['makker'], otherCardUserIds: [] },
    ]);
  });

  it('lagkort ført av en fra det andre laget: én påminnelse til laget, ikke én per medlem', () => {
    // Evaluator F3: four players are one flight, so Per (team 2) could key
    // team 1's shared ball. Per cannot deliver it, but anyone on team 1 can,
    // with one delivery. One reminder goes to the team's row owner (Kari).
    const game: DeliveryGame = { game_mode: 'texas_scramble', hole_segment: 'full', source_game_id: null };
    const players = [
      player('kari', { team_number: 1 }),
      player('ola', { team_number: 1 }),
      player('per', { team_number: 2 }),
      player('pia', { team_number: 2 }),
    ];

    expect(groups(players, rows('kari', 1, 18, 'per'), { game })).toEqual([
      { recipientId: 'kari', cardUserIds: ['kari', 'ola'], otherCardUserIds: [] },
    ]);
  });

  it('er lagets radeier en gjest, går lagets ene påminnelse til første medlem som kan få den', () => {
    // Round 2 residual: 'agjest' is lex-min, so the captain, but a guest can
    // never be reminded. The team still gets one reminder, not one each.
    const game: DeliveryGame = { game_mode: 'texas_scramble', hole_segment: 'full', source_game_id: null };
    const players = [
      player('agjest', { team_number: 1, is_guest: true }),
      player('bo', { team_number: 1 }),
      player('cato', { team_number: 1 }),
      player('per', { team_number: 2 }),
    ];

    expect(groups(players, rows('agjest', 1, 18, 'per'), { game })).toEqual([
      { recipientId: 'bo', cardUserIds: ['agjest', 'bo', 'cato'], otherCardUserIds: [] },
    ]);
  });

  it('en gjest som ingen aktiv kan levere for, gir ingen påminnelse', () => {
    const players = [player('gjest', { is_guest: true })];
    expect(groups(players, card('gjest', 'gjest'))).toEqual([]);
  });
});
