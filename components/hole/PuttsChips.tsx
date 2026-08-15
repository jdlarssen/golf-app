'use client';

import { useState, type CSSProperties, type JSX } from 'react';
import { useTranslations } from 'next-intl';

// Matches the scores.putts CHECK (0..10) from migration 0123.
const MAX_PUTTS = 10;
// Chips 0–4 are the common range; «5+» expands a compact stepper for 5..10.
const CHIP_VALUES = [0, 1, 2, 3, 4] as const;
const PLUS_THRESHOLD = 5;

// Stepper-knappene TEGNER 36×36, men TREFFER 44×44 via `.tap-extend` (#1356,
// tatt i bruk her i #1584): et usynlig ::after henger 4px utenfor padding-
// boksen på alle fire kanter (36 + 2×4 = 44). Knappene har ingen border, så
// inset regnes fra hele 36×36-boksen. Overlapp: tallet imellom står 8px unna
// (`gap-2`) og er ikke klikkbart, og pillen har `px-2` (8px), så utvidelsen
// holder seg innenfor den — ingen av chip-ene ved siden av mister treff.
const STEPPER_TAP_STYLE: CSSProperties = {
  ['--tap-extend' as string]: '-4px',
};

export interface PuttsChipsProps {
  /** Currently recorded putts for this hole, or null when nothing is set yet. */
  value: number | null;
  /** Name for aria-labels (the hole label, e.g. «Hull 9»). */
  ariaName: string;
  disabled?: boolean;
  onSelect: (next: number) => void;
}

/**
 * One-tap putt entry (#1290 del B) — the back-fill counterpart to the per-hole
 * `PuttsField` stepper. A row of chips 0/1/2/3/4/«5+»; picking «5+» expands a
 * compact stepper (5..10) so the rare high count is still one or two taps and
 * never needs a keyboard. Purely presentational: the caller owns the value and
 * decides where the write goes (writeScore while active, backfillPutts once
 * finished).
 */
export function PuttsChips({
  value,
  ariaName,
  disabled = false,
  onSelect,
}: PuttsChipsProps): JSX.Element {
  const t = useTranslations('holes.puttsChips');
  const [plusOpen, setPlusOpen] = useState(value != null && value >= PLUS_THRESHOLD);

  const showStepper = plusOpen || (value != null && value >= PLUS_THRESHOLD);
  const stepperValue = value != null && value >= PLUS_THRESHOLD ? value : PLUS_THRESHOLD;

  function base(active: boolean): string {
    return [
      'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full',
      'px-3.5 font-sans text-sm font-medium tabular-nums transition-colors',
      active
        ? 'bg-primary text-white'
        : 'border border-border bg-surface text-text hover:bg-primary-soft',
      disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    ].join(' ');
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="putts-chips">
      {CHIP_VALUES.map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-pressed={value === n}
          aria-label={t('chipAriaLabel', { count: n, name: ariaName })}
          className={base(value === n)}
          onClick={() => {
            setPlusOpen(false);
            onSelect(n);
          }}
        >
          {n}
        </button>
      ))}

      {!showStepper ? (
        <button
          type="button"
          disabled={disabled}
          aria-label={t('plusAriaLabel', { name: ariaName })}
          className={base(false)}
          onClick={() => setPlusOpen(true)}
        >
          {t('plusLabel')}
        </button>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2">
          <button
            type="button"
            disabled={disabled || stepperValue <= PLUS_THRESHOLD}
            aria-label={t('decreaseAriaLabel', { name: ariaName })}
            className="tap-extend flex h-9 w-9 items-center justify-center rounded-full text-lg text-text disabled:opacity-40"
            style={STEPPER_TAP_STYLE}
            onClick={() => onSelect(Math.max(PLUS_THRESHOLD, stepperValue - 1))}
          >
            −
          </button>
          <span
            className="min-w-[1.25rem] text-center font-sans text-sm font-semibold tabular-nums text-text"
            aria-label={t('valueAriaLabel', { count: stepperValue })}
          >
            {stepperValue}
          </span>
          <button
            type="button"
            disabled={disabled || stepperValue >= MAX_PUTTS}
            aria-label={t('increaseAriaLabel', { name: ariaName })}
            className="tap-extend flex h-9 w-9 items-center justify-center rounded-full text-lg text-text disabled:opacity-40"
            style={STEPPER_TAP_STYLE}
            onClick={() => onSelect(Math.min(MAX_PUTTS, stepperValue + 1))}
          >
            +
          </button>
        </span>
      )}
    </div>
  );
}
