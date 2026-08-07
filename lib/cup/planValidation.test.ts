import { describe, it, expect } from 'vitest';
import { parseCupPlanForm } from './planValidation';

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
      expect(result).toHaveProperty('ok');
    },
  );

  it.each(['', 'bogus', 'KLASSISK', 'stableford'])(
    'rejects unknown preset %j with plan_preset',
    (presetId) => {
      expect(parseCupPlanForm(input({ presetId }))).toEqual({ error: 'plan_preset' });
    },
  );
});

describe('parseCupPlanForm — strategy', () => {
  it.each(['handicap', 'random'])('accepts strategy %s', (strategy) => {
    expect(parseCupPlanForm(input({ strategy }))).toHaveProperty('ok');
  });

  it.each(['', 'seeded', 'Handicap'])(
    'rejects unknown strategy %j with plan_strategy',
    (strategy) => {
      expect(parseCupPlanForm(input({ strategy }))).toEqual({ error: 'plan_strategy' });
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
      ok: {
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
      ok: {
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
      ).toEqual({ error: 'plan_sessions' });
    },
  );
});

describe('parseCupPlanForm — best-ball allowance', () => {
  it('empty → null', () => {
    const result = parseCupPlanForm(input({ bestBallAllowanceRaw: '' }));
    expect(result).toMatchObject({ ok: { bestBallAllowancePct: null } });
  });

  it.each([
    ['0', 0],
    ['85', 85],
    ['100', 100],
  ])('accepts integer %s', (raw, expected) => {
    const result = parseCupPlanForm(input({ bestBallAllowanceRaw: raw }));
    expect(result).toMatchObject({ ok: { bestBallAllowancePct: expected } });
  });

  it.each(['-1', '101', '85.5', 'abc'])(
    'rejects out-of-range / non-integer %j with plan_best_ball',
    (raw) => {
      expect(parseCupPlanForm(input({ bestBallAllowanceRaw: raw }))).toEqual({
        error: 'plan_best_ball',
      });
    },
  );

  it('whitespace-only → treated as empty → null', () => {
    const result = parseCupPlanForm(input({ bestBallAllowanceRaw: '   ' }));
    expect(result).toMatchObject({ ok: { bestBallAllowancePct: null } });
  });
});
