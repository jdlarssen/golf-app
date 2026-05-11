'use client';

import { useEffect } from 'react';
import type { CSSProperties, JSX, MouseEvent } from 'react';
import type { InputMode } from '@/lib/hooks/useInputMode';

export interface SettingsSheetProps {
  open: boolean;
  mode: InputMode;
  onPick: (mode: InputMode) => void;
  onClose: () => void;
}

interface Option {
  id: InputMode;
  title: string;
  body: string;
}

const OPTIONS: Option[] = [
  {
    id: 'swipe',
    title: 'Klikk og dra',
    body: 'Tap kort = par. Sveip opp/ned for +1/−1. Raskest.',
  },
  {
    id: 'buttons',
    title: '+ / − knapper',
    body: 'Tap kort = par. Bruk knapper på siden for justering. Best for små skjermer.',
  },
];

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
  marginBottom: 6,
};

const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 20,
  fontWeight: 500,
  letterSpacing: '-0.01em',
  color: 'var(--text)',
  marginBottom: 18,
};

function cardStyle(selected: boolean): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '14px 16px',
    marginBottom: 8,
    background: selected ? '#F0EDE5' : 'var(--surface)',
    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 12,
    cursor: 'pointer',
  };
}

function radioStyle(selected: boolean): CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: `2px solid ${selected ? 'var(--accent)' : '#C7BFAA'}`,
    background: selected ? 'var(--accent)' : 'transparent',
    display: 'inline-block',
    position: 'relative',
    flexShrink: 0,
  };
}

const radioInnerStyle: CSSProperties = {
  position: 'absolute',
  inset: 3,
  background: 'var(--primary)',
  borderRadius: '50%',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 4,
};

const optionTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text)',
};

const optionBodyStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  marginLeft: 26,
  lineHeight: 1.45,
};

const captionStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  textAlign: 'center',
  marginTop: 10,
};

export function SettingsSheet(props: SettingsSheetProps): JSX.Element | null {
  const { open, mode, onPick, onClose } = props;

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
      data-testid="settings-backdrop"
    >
      <div
        style={sheetStyle}
        onClick={handleSheetClick}
        data-testid="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Innstillinger"
      >
        <div style={handleStyle} aria-hidden="true" />
        <div style={kickerStyle}>INNSTILLINGER</div>
        <div style={titleStyle}>Hvordan vil du legge inn score?</div>
        <div role="radiogroup" aria-label="Inntastingsmodus">
          {OPTIONS.map((opt) => {
            const selected = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onPick(opt.id);
                  onClose();
                }}
                style={cardStyle(selected)}
                role="radio"
                aria-checked={selected}
              >
                <div style={rowStyle}>
                  <span style={radioStyle(selected)}>
                    {selected ? <span style={radioInnerStyle} /> : null}
                  </span>
                  <span style={optionTitleStyle}>{opt.title}</span>
                </div>
                <div style={optionBodyStyle}>{opt.body}</div>
              </button>
            );
          })}
        </div>
        <div style={captionStyle}>Valget lagres på enheten.</div>
      </div>
    </div>
  );
}
