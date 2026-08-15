'use client';

import { useEffect } from 'react';
import type { CSSProperties, JSX, MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useModalFocus } from '@/hooks/useModalFocus';

export interface SpecificValueSheetProps {
  open: boolean;
  par: number;
  onPick: (value: number) => void;
  onClear: () => void;
  onClose: () => void;
}

// The whole legal range in one grid: a blow-up score is one tap, not seven on
// the stepper. Mirrors ScoreCard.tsx's 15-stroke cap — kept local since that
// const is not exported.
const MAX_STROKES = 15;
const VALUES: number[] = Array.from(
  { length: MAX_STROKES },
  (_, i) => i + 1,
);

const backdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(15,22,18,0.4)',
  display: 'flex',
  alignItems: 'flex-end',
  zIndex: 10,
};

const sheetStyle: CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
  padding: '20px 18px 24px',
};

const handleStyle: CSSProperties = {
  width: 36,
  height: 4,
  background: 'var(--border)',
  borderRadius: 9999,
  margin: '0 auto 16px',
};

const kickerStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.20em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  marginBottom: 14,
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 8,
};

const buttonStyle: CSSProperties = {
  padding: '14px 0',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--bg)',
  fontFamily: 'var(--font-serif)',
  fontWeight: 600,
  fontSize: 22,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text)',
  cursor: 'pointer',
};

// Marks the par button so the eye finds its anchor in a 16-button grid.
// Visual only — no aria or label difference (a screen reader gets the par
// from the hole header). Forest tokens, never --accent (winners only).
const parButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: '1px solid var(--primary)',
  background: 'var(--surface-2)',
};

const captionStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  textAlign: 'center',
  marginTop: 14,
};

export function SpecificValueSheet(
  props: SpecificValueSheetProps,
): JSX.Element | null {
  const { open, par, onPick, onClear, onClose } = props;
  const t = useTranslations('holes.scoreCard');

  // Fokus inn i arket ved åpning, Tab holdes innenfor, og fokus tilbake på
  // ⋯-knappen ved lukking (#1357).
  const { containerRef } = useModalFocus<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleSheetClick(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
  }

  return (
    <div
      style={backdropStyle}
      onClick={onClose}
      data-testid="specific-value-backdrop"
    >
      {/* tabIndex={-1}: useModalFocus faller tilbake på container.focus() når
          ingenting inni arket er fokuserbart — uten den er en <div> ikke
          fokuserbar, og fallbacken feiler stille (aldri i tab-rekkefølgen). */}
      <div
        ref={containerRef}
        tabIndex={-1}
        style={sheetStyle}
        onClick={handleSheetClick}
        data-testid="specific-value-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('specificScoreAriaLabel')}
      >
        <div style={handleStyle} aria-hidden="true" />
        <div style={kickerStyle}>{t('specificScoreTitle')}</div>
        <div style={gridStyle}>
          {VALUES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                onPick(v);
                onClose();
              }}
              style={v === par ? parButtonStyle : buttonStyle}
              aria-label={t('setScoreToAriaLabel', { value: v })}
            >
              {v}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            style={buttonStyle}
            aria-label={t('clearScoreAriaLabel')}
          >
            X
          </button>
        </div>
        <div style={captionStyle}>{t('specificScoreCaption')}</div>
      </div>
    </div>
  );
}
