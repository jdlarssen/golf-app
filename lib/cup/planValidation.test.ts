import { describe, it, expect } from 'vitest';
import { parseCupPlanForm, normalizeCustomSessions } from './planValidation';

/**
 * Type A (pure logic) tests for the Oppsett-room form validator (#1472).
 *
 * `parseCupPlanForm` validates only the DB-independent fields (preset, strategy,
 * custom sessions, best-ball %). Course/tee existence and tee-off parsing live
 * in the server action (`planActions.ts`) — not here. The error CODES are a
 * fixed contract shared with the UI chunk; these tests lock them.
 */

/** A valid non-custom form; per-case overrides break exactly one field. */
function input(overrides: Partial<Parameters<typeof parseCupPlanForm>[0]> = {}) {
  return {
    presetId: 'klassisk',
    strategy: 'handicap',
    customSessionsRaw: '',
    bestBallAllowanceRaw: '',
    ...overrides,
  };
}

describe('parseCupPlanForm — preset', () => {
  it.each(['klassisk', 'fourball-singler', 'singler', 'splittet-cup-dag', 'tilpasset'])(
    'accepts built-in / tilpasset preset %s',
    (presetId) => {
      // 'tilpasset' needs a non-empty session list to be valid.
      const customSessionsRaw =
        presetId === 'tilpasset' ? '["singles_matchplay"]' : '';
      const result = parseCupPlanForm(input({ presetId, customSessionsRaw }));
      expect(result).toHaveProperty('ok', true);
    },
  );

  it.each(['', 'bogus', 'KLASSISK', 'stableford'])(
    'rejects unknown preset %j with plan_preset',
    (presetId) => {
      expect(parseCupPlanForm(input({ presetId }))).toEqual({
        ok: false,
        error: 'plan_preset',
      });
    },
  );
});

describe('parseCupPlanForm — strategy', () => {
  it.each(['handicap', 'random'])('accepts strategy %s', (strategy) => {
    expect(parseCupPlanForm(input({ strategy }))).toHaveProperty('ok', true);
  });

  it.each(['', 'seeded', 'Handicap'])(
    'rejects unknown strategy %j with plan_strategy',
    (strategy) => {
      expect(parseCupPlanForm(input({ strategy }))).toEqual({
        ok: false,
        error: 'plan_strategy',
      });
    },
  );
});

describe('parseCupPlanForm — custom sessions', () => {
  it('parses a valid tilpasset session list', () => {
    const result = parseCupPlanForm(
      input({
        presetId: 'tilpasset',
        customSessionsRaw: '["foursomes_matchplay","singles_matchplay"]',
      }),
    );
    expect(result).toEqual({
      ok: true,
      values: {
        presetId: 'tilpasset',
        strategy: 'handicap',
        customSessions: ['foursomes_matchplay', 'singles_matchplay'],
        bestBallAllowancePct: null,
      },
    });
  });

  it('ignores customSessions for a non-tilpasset preset (normalizes to null)', () => {
    const result = parseCupPlanForm(
      input({
        presetId: 'klassisk',
        // Garbage here must NOT matter — it is only read for 'tilpasset'.
        customSessionsRaw: 'not-even-json',
      }),
    );
    expect(result).toEqual({
      ok: true,
      values: {
        presetId: 'klassisk',
        strategy: 'handicap',
        customSessions: null,
        bestBallAllowancePct: null,
      },
    });
  });

  it.each([
    ['empty array', '[]'],
    ['empty string', ''],
    ['malformed json', '["singles_matchplay"'],
    ['unknown session member', '["scramble"]'],
    ['non-array json', '"singles_matchplay"'],
    ['array with a non-string', '["singles_matchplay", 3]'],
  ])(
    'rejects tilpasset with %s → plan_sessions',
    (_label, customSessionsRaw) => {
      expect(
        parseCupPlanForm(input({ presetId: 'tilpasset', customSessionsRaw })),
      ).toEqual({ ok: false, error: 'plan_sessions' });
    },
  );
});

describe('parseCupPlanForm — best-ball allowance', () => {
  it('empty → null', () => {
    const result = parseCupPlanForm(input({ bestBallAllowanceRaw: '' }));
    expect(result).toMatchObject({ ok: true, values: { bestBallAllowancePct: null } });
  });

  it.each([
    ['0', 0],
    ['85', 85],
    ['100', 100],
  ])('accepts integer %s', (raw, expected) => {
    const result = parseCupPlanForm(input({ bestBallAllowanceRaw: raw }));
    expect(result).toMatchObject({ ok: true, values: { bestBallAllowancePct: expected } });
  });

  it.each(['-1', '101', '85.5', 'abc'])(
    'rejects out-of-range / non-integer %j with plan_best_ball',
    (raw) => {
      expect(parseCupPlanForm(input({ bestBallAllowanceRaw: raw }))).toEqual({
        ok: false,
        error: 'plan_best_ball',
      });
    },
  );

  it('whitespace-only → treated as empty → null', () => {
    const result = parseCupPlanForm(input({ bestBallAllowanceRaw: '   ' }));
    expect(result).toMatchObject({ ok: true, values: { bestBallAllowancePct: null } });
  });
});

describe('normalizeCustomSessions (#1488 K7)', () => {
  it('keeps only valid CupSessionFormat strings', () => {
    expect(
      normalizeCustomSessions([
        'singles_matchplay',
        'not_a_format',
        'fourball_matchplay',
        42,
        null,
      ]),
    ).toEqual(['singles_matchplay', 'fourball_matchplay']);
  });

  it('non-array input → empty list', () => {
    expect(normalizeCustomSessions(null)).toEqual([]);
    expect(normalizeCustomSessions('singles_matchplay')).toEqual([]);
  });

  it('empty array → empty list', () => {
    expect(normalizeCustomSessions([])).toEqual([]);
  });
});
