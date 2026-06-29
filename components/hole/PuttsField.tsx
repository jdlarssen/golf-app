'use client';

import type { CSSProperties, JSX } from 'react';
import { useTranslations } from 'next-intl';

// Matches the scores.putts CHECK (0..10) from migration 0123. Kept in sync with
// the DB bound so the UI can never offer a value the column would reject.
const MAX_PUTTS = 10;

export interface PuttsFieldProps {
  playerId: string;
  name: string;
  /** Current putt count, or null when nothing is recorded yet («—»). */
  putts: number | null;
  disabled?: boolean;
  /** next = null clears the recorded putt count back to «—». */
  onSetPutts: (playerId: string, next: number | null) => void;
}

/**
 * Opt-in per-hole putt entry (#939). Rendered directly beneath the score number
 * (in the ScoreCard's score column) when «Registrer putter» is on, for individual
 * stroke/stableford formats only — it drops into the empty height beside the
 * three-button stepper, so it adds no card height. A compact [−] value [+]
 * stepper with a small label: from «—» the first + records 2 putts (regulation,
 * the common case — one tap), − adjusts down and at 0 clears back to «—».
 * Strokes and putts are independent — changing one never touches the other
 * (the merge lives in writeScore).
 */
export function PuttsField(props: PuttsFieldProps): JSX.Element {
  const t = useTranslations('holes.putts');
  const { playerId, name, putts, disabled = false, onSetPutts } = props;

  function decrease() {
    if (disabled) return;
    if (putts == null) return; // already unrecorded
    if (putts <= 0) {
      onSetPutts(playerId, null); // 0 → clear back to «—»
      return;
    }
    onSetPutts(playerId, putts - 1);
  }

  function increase() {
    if (disabled) return;
    if (putts == null) {
      onSetPutts(playerId, 2); // «—» → regulation 2-putt (common case, one tap)
      return;
    }
    if (putts >= MAX_PUTTS) return;
    onSetPutts(playerId, putts + 1);
  }

  // Compact column tucked under the score number. Stepper on top, tiny label
  // below. Buttons are 34×30 — deliberately smaller than the score stepper to
  // fit the free height beside it; a flagged trade-off against the ≥44px tap
  // guideline that's how this placement adds zero card height.
  const columnStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    opacity: disabled ? 0.6 : 1,
  };

  const labelStyle: CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  };

  const btnStyle: CSSProperties = {
    width: 34,
    height: 30,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text)',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };

  const valueStyle: CSSProperties = {
    minWidth: 18,
    textAlign: 'center',
    fontFamily: 'var(--font-serif)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 18,
    fontWeight: 500,
    color: putts == null ? 'var(--score-unset-fg, var(--text-muted))' : 'var(--text)',
  };

  return (
    <div style={columnStyle} data-testid="putts-field">
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <button
          type="button"
          aria-label={t('decreaseAriaLabel', { name })}
          onClick={decrease}
          disabled={disabled || putts == null}
          style={{ ...btnStyle, opacity: disabled || putts == null ? 0.5 : 1 }}
        >
          −
        </button>
        <span
          data-testid="putts-value"
          aria-label={putts == null ? undefined : t('valueAriaLabel', { count: putts })}
          style={valueStyle}
        >
          {putts == null ? '—' : putts}
        </span>
        <button
          type="button"
          aria-label={t('increaseAriaLabel', { name })}
          onClick={increase}
          disabled={disabled || putts === MAX_PUTTS}
          style={{ ...btnStyle, opacity: disabled || putts === MAX_PUTTS ? 0.5 : 1 }}
        >
          +
        </button>
      </div>
      <span style={labelStyle}>{t('fieldLabel')}</span>
    </div>
  );
}
