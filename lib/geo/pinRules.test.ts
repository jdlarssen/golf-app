import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  MAX_PIN_ACCURACY_M,
  MAX_DISPLAY_DISTANCE_M,
  PIN_GATE_MAX_PINS,
  PIN_GATE_WINDOW_DAYS,
  shouldShowDistance,
  isAcceptablePinAccuracy,
} from './pinRules';

/**
 * Type A — pure logic (#1210). pinRules.ts is the TypeScript home for the pin
 * rules; the gate constants (PIN_GATE_*) are mirrored in the DB trigger
 * `green_pins_gate` (0142) with a parity test below the unit cases — one rule,
 * two homes (AGENTS.md trap #4, 0119 pattern: the DB is the outer guard).
 * The accuracy cap deliberately has ONE home (server action; DB CHECK is only
 * a >= 0 sanity bound) — see the contract's Key Decisions.
 */

describe('pin rule constants (TS home)', () => {
  it('locks the agreed values from the design doc', () => {
    expect(MAX_PIN_ACCURACY_M).toBe(30);
    expect(MAX_DISPLAY_DISTANCE_M).toBe(1000);
    expect(PIN_GATE_MAX_PINS).toBe(3);
    expect(PIN_GATE_WINDOW_DAYS).toBe(30);
  });
});

describe('shouldShowDistance — the ≤1 km display threshold', () => {
  it.each([
    ['0 m (standing on the pin)', 0, true],
    ['142 m (a normal approach)', 142, true],
    ['exactly 1000 m (boundary, inclusive)', 1000, true],
    ['just past 1 km', 1000.01, false],
    ['12 km (sofa at home)', 12000, false],
    ['negative distance (corrupt input)', -1, false],
    ['NaN (no position yet)', Number.NaN, false],
    ['Infinity', Number.POSITIVE_INFINITY, false],
  ])('%s → %s', (_label, distanceM, expected) => {
    expect(shouldShowDistance(distanceM)).toBe(expected);
  });
});

describe('isAcceptablePinAccuracy — the 30 m pin quality cap', () => {
  it.each([
    ['perfect fix (0 m)', 0, true],
    ['good GPS (8 m)', 8, true],
    ['exactly 30 m (boundary, inclusive)', 30, true],
    ['just past the cap', 30.01, false],
    ['weak signal (65 m)', 65, false],
    ['negative accuracy (corrupt)', -5, false],
    ['missing accuracy (null)', null, false],
    ['missing accuracy (undefined)', undefined, false],
    ['NaN', Number.NaN, false],
  ])('%s → %s', (_label, accuracyM, expected) => {
    expect(isAcceptablePinAccuracy(accuracyM as number | null | undefined)).toBe(
      expected,
    );
  });
});

/**
 * Trap #4 agreement test (cf. lib/courses/teeRatingDbCheck.test.ts): the gate
 * constants live in TWO homes — pinRules.ts (app layer) and the plpgsql
 * constants inside `green_pins_gate` in 0142 (the outer guard against hostile
 * mass-insert). A change to one without the other must fail loudly here.
 */
describe('pin gate constants: TS ↔ DB trigger parity (trap #4)', () => {
  const MIGRATION_FILE = path.resolve(
    __dirname,
    '../../supabase/migrations/0142_green_pins.sql',
  );

  function extractTriggerConstant(name: string): number {
    const content = fs.readFileSync(MIGRATION_FILE, 'utf-8');
    const m = content.match(
      new RegExp(`${name}\\s+constant\\s+int\\s*:=\\s*(\\d+)`, 'i'),
    );
    if (!m) throw new Error(`Could not parse ${name} in 0142_green_pins.sql`);
    return Number(m[1]);
  }

  it('PIN_GATE_MAX_PINS matches the trigger', () => {
    expect(extractTriggerConstant('pin_gate_max_pins')).toBe(PIN_GATE_MAX_PINS);
  });

  it('PIN_GATE_WINDOW_DAYS matches the trigger', () => {
    expect(extractTriggerConstant('pin_gate_window_days')).toBe(
      PIN_GATE_WINDOW_DAYS,
    );
  });
});
