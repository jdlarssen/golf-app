import { describe, expect, it } from 'vitest';
import {
  flightDeliveryCandidates,
  type DeliveryGame,
  type DeliveryPlayer,
  type DeliveryScore,
} from './flightDelivery';

// Type A (#2200): who the one keeping score may deliver along with their own
// card. One test per rule row in the contract's edge-case table.

const SUBMITTED = '2026-09-27T10:00:00Z';
const WITHDRAWN = '2026-09-27T09:00:00Z';

function player(
  user_id: string,
  opts: Partial<Omit<DeliveryPlayer, 'user_id'>> = {},
): DeliveryPlayer {
  return {
    user_id,
    flight_number: null,
    team_number: null,
    withdrawn_at: null,
    submitted_at: null,
    is_guest: false,
    ...opts,
  };
}

/** A card with every hole in `holes` entered by `enteredBy`. */
function card(
  userId: string,
  enteredBy: string | null,
  holes: number[] = range(1, 18),
): DeliveryScore[] {
  return holes.map((hole_number) => ({
    user_id: userId,
    hole_number,
    strokes: 4,
    entered_by: enteredBy,
  }));
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const stableford: DeliveryGame = {
  game_mode: 'stableford',
  hole_segment: 'full',
  source_game_id: null,
};

describe('flightDeliveryCandidates', () => {
  it('nobody else in the game → empty', () => {
    expect(
      flightDeliveryCandidates('kari', {
        players: [player('kari')],
        scores: card('kari', 'kari'),
        game: stableford,
      }),
    ).toEqual([]);
  });

  it('one flightmate whose every hole I entered → that flightmate', () => {
    expect(
      flightDeliveryCandidates('kari', {
        players: [player('kari'), player('ola')],
        scores: [...card('kari', 'kari'), ...card('ola', 'kari')],
        game: stableford,
      }),
    ).toEqual(['ola']);
  });

  it('many flightmates → all of them, in roster order', () => {
    expect(
      flightDeliveryCandidates('kari', {
        players: [player('per'), player('kari'), player('ola')],
        scores: [...card('ola', 'kari'), ...card('per', 'kari')],
        game: stableford,
      }),
    ).toEqual(['per', 'ola']);
  });

  it('a guest whose card two people shared → candidate for both', () => {
    const scores = [
      ...card('gjest', 'kari', range(1, 9)),
      ...card('gjest', 'ola', range(10, 18)),
    ];
    const players = [player('kari'), player('ola'), player('gjest', { is_guest: true })];
    expect(flightDeliveryCandidates('kari', { players, scores, game: stableford })).toEqual([
      'gjest',
    ]);
    expect(flightDeliveryCandidates('ola', { players, scores, game: stableford })).toEqual([
      'gjest',
    ]);
  });

  it('a flightmate who entered one hole themselves → not a candidate', () => {
    const scores = [...card('ola', 'kari', range(1, 17)), ...card('ola', 'ola', [18])];
    expect(
      flightDeliveryCandidates('kari', {
        players: [player('kari'), player('ola')],
        scores,
        game: stableford,
      }),
    ).toEqual([]);
  });

  it('a hole with no entered_by (legacy row) → not a candidate', () => {
    const scores = [...card('ola', 'kari', range(1, 17)), ...card('ola', null, [18])];
    expect(
      flightDeliveryCandidates('kari', {
        players: [player('kari'), player('ola')],
        scores,
        game: stableford,
      }),
    ).toEqual([]);
  });

  it('17 of 18 holes → not a candidate', () => {
    expect(
      flightDeliveryCandidates('kari', {
        players: [player('kari'), player('ola')],
        scores: card('ola', 'kari', range(1, 17)),
        game: stableford,
      }),
    ).toEqual([]);
  });

  it('a hole row without strokes does not count as filled', () => {
    const scores = [
      ...card('ola', 'kari', range(1, 17)),
      { user_id: 'ola', hole_number: 18, strokes: null, entered_by: 'kari' },
    ];
    expect(
      flightDeliveryCandidates('kari', {
        players: [player('kari'), player('ola')],
        scores,
        game: stableford,
      }),
    ).toEqual([]);
  });

  it('a withdrawn flightmate → not a candidate', () => {
    expect(
      flightDeliveryCandidates('kari', {
        players: [player('kari'), player('ola', { withdrawn_at: WITHDRAWN })],
        scores: card('ola', 'kari'),
        game: stableford,
      }),
    ).toEqual([]);
  });

  it('an already delivered card → not a candidate', () => {
    expect(
      flightDeliveryCandidates('kari', {
        players: [player('kari'), player('ola', { submitted_at: SUBMITTED })],
        scores: card('ola', 'kari'),
        game: stableford,
      }),
    ).toEqual([]);
  });

  it('my own card being delivered already does not matter', () => {
    expect(
      flightDeliveryCandidates('kari', {
        players: [player('kari', { submitted_at: SUBMITTED }), player('ola')],
        scores: card('ola', 'kari'),
        game: stableford,
      }),
    ).toEqual(['ola']);
  });

  it('a withdrawn actor → empty', () => {
    expect(
      flightDeliveryCandidates('kari', {
        players: [player('kari', { withdrawn_at: WITHDRAWN }), player('ola')],
        scores: card('ola', 'kari'),
        game: stableford,
      }),
    ).toEqual([]);
  });

  it('an actor outside the roster → empty', () => {
    expect(
      flightDeliveryCandidates('fremmed', {
        players: [player('kari'), player('ola')],
        scores: card('ola', 'fremmed'),
        game: stableford,
      }),
    ).toEqual([]);
  });

  it('another flight (more than four, assigned flights) → not a candidate', () => {
    const players = [
      player('kari', { flight_number: 1 }),
      player('a', { flight_number: 1 }),
      player('b', { flight_number: 1 }),
      player('ola', { flight_number: 2 }),
      player('c', { flight_number: 2 }),
    ];
    const scores = [...card('a', 'kari'), ...card('ola', 'kari')];
    expect(flightDeliveryCandidates('kari', { players, scores, game: stableford })).toEqual([
      'a',
    ]);
  });

  it('more than four with no flights assigned → empty', () => {
    const players = ['kari', 'a', 'b', 'c', 'd'].map((id) => player(id));
    expect(
      flightDeliveryCandidates('kari', {
        players,
        scores: card('a', 'kari'),
        game: stableford,
      }),
    ).toEqual([]);
  });

  it('wolf with five → one flight, every full card I entered', () => {
    const players = ['kari', 'a', 'b', 'c', 'd'].map((id, i) =>
      player(id, { team_number: i + 1 }),
    );
    const scores = [...card('a', 'kari'), ...card('b', 'kari'), ...card('c', 'c')];
    expect(
      flightDeliveryCandidates('kari', {
        players,
        scores,
        game: { game_mode: 'wolf', hole_segment: 'full', source_game_id: null },
      }),
    ).toEqual(['a', 'b']);
  });

  describe('format gate', () => {
    const players = [
      player('kari', { team_number: 1 }),
      player('ola', { team_number: 1 }),
      player('per', { team_number: 2 }),
    ];
    const scores = [...card('ola', 'kari'), ...card('per', 'kari')];

    it.each([
      ['texas_scramble'],
      ['foursomes_matchplay'],
      ['patsome'],
    ] as const)('%s (one ball per team) → empty', (game_mode) => {
      expect(
        flightDeliveryCandidates('kari', {
          players,
          scores,
          game: { game_mode, hole_segment: 'full', source_game_id: null },
        }),
      ).toEqual([]);
    });

    it('a split-cup half (front9/back9) → empty', () => {
      expect(
        flightDeliveryCandidates('kari', {
          players,
          scores,
          game: { game_mode: 'best_ball', hole_segment: 'back9', source_game_id: null },
        }),
      ).toEqual([]);
    });

    it('a derived game → empty', () => {
      expect(
        flightDeliveryCandidates('kari', {
          players,
          scores,
          game: { game_mode: 'singles_matchplay', hole_segment: 'full', source_game_id: 'host' },
        }),
      ).toEqual([]);
    });

    it('best ball (each player their own ball) still delivers', () => {
      expect(
        flightDeliveryCandidates('kari', {
          players,
          scores,
          game: { game_mode: 'best_ball', hole_segment: 'full', source_game_id: null },
        }),
      ).toEqual(['ola', 'per']);
    });
  });
});
