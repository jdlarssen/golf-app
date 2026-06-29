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
 * Opt-in per-hole putt entry (#939). Rendered just beneath a ScoreCard when the
 * player has turned «Registrer putter» on, for individual stroke/stableford
 * formats only. A compact [−] value [+] stepper: from «—» the first + records 1
 * putt; − at 0 clears back to «—». Strokes and putts are independent — clearing
 * or changing one never touches the other (the merge lives in writeScore).
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
      onSetPutts(playerId, 1); // «—» → first putt
      return;
    }
    if (putts >= MAX_PUTTS) return;
    onSetPutts(playerId, putts + 1);
  }

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    // Tuck under the card it belongs to: pull up over the list gap and indent.
    margin: '-6px 8px 0',
    padding: '6px 12px 8px',
    borderRadius: '0 0 14px 14px',
    background: 'var(--surface-subtle, var(--surface))',
    border: '1px solid var(--border)',
    borderTop: 'none',
    opacity: disabled ? 0.6 : 1,
  };

  const labelStyle: CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  };

  const btnStyle: CSSProperties = {
    width: 44,
    height: 44,
    border: '1px solid var(--border)',
    borderRadius: 11,
    background: 'var(--surface)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    fontSize: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text)',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };

  const valueStyle: CSSProperties = {
    minWidth: 28,
    textAlign: 'center',
    fontFamily: 'var(--font-serif)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 20,
    fontWeight: 500,
    color: putts == null ? 'var(--score-unset-fg, var(--text-muted))' : 'var(--text)',
  };

  return (
    <div style={rowStyle} data-testid="putts-field">
      <span style={labelStyle}>{t('fieldLabel')}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
    </div>
  );
}
