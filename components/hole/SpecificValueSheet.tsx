'use client';

import { useEffect } from 'react';
import type { CSSProperties, JSX, MouseEvent } from 'react';

export interface SpecificValueSheetProps {
  open: boolean;
  par: number;
  onPick: (value: number) => void;
  onClear: () => void;
  onClose: () => void;
}

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

  // Quick-pick: only under-par + par. The +/− stepper handles bogey-and-worse
  // efficiently, and the X-button clears a score that was set by mistake.
  const values: number[] = [par - 2, par - 1, par].filter((v) => v >= 1);

  return (
    <div
      style={backdropStyle}
      onClick={onClose}
      data-testid="specific-value-backdrop"
    >
      <div
        style={sheetStyle}
        onClick={handleSheetClick}
        data-testid="specific-value-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Spesifikk score"
      >
        <div style={handleStyle} aria-hidden="true" />
        <div style={kickerStyle}>SPESIFIKK SCORE</div>
        <div style={gridStyle}>
          {values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                onPick(v);
                onClose();
              }}
              style={buttonStyle}
              aria-label={`Sett score til ${v}`}
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
            aria-label="Fjern score"
          >
            X
          </button>
        </div>
        <div style={captionStyle}>Tap for å sette. X fjerner.</div>
      </div>
    </div>
  );
}
