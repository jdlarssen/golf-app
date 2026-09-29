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
      { recipientId: 'kari', cardUserIds: ['kari'], othersCount: 0 },
    ]);
  });

  it('føreren av tre kort får én samlet påminnelse, gjestekortet med', () => {
    const players = [player('kari'), player('ola'), player('gjest', { is_guest: true })];
    const scores = [...card('kari', 'kari'), ...card('ola', 'kari'), ...card('gjest', 'kari')];

    expect(groups(players, scores)).toEqual([
      { recipientId: 'kari', cardUserIds: ['kari', 'ola', 'gjest'], othersCount: 2 },
    ]);
  });

  it('føreren har levert sitt eget: påminnelsen gjelder bare makkerkortene', () => {
    const players = [player('kari', { submitted_at: OLD }), player('ola')];
    const scores = [...card('kari', 'kari'), ...card('ola', 'kari')];

    expect(groups(players, scores)).toEqual([
      { recipientId: 'kari', cardUserIds: ['ola'], othersCount: 1 },
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
      { recipientId: 'ola', cardUserIds: ['ola'], othersCount: 0 },
    ]);
  });

  it('siste hull tastet av en som ikke kan levere kortet: eieren får påminnelsen', () => {
    // Ola keyed 1–17 himself and Kari keyed 18. Kari may not deliver Ola's
    // card (flightDeliveryCandidates), so a reminder to her would be a dead end.
    const players = [player('kari'), player('ola')];
    const scores = card('ola', 'ola', { lastBy: 'kari' });

    expect(groups(players, scores)).toEqual([
      { recipientId: 'ola', cardUserIds: ['ola'], othersCount: 0 },
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
      { recipientId: 'kari', cardUserIds: ['gjest'], othersCount: 1 },
    ]);
  });

  it('split-cup: en front9-spiller med ulevert back9-søsken purres ikke her', () => {
    const front9: DeliveryGame = { game_mode: 'stableford', hole_segment: 'front9', source_game_id: null };
    const scores = card('kari', 'kari', { holes: 9 });

    expect(groups([player('kari')], scores, { game: front9, siblings: new Set(['kari']) })).toEqual([]);
    expect(groups([player('kari')], scores, { game: front9 })).toEqual([
      { recipientId: 'kari', cardUserIds: ['kari'], othersCount: 0 },
    ]);
  });

  it('ett-balls-lag: lagkameratens kort går til den som førte, og teller ikke som andres', () => {
    const scramble: DeliveryGame = { game_mode: 'texas_scramble', hole_segment: 'full', source_game_id: null };
    // Kari is the captain (lex-min on team 1) and holds the team's rows.
    const players = [player('kari', { team_number: 1 }), player('ola', { team_number: 1 })];
    const scores = card('kari', 'kari');

    expect(groups(players, scores, { game: scramble })).toEqual([
      { recipientId: 'kari', cardUserIds: ['kari', 'ola'], othersCount: 0 },
    ]);
  });

  it('en gjest som ingen aktiv kan levere for, gir ingen påminnelse', () => {
    const players = [player('gjest', { is_guest: true })];
    expect(groups(players, card('gjest', 'gjest'))).toEqual([]);
  });
});
